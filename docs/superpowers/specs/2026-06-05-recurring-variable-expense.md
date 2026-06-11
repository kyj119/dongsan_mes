# 정기 변동비용(준고정비) 관리 — 설계 spec

> 작성: 2026-06-05 | 상태(2026-06-11 정정): **Phase 1~3 구현·배포 완료**(마이그 0299, `expenseEstimator.ts`, cashflowEngine 분기 — 커밋 8a786c4). **잔여 Phase 4(실적 정산·variance)·5(UI) = 카드예측 spec(`2026-06-11-card-cashflow-forecast.md`)과 동세션 진행 확정** — 같은 cashflowEngine·카드/은행 매칭 영역. 선행 조건: split-billing P5-continued(cashflowEngine 수정 중) 완료 후
> 배경: 통신비·전기세처럼 매달 정기 발생하나 금액이 변동되는 비용을 "고정비처럼" 관리

## 1. 문제 정의

통신비·전기세는 회계상 **고정비가 아니라 준변동비(mixed cost)** — 기본요금(고정) + 사용량(변동).
"고정비로 관리"의 실제 의미 = 정기적으로 반드시 나가는 돈이니 자금/예산에서 **고정비처럼 미리 잡아두되, 변하는 금액을 어떻게 추정·정산하느냐**.

## 2. 확정 요구사항 (사용자 합의 2026-06-05)

| 항목 | 결정 |
|------|------|
| 1차 목적 | ① 자금 예측 ② 손익·원가 ③ 단순 기록·추적 (예산통제 제외) |
| 추정 방식 | **과거 실적 자동 추정** (신규 입력 0건) |
| 데이터 모델 | **fixed_expenses 확장 + actuals 이력 테이블** |

## 3. 핵심 아키텍처 — 추정→실적 정산(reconciliation) 루프

```
과거 실적(card_transactions + bank_transactions, category별)
   │  ① 추정 엔진 (AVG_3M / SAME_MONTH_LAST_YEAR / LAST)
   ▼
추정치 ──② cashflowEngine 온더플라이 주입──▶ 캐시플로·추정자금일보   [목적1]
   │
   └──③ 실제 결제 매칭(카드/은행) ──▶ 확정치 대체 + variance 기록
                                          ├─▶ 월별 추정vs실적 이력  [목적3]
                                          └─▶ 월 고정비 집계·원가배부 [목적2]
```

## 4. 추정 엔진

신규 입력 없이 기존 분류 실적 재활용. 소스: `card_transactions` + `bank_transactions(matched_category_id)` category별 월합계.

| 항목 | 권장 추정법 | 이유 |
|------|-----------|------|
| 통신비 | 직전 3개월 평균 `AVG_3M` | 변동 작음 |
| 전기세 | **동월 전년 `SAME_MONTH_LAST_YEAR`** | 냉난방 계절성 → 평균은 여름·겨울 왜곡 |
| 가스·수도 | 동월 전년 / 6개월 평균 | 계절성 중간 |

## 5. 데이터 모델

```sql
-- fixed_expenses 확장
ALTER TABLE fixed_expenses ADD COLUMN amount_type TEXT DEFAULT 'FIXED';   -- FIXED | ESTIMATED
ALTER TABLE fixed_expenses ADD COLUMN estimate_method TEXT;               -- AVG_3M | SAME_MONTH_LAST_YEAR | LAST
ALTER TABLE fixed_expenses ADD COLUMN linked_category_id INTEGER;         -- → expense_categories

-- 월별 추정 vs 실적 이력 (손익·추적·추정학습 공용)
CREATE TABLE recurring_expense_actuals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fixed_expense_id INTEGER NOT NULL,
  period TEXT NOT NULL,            -- YYYY-MM
  estimated_amount INTEGER,
  actual_amount INTEGER,
  actual_source TEXT,             -- CARD | BANK | MANUAL
  variance INTEGER,               -- actual - estimated
  entity_id INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);
```

- `fixed_expenses.amount`: ESTIMATED일 때 "최근 산출 추정치 캐시"로 사용.
- 실적 확정 시 actuals 이력에 기록 → 손익·추적·추정정확도 학습 모두 이 이력으로.

## 6. Phase 계획

| Phase | 내용 | 세션 |
|------|------|------|
| 1 | 마이그레이션 (fixed_expenses 확장 + actuals 테이블) | 1차 |
| 2 | 추정 엔진 util (category 실적 → 추정치) | 1차 |
| 3 | 자금예측 통합 (cashflowEngine 온더플라이 ESTIMATED 주입, **이중계산 방지**) | 1차 |
| 4 | 추정→실적 정산 (카드/은행 매칭 시 actuals 기록 + variance) + **은행 분류 키워드 부분일치 보강** | 2차 |

> **Phase 4 필수 보강 (2026-06-11 용준님 케이스)**: 은행 출금처명이 가변 suffix(예: `KT1234567801`→`KT1234567802` 매달 변동)면 현행 정확일치 룰(`bank.ts:442` Map)이 매달 깨짐 → 카드의 `expense_auto_rules` 패턴(`merchant_name.includes(keyword)`)과 동일한 **키워드 부분일치**를 은행 카테고리 분류에도 적용. "KT" 룰 1개로 전 변형 자동 분류 → 정산 루프가 완전 무인화됨.
| 5 | UI (고정비 탭 추정 항목 뱃지 + 월별 추정vs실적 추이 + 손익 집계) | 2차 |

## 7. 기존 인프라 (재활용)

| 자산 | 위치 |
|------|------|
| fixed_expenses (UTILITY category) | migrations/0071_cash_flow_system.sql |
| expense_categories (통신비·전기비 등 16종) | migrations/0231_corporate_cards.sql |
| card_transactions / bank_transactions + 매칭룰 | 0231, 0270 |
| cashflowEngine.buildCashflowDays (온더플라이) | src/utils/cashflowEngine.ts |
| /fixed-expenses, /projection, /calendar | src/routes/cashFlow.ts |

## 8. 벤치마크 (참고)

| 방식 | 사례 | 채택 |
|------|------|:---:|
| 정기지출 + 추정→실적 정산 | QuickBooks/Xero recurring, Float·Pulse 캐시플로 | ◎ 본 설계 |
| 고정+변동 분해(High-Low/회귀) | 관리회계 원가행태, SAP 원가센터 | △ 과함 |
| 예산 통제(Budget vs Actual) | 더존·SAP, 가계부 앱 | ○ 향후 확장 |

## 9. 주의사항

- **이중계산 방지**: 고정비는 cash_schedule에 물질화하지 않고 온더플라이 합성 (메모리 project-cashflow-unification 준수).
- **entity_id**: 신규 테이블·INSERT 양쪽 적용 (DEFAULT 1 함정 주의).
- **추정 데이터 부족 시 폴백**: 실적 N개월 미만이면 MANUAL/직전값 폴백 + UI에 "추정 신뢰도 낮음" 표시.
