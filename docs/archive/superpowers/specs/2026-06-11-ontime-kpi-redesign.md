# 대시보드 납기 준수율(on_time_rate) KPI 재정의 — #380

- **작성일**: 2026-06-11
- **상태**: ✅ **설계 확정 (2026-06-11 용준님 결정)** — D1=다(COALESCE) · D2=가(마지막 출고일) · D3=가(SHIPPED+COMPLETED) · D4=가(납기월). 구현 착수 가능
- **관련**: GitHub #380(MED bug), auto-improve Area 3 (2026-06-10T10:00)
- **목표**: 상시 노출 경영지표의 2중 결함(잘못된 출고일 프록시 + 표본 편향) 교정

---

## 1. 배경 / 현황 (#380 진단 요약)

상단 카드 상시노출 KPI(`src/pages/dashboard.ts:79`)의 계산(`src/routes/dashboard.ts:54-58`)이:

1. **`orders.updated_at`을 출고일 프록시로 사용** — orders에 `shipped_at` 컬럼 자체가 없음. updated_at은 모든 수정에서 갱신되므로, 정시 출고한 주문을 며칠 뒤 회계반영(`PATCH /:id/billing-status`, `src/routes/orders/core.ts:613`)만 해도 `date(updated_at) > delivery_date` → **"지연"으로 오집계** (준수율 과소 방향)
2. **분모 `status IN ('SHIPPED')`** — 출고 후 COMPLETED로 전이된 주문 제외(`src/scripts/orders.js:137`) → 표본 편향

실제 출고일 권위 소스 후보: `cards.shipped_at`(마이그 0041) / `shipments.shipped_at`(마이그 0052).
리포팅 전용 결함(트랜잭션 손상 아님)이지만 경영 판단에 쓰이는 수치.

---

## 2. 결정 포인트 — ✅ 확정 (2026-06-11)

> **D1 = 다**: `COALESCE(shipments.shipped_at → cards.shipped_at → 상태전이 시각)` — 코드 확인 결과 단독 소스는 빈 구간(일괄출고=cards만 갱신 `orders/queries.ts:221`, 기성/유통=카드 미생성, shipments=출고등록 경로만 `shipments.ts:380`).
> **D2 = 가**: 부분출고는 마지막(완전) 출고일 기준.
> **D3 = 가**: 분모 `status IN ('SHIPPED','COMPLETED')`.
> **D4 = 가**: 납기월(delivery_date) 귀속 — ⚠️ 현행은 `created_at` 생성월 귀속(`dashboard.ts:58`)으로 제3의 기준이었음. 신산식으로 교체.

### D1. 출고일 권위 소스
| 안 | 내용 | 트레이드오프 |
|---|---|---|
| **가 (권고)** | `shipments.shipped_at` (주문→출고 기록) | 출고 업무의 사실 기록. 단, 출고 등록 없이 상태만 SHIPPED인 주문(기성/유통 즉시출고 경로) 커버 확인 필요 |
| 나 | `cards.shipped_at` (생산카드) | 생산 완료 관점. 기성/유통은 카드 미생성이라 누락 |
| 다 | COALESCE(shipments → cards → 최후 폴백 updated_at) | 커버리지 최대, 계산 복잡 |

### D2. 부분출고 시 기준일
- **가 (권고)**: 마지막(완전) 출고일 — "약속 전량 이행" 관점, 보수적
- 나: 첫 출고일 — 관대한 기준

### D3. 분모 범위
- **가 (권고)**: `status IN ('SHIPPED','COMPLETED')` — 출고 도달 전수
- 나: 가 + delivery_date 경과한 미출고 주문도 "지연"으로 포함 (현재진행 지연 반영, 더 엄격)

### D4. 월 귀속 기준
- **가 (권고)**: delivery_date(납기월) 기준 — "그 달에 약속한 것 중 지킨 비율"
- 나: 출고일(실적월) 기준

---

## 3. 구현 계획 (결정 후 ~0.5세션)

1. `src/routes/dashboard.ts` on_time_rate 쿼리 재작성 (D1~D4 반영, KST 보정은 기존 `kstDate` 헬퍼)
2. 기성/유통 즉시출고 경로의 출고일 기록 여부 확인 → 누락 시 D1-다 폴백 또는 상태전이 시각 사용
3. 툴팁/라벨에 산식 명시 ("납기월 기준, 완전출고일 대비") — 수치 해석 오해 방지
4. (선택) 기존 산식 대비 신산식 1개월 병행 출력해 격차 확인 후 구버전 제거

## 4. 검증
- prod 실데이터 대조: 최근 1개월 주문 표본 ~20건 수기 분류(정시/지연) vs 신산식 결과 일치
- 회계반영만 한 주문이 "지연"으로 안 바뀌는지 회귀 케이스 확인
- `npm run verify` + smoke

## 5. 공수
구현 ~0.5세션 + prod 표본 대조 0.5h. 마이그레이션 불요(읽기 쿼리만).
