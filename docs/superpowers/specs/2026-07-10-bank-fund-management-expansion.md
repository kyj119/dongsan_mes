# 자금관리(/bank) 확장 — 계좌잔액·거래처검색·비용분류/고정비 자동매칭·계좌간이체

- 작성: 2026-07-10
- 상태: **P1+P2 구현·로컬검증 완료(미배포)** / P3(계좌간 이체)=보류
- 대상 파일: `src/pages/bank.ts`, `src/scripts/bank.js`, `src/routes/bank.ts`, `migrations/0454_bank_fixed_expense_match.sql`

## 사용자 결정(확정)
- Q1 범위 = **P1+P2 먼저** (P3 이체는 다음)
- 계좌 라벨 = 별칭 · 은행명
- Q2 체크박스 = 액션바 ⋯ 더보기 제거(CSV는 인라인 버튼 보존)
- Q3 매칭확정 = **제안 후 사람 확정**
- Q4 이체 = 자동감지+확인 (P3에서)
- 총자금에 대출잔액 차감(순자금) 표시 = 예 (loans는 /cash-schedule 관리, 은행계좌 연결 불요)

## 구현·검증 결과 (2026-07-10)
- **빌드**: `npm run verify`(typecheck+build) 통과. 콘솔 에러 0(Playwright).
- **P1**: 자금현황 탭(총자금·순자금·계좌별잔액=최신 balance_after 파생) / 거래처검색 모달(브라우즈+검색+선택, in-row·apply·rule 3곳) / 계좌 라벨 별칭·은행명 / ⋯제거+CSV 인라인. **로컬 실증**.
- **P2**: `bank_match_rules.match_type`(EXACT|CONTAINS) 부분일치 / 출금→고정비 제안(SUGGESTED) / 확정 시 `recurring_expense_actuals` 당월 실적 기록 / 당월 고정비 체크리스트(PAID·OVERDUE·PENDING). **end-to-end 실증**: 적요 `한국전력월납`→고정비 `선명 전기요금` 매칭→확정→2026-07 실적 880k 기록→체크리스트 PAID.
- ⚠️ **마이그레이션 0454는 로컬만 적용**. prod 배포 시 `npx wrangler d1 execute webapp-production --remote --file=./migrations/0454_bank_fixed_expense_match.sql` 직접 적용 필요(마이그 추적 불일치).
- ⚠️ 바로빌 **sync 자동매칭 경로**(routes/bank.ts sync)는 기존 EXACT 규칙만 — 고정비/CONTAINS는 수동 '자동매칭' 버튼에서만 동작(후속 확장 여지).

> 아래는 원 설계 기록.

## 0. 현황 대조 (요청 8건 ↔ 코드)

| # | 요청 | 현재 | 결론 |
|---|------|------|------|
| 1 | 계좌잔액+총자금 탭 | 계좌관리 탭=등록 전용 | 신규 뷰 필요 |
| 2 | 거래처검색 모달화 | 인라인 드롭다운(`applyClientSearch`/`ruleEditClientSearch`) | 모달로 교체 |
| 3 | 라인별 계좌표시 | **이미 있음** — 거래표 '계좌' 컬럼(`bank.js:220` `tx.account_alias\|\|account_holder\|\|bank_name`) | 확인 필요(무엇이 부족?) |
| 4 | 최좌측 체크박스 "…" 제거 | 최좌측=일괄선택 체크박스(`checkAll`) | 대상 불명확(Q2) |
| 5 | 비용분류 자동매칭 | `bank_match_rules` 규칙 존재하나 **적요 완전일치**만 | 부분일치 강화 |
| 6 | 고정비 매칭+당월출금 확인 | `fixed_expenses`+`recurring_expense_actuals` 인프라 有, **배선 無** | 매칭엔진+실적기록 |
| 7 | 적요 변동 추적 | 완전일치라 불가 | 고정비 앵커 매칭 |
| 8 | 계좌간 이체 | 개념 없음(DEPOSIT/WITHDRAWAL만) | TRANSFER 신설 |

## 1. 확인된 스키마 (재사용 자산)

- `bank_transactions`: `bank_account_id, transaction_date, transaction_time, transaction_type(DEPOSIT|WITHDRAWAL), amount, balance_after, counterpart_name, description, match_status(UNMATCHED|SUGGESTED|APPLIED|IGNORED), matched_client_id, matched_category_id, codef_transaction_id, content_key(VIRTUAL UNIQUE), entity_id`
- `bank_accounts`: `bank_code, bank_name, account_number, account_holder, account_alias, is_active, last_synced_at, entity_id, barobill_registered, collect_cycle`
- `bank_match_rules`: `counterpart_name → matched_client_id | matched_category_id, match_count, entity_id`
- `expense_categories`: `id, name, icon, color`
- `fixed_expenses`: `name, category(RENT|INSURANCE|UTILITY|LEASE|SALARY|TAX|OTHER), amount, frequency(MONTHLY|QUARTERLY|YEARLY), payment_day, start_date, end_date, counterpart_name, amount_type(FIXED|ESTIMATED), estimate_method, linked_category_id, is_active, entity_id`
- `recurring_expense_actuals`: `fixed_expense_id, period(YYYY-MM), estimated_amount, actual_amount, actual_source(CARD|BANK|MANUAL), variance, entity_id, UNIQUE(fixed_expense_id, period)`
- `loans`: `creditor, current_balance, monthly_payment_amount, monthly_payment_day, entity_id`

핵심: **비용분류·고정비·월별실적 테이블이 전부 존재.** 매칭 로직(배선)만 없음. 계좌잔액은 `balance_after`에서 파생 가능.

## 2. Phase 1 — UI (저위험·즉시)

### 1-1. 신규 "자금현황" 탭
- 계좌별 카드: 별칭 · 은행/계좌번호 · **현재잔액** · 최종거래일.
  - 현재잔액 = `SELECT balance_after FROM bank_transactions WHERE bank_account_id=? ORDER BY transaction_date DESC, transaction_time DESC, id DESC LIMIT 1`
- 상단 KPI: **총 자금** = Σ 계좌잔액. (옵션) 대출잔액 Σ 표시 → **순자금 = 총자금 − 대출잔액**.
- 신규 API: `GET /api/bank/fund-summary` (계좌목록+파생잔액+대출합계, entityFilter 적용).
- 위치: 탭 순서 맨 앞 또는 '계좌 관리' 앞.

### 1-2. 거래처검색 모달
- 공용 모달 1개 신설(검색창+목록: 거래처명·대표자·사업자번호, 클릭선택).
- `applyModal`·`ruleEditModal` 두 곳에서 재사용(현 인라인 드롭다운 제거).
- 기존 `searchApplyClient`/`searchRuleClient` API 재활용, 렌더만 모달로.

### 1-3. 체크박스 정리 — **Q2 확정 후**
- (가)안=열 제거 시 `checkAll`·`floatingSelectionBar`·`toggleCheckAll`/`batchMatch`/`batchApply` 동반 제거.
- (나)안=`⋯` 더보기 메뉴(`moreActionsMenu`)만 숨김.

### 1-4. #3 계좌표시 — 확인
- 이미 렌더 중. 사용자가 "안 보인다"면 (a) 별칭 미설정 계좌라 예금주로 표시 (b) 특정 탭/뷰를 의미. 스크린샷으로 확정.

## 3. Phase 2 — 비용분류·고정비 자동매칭 (핵심)

### 마이그레이션
```sql
-- matched_fixed_expense_id: 어떤 고정비의 실적인지 역참조
ALTER TABLE bank_transactions ADD COLUMN matched_fixed_expense_id INTEGER;
CREATE INDEX idx_bt_fixed ON bank_transactions(matched_fixed_expense_id);
-- 규칙 부분일치 지원 (기본 EXACT = 하위호환)
ALTER TABLE bank_match_rules ADD COLUMN match_type TEXT NOT NULL DEFAULT 'EXACT'; -- EXACT | CONTAINS
```

### 매칭 엔진 (출금 tx 대상)
1. **규칙 매칭**(기존 강화): `bank_match_rules` — `match_type=CONTAINS`면 `counterpart_name LIKE '%키워드%'`. → `matched_category_id` 설정.
2. **고정비 매칭**(신규): 활성 `fixed_expenses`(entity·기간) 순회, 점수화:
   - 거래처: `counterpart_name` 부분일치(고정비.counterpart_name 또는 name 키워드) — 필수 조건
   - 금액대: `amount_type=FIXED`이면 ±5%, `ESTIMATED`이면 ±30%(또는 estimate 기반)
   - 결제일: `payment_day` ±N일(권장 ±5) 가점
   - 카테고리: `linked_category_id`로 `matched_category_id` 채움
   - 매칭 확정 시:
     - `bank_transactions.matched_fixed_expense_id` + `matched_category_id` 설정
     - `recurring_expense_actuals` UPSERT: `period=YYYY-MM(거래일)`, `actual_amount=amount`, `actual_source='BANK'`, `variance=actual−estimated`
3. **Q3 확정수준**: (가)제안만 → `match_status='SUGGESTED'`, 사람이 확정 시 실적기록. (나)고신뢰(거래처+금액정확)만 `APPLIED` 자동. (다)전부 자동.

### #7 적요 변동 추적
- 매칭 앵커가 **고정비 항목(fixed_expense_id)** 이므로 적요 문자열이 "5월 선명 전기요금"→"6월 선명 전기요금"으로 바뀌어도 무관.
- `recurring_expense_actuals(fixed_expense_id, period)`에 월별 실적 누적 → 추세(전월대비 variance) 표시.

### #6 당월 출금 체크리스트 (뷰)
- 자금현황 탭(또는 고정비 탭)에 당월 고정비 현황:
  - `fixed_expenses(MONTHLY, 활성)` × 당월 LEFT JOIN `recurring_expense_actuals(period=당월)`
  - 실적 有 → ✅ 출금완료(날짜·금액) / 無 & payment_day 경과 → ⚠️ 미출금 / 無 & 미도래 → ⏳ 예정
- 신규 API: `GET /api/bank/fixed-expense-status?period=YYYY-MM`

## 4. Phase 3 — 계좌간 이체 (Q4 확정 후)

### 마이그레이션
```sql
ALTER TABLE bank_transactions ADD COLUMN transfer_pair_id INTEGER; -- 짝 거래 id
CREATE INDEX idx_bt_transfer ON bank_transactions(transfer_pair_id);
```
- 상태는 `match_status`에 값 추가 대신 `transfer_pair_id IS NOT NULL`로 식별(CHECK 재빌드 회피). 표시 뱃지 '계좌이체'.

### 자동감지 후보
- 조건: 서로 다른 `bank_account_id`(둘 다 내 계좌) · `amount` 동일 · 한쪽 WITHDRAWAL·다른쪽 DEPOSIT · `|date차| ≤ 2일` · 둘 다 미분류.
- (가)안: 후보 제안 → 확인 시 `transfer_pair_id` 상호 설정.
- 처리: 이체로 확정된 거래는 **손익·비용분류·미수매칭·고정비매칭에서 제외**(잔액엔 이미 반영). 자동매칭 스캔 쿼리에 `AND transfer_pair_id IS NULL` 추가.

### 영향 범위 (누수 점검)
- 미수금(deriveClientBalance)·자금예측(cashflowEngine)·손익 리포트가 bank_transactions를 집계하면 **TRANSFER 제외 필터** 반영 필요 → 전수 확인 항목.

## 5. 영향 파일·API 요약

| 영역 | 파일 |
|------|------|
| 페이지/탭 | `src/pages/bank.ts` |
| 프론트 | `src/scripts/bank.js` |
| 라우트 | `src/routes/bank.ts` (+ fund-summary, fixed-expense-status, transfer 후보/확정) |
| 마이그 | `bank_transactions` +matched_fixed_expense_id/+transfer_pair_id, `bank_match_rules` +match_type |
| 연계 점검 | `src/utils/cashflowEngine.ts`, 미수금 파생, 손익 리포트(TRANSFER 제외) |

## 6. 권장 진행 (Phase 분리)

- **P1(UI)**: 자금현황 탭 · 거래처검색 모달 · 체크박스 정리 → 오늘 배포 가능.
- **P2(매칭)**: 비용분류 부분일치 · 고정비 매칭엔진 · 당월 체크리스트 · 적요변동 추적 → 별도 세션.
- **P3(이체)**: 자동감지+확정 + 하류 집계 TRANSFER 제외 → 별도 세션(누수 점검 동반).

## 7. 미결 (사용자 확정 필요)

- Q1 이번 범위(P1만 / P1+P2 / 전부)
- Q2 체크박스 "…" 정확한 대상
- Q3 매칭 확정수준(제안 / 고신뢰자동 / 전부자동)
- Q4 이체 감지방식(자동+확인 / 수동 / 완전자동)
- 총자금에 대출잔액 차감(순자금) 표시 여부
