# 2026-09-26 돈 흐름 점검 — 받을 돈(AR)·줄 돈(AP)

방법: 로컬 prod 마스터 스냅샷 위에서 API 로 주문서 작성→출고→회계반영→세금계산서(DRAFT)→입금·수정·삭제,
발주→확정→부분입고→마감→지급·수정·삭제를 밟고 DB 파생값(`billed − payments − adjustments`,
`발주 − 지급 − 조정`)과 화면 API 값을 대조했다. 코드 리뷰(AR·AP 각 1)의 P1 후보는 실측으로 재현한 것만 채택.
시나리오 스크립트는 세션 scratchpad(`ar1·ar2·ap1·verify.cjs`) — 필요하면 여정(J3/J4)으로 승격.

## 고친 것 — `a9a9c86f` (session/money-flow, 미배포)
재실측 전부 통과 · journey 40/40 · local-e2e 4/4 · test:calc · entity-audit · check:fn/dom · bind-limit.

| 축 | 결함(실측) | 수정 |
|---|---|---|
| AR | 주문목록 회계반영(`/billing-status`)·`bulk-bill` 이 단가미정 주문을 청구(9,900 중 0원 라인 누락 후 동결) | 가드 추가(`/bill` 과 동일) |
| AR | 단건 계산서·`batch-create` 가 단가미정 허용, `batch-create` 중복발행 가드 없음 | 가드 추가·`ordersAlreadyInvoiced` 공유 |
| AR | 계산서 연결 주문의 회계반영 취소 → 계산서는 남고 미수에서만 빠짐 | `countLiveInvoicesForOrder`(순액) 가드 |
| AR | 계산서 연결 미출고 주문 취소 허용 | 같은 가드 + BILLED 차단 |
| AR | 청구된 주문 PUT 으로 거래처 변경 → 청구액만 새 거래처로 이동 | 거래처 변경 거절 |
| AR | 청구 중 수정 → 청구취소 → 재청구 시 옛 금액(22,500 vs 24,750) | 청구취소 직후 그룹 재계산 |
| AR | `vat_included` 미지정 주문: 헤더 VAT 0·라인 과세 → 다음 수정에서 VAT 가 조용히 붙음 | 헤더도 저장 기본값 규칙 |
| AR/AP | 전체모드(0) 입금·감액·지급·매입조정이 동산(1)로 귀속 | 400 거절 |
| AR | 월말 마감 요약 월말일이 로컬 TZ 에서 29일 | UTC 계산 |
| AP | 발주 VAT 끝전(366.3원) | 라인별 반올림 |
| AP | 입고 0건 발주를 손으로 부분입고→마감 → AP 0 | 입고 없으면 거절 |
| AP | 재발주가 부분마감 원본 헤더 복사(라인 11,000 / 헤더 4,400), 상태 무검증 | 라인 재계산·화이트리스트·원본 법인 |

## 결정 필요 (코드 미변경)
| 우선 | 항목 | 근거 |
|---|---|---|
| P1 | **청구 후 증액 불가** — 조정은 감액(>0 차감)만, 동결 그룹은 증액을 못 받음. 주석은 「감액/증액」 | `ar-payments.ts` adjustment · `update.ts:279` |
| P1 | **취소발행(수정4) 후에도 미수 유지** — modify 가 청구그룹을 안 건드림. 이제 회계반영 취소는 허용되지만 수동 | `taxInvoices/issue.ts` modify |
| P1 | DRAFT 계산서 중복 생성 허용(단건·묶음 모두 DRAFT 제외 규칙) → 둘 다 발행 가능 | `ordersAlreadyInvoiced` |
| P1 | 배송비 박스 동기화가 헤더(final·VAT) 미갱신 | `utils/shippingFee.ts:81` (리뷰, 미실측) |
| P1 | 직접발행 DRAFT 가 이미 BILLED — DRAFT 삭제 시 유령 미수 | `issue.ts:163`·`manage.ts:141` (리뷰) |
| P1 | 매입확정이 부분입고 마감 금액을 발주수량으로 되돌림 · 입고취소가 마감 재계산 미복원 · 불합격 수량도 입고로 셈 · 예상수량(원단) 발주 AP 영구 예상치 | `purchaseInvoices.ts:238`·`inventory.ts:880`·`po-receive.ts:267` (리뷰) |
| P1 | 발주 없이 입고 단가 = 판매가(`base_price`) | `receiving.js:544` (리뷰) |
| P1 | 지출결의 예정행이 `source_type=PURCHASE` 로 발주 id 와 충돌 | `paymentRequests.ts:295` (리뷰) |
| P1 | 템플릿으로 확정 발주 생성에 역할 가드 없음(OPERATOR) | `templates.ts:166` (리뷰) |
| P2 | 매출 정의 불일치 — `monthly-summary` 는 미청구 포함 final 합, `closing-summary` 는 청구액 | `ar-ledger.ts:552` vs `:639` |
| P2 | 거래처 원장 기간 행은 orders 미러, 이월은 청구그룹 기준 · 채권나이 정의 2개(FIFO vs 단일입금) · `is_active` 필터 불일치 | 리뷰 AR#11~13 |
| P2 | `integrity-check` 가 폐기된 `clients.balance` 캐시와 비교해 미수 있는 거래처 전부를 불일치로 보고 · `/api/clients/:id` balance=0 | 실측 |
| P2 | 통장 적용(입금·출금)이 비원자적 · 은행 연결 입금/지급 금액 수정 가능 | `bank.ts:2040,2085` (리뷰) |
