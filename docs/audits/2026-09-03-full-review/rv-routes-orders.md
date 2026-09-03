# 슬라이스 A 결과 — 검사 26파일 / 15,711줄

대상: `src/routes/orders/**`(8) · `cards/**`(3) · orders.ts · cards.ts · shipments.ts · production.ts ·
productionReports.ts · printEvents.ts · workbench.ts · quotations.ts · quotationsListFilter.ts · scan.ts ·
finishing.ts · postProcessing.ts · claims.ts · returns.ts · inspections.ts (전 파일 전문 통독)

## 조치 필요 (심각도순, 15건)

- `src/routes/production.ts:131` — HIGH — `POST /production/logs` 가 body 미포함 필드(weather·temperature·humidity·supervisor_id·notes)를 그대로 `.bind()` 에 넘긴다. D1 은 `undefined` 바인드를 거부(`D1_TYPE_ERROR`)하므로 결정적 500 — failure: 작업실적 화면이 `{log_date, shift}` 두 필드만 보내므로(`src/scripts/production.js:1040`) **해당 날짜·근무조의 첫 실적 등록이 항상 실패**한다("작업 실적 등록 실패"). 이 저장소는 다른 라우트에서 전부 `?? null` 로 방어한다. — 확인한 호출부: `src/scripts/production.js:1034-1043`(wrEnsureLog → wrSubmit)

- `src/routes/orders/update.ts:440` — HIGH — 라인 담당 법인 재추천 기준을 **세션 법인**(`getEntityId(c) || 1`)으로 쓴다. 생성 경로는 **주문 법인**(`create.ts:294` `orderEntityId=billingEntityId`)을 쓴다 — failure: ADMIN(entityId 0→1)이 청주(3) 주문을 저장만 해도 현수막 라인의 `assigned_entity_id` 가 1→NULL 로 바뀌고, `recalcOrderBillingGroups` 의 `COALESCE(assigned_entity_id, 주문법인)` 때문에 청구그룹이 동산(1)에서 청주(3)로 이동한다(법인 간 매출 귀속이 바뀜). — 확인한 호출부: `src/routes/orders/helpers.ts:41-49`(recommendAssignedEntity), `helpers.ts:83-89`(그룹 집계), 폼은 미선택 시 `assigned_entity_id: undefined` 를 보내 키가 사라진다(`src/scripts/orderForm/calc.js:613`)

- `src/routes/orders/update.ts:673` — HIGH — 같은 자리의 형제 결함: 카드 재생성에 `entityId: getEntityId(c) || 1` 을 넘겨 `cards.requesting_entity_id` 가 세션 법인으로 박힌다(`cards/lifecycle.ts:1131` 은 주문 법인을 쓴다) — failure: ADMIN 이 선명(2) 주문을 수정하면 새 카드가 법인 1 로 생성돼, 선명 계정의 `/cards`·칸반·보드(`cardEntityFilter` = `requesting_entity_id`)에서 그 카드가 통째로 사라진다. — 확인한 호출부: `src/routes/orders/helpers.ts:232-235`(effEntityOf), `src/utils/entityFilter` 소비처 `cards/queries.ts:304`

- `src/routes/orders/operations.ts:328` — HIGH — 견적→주문 전환(`POST /orders/:id/convert-to-order`)이 상태만 QUOTATION→CONFIRMED 로 바꾸고 **카드를 생성하지 않는다**. 생성 경로(`create.ts:579`)는 CONFIRMED 면 반드시 `generateCardsForOrder` 를 부르고, QUOTATION 이면 건너뛴 채 반환한다(`create.ts:472`) — failure: 견적으로 접수한 주문을 전환하면 생산 카드 0건 + 전 라인 `shipment_ready=0` 이 되어 작업지시가 안 나가고 `PATCH /shipments/:orderId/ship`(`shipments.ts:1349`)도 "미완료 품목" 으로 막힌다(지시 현황판 '누락' 큐에만 뜬다). `quotations.ts:654` 전환 라우트도 동일. — 확인한 호출부: `src/scripts/quotation.js:295`

- `src/routes/returns.ts:177` — HIGH — RESOLVED 재고 복원이 `return_items` 행마다 `inventory_transactions(reference_type='RETURN', reference_id, item_id, 'IN', entity_id)` 를 INSERT 하는데, 같은 품목이 두 라인으로 반품되면 부분 UNIQUE 인덱스(`migrations/0293`)를 위반한다 — failure: 상태 UPDATE(:130)와 AR 조정(:136)은 이미 커밋된 뒤 batch 가 통째로 던져 500. 반품은 RESOLVED 로 남고 재고는 복원되지 않으며, 전이표에 `RESOLVED: []` 이 없어 **재시도 경로도 없다**. 라우트에 try/catch 가 없어 롤백도 없음. — 확인한 호출부: `migrations/0293_inventory_tx_unique_add_entity.sql:9-11`

- `src/routes/orders/core.ts:598` — HIGH — 권한 거부보다 **먼저** 재고를 되돌린다. `restoreStockLinesOnUnship`·`restoreAutoDeductionsByCards`·`restorePpDeductionsByOrder` 가 :598~604 에서 실행되고, ADMIN 검사는 :648 에서야 403 을 반환한다 — failure: MANAGER 가 HOLD 상태(카드 출력 후 보류 = 자동차감 이력 존재) 주문의 삭제를 눌러 403 을 받아도, 인쇄 원단 자동차감이 환원되고 `inventory_auto_deductions` 행이 삭제된다. 주문은 그대로 남아 재고만 늘어난다. — 확인한 호출부: `src/utils/autoDeductRestore`(차감행 삭제 + 재고 복원), `src/utils/stockShip.ts:restoreStockLinesOnUnship`

- `src/routes/printEvents.ts:660` — HIGH — `POST /print-events/batch` 는 OK 이벤트 하나로 카드를 바로 `PRINT_DONE` 으로 만든다. 단건 경로(`:467-474`)는 ①타일 완료(`checkAllTilesComplete`) ②`card_items.print_completed` 갱신 ③주문 상태 동기화(`autoCheckCardItem:272-302`)를 거친다 — failure: 오프라인 큐가 밀려 batch 로 올라온 실적은 (a) 분할출력 첫 타일에서 카드가 완료되고 (b) 카드 진행률이 0/N 으로 남으며 (c) **주문 상태가 PRINT_DONE 으로 전이되지 않아** 출고 대기 목록에 영원히 안 뜬다. — 확인한 호출부: `printEvents.ts:234-305`(autoCheckCardItem), `cards/lifecycle.ts:47`(같은 불변식)

- `src/routes/orders/update.ts:343` — MEDIUM — 카드 재생성 경로가 cards 를 지우면서 `print_file_map.card_id`/`order_item_id` 를 정리하지 않는다(하드삭제 `core.ts:669,687` 는 SET NULL 한다. 이 표는 FK 가 없어 500 도 안 난다) — failure: 확정 주문을 한 번 수정하면 파일맵이 삭제된 카드 id 를 가리켜 `resolveCard` → `applyEventToCard`(:199 에서 죽은 id 를 그대로 반환) 가 새 카드를 못 찾고, 출력완료가 어느 카드에도 안 찍힌 채 `print_events.card_id` 에 유령 id 만 쌓인다. — 확인한 호출부: `printEvents.ts:107-151`, `migrations/0079_print_file_map.sql`(FK 없음)

- `src/routes/orders/lifecycle.ts:309` — MEDIUM — `order.order_type` 을 보고 유통 주문의 자재 gap 경고를 끄려 하는데, :175 의 SELECT 에 `order_type` 컬럼이 **없다**(항상 undefined) — failure: 유통 주문을 CONFIRMED 로 전이하면 주석이 막으려던 "전 건 오탐" gap 경고가 그대로 뜬다. 같은 판정을 하는 `create.ts:696`·`operations.ts:348` 은 값을 갖고 있어 세 경로가 갈린다. — 확인한 호출부: `src/utils/materialShortageCheck`(describeGap 소비)

- `src/routes/shipments.ts:1281` — MEDIUM — `PATCH /shipments/:id/status` 의 SHIPPED·IN_TRANSIT 분기가 `orders.status='SHIPPED'` 로 바꾸면서 `deductStockLinesOnShip` 도, `order_status_history` INSERT 도 하지 않는다(같은 핸들러의 CANCELLED 분기는 이력을 남긴다) — failure: 이 경로로 출고 확정된 기성·유통 라인은 재고가 영영 안 빠지고, 나중에 같은 라우트로 취소하면 `restoreStockLinesOnUnship` 이 차감 행을 못 찾아 no-op → 원장·재고 둘 다 조용히 어긋난다. 웹 UI 호출부는 현재 없음(API 전용). — 확인한 호출부: `src/utils/stockShip.ts`(deduct/restore 대칭), 형제 `queries.ts:370`·`cards/lifecycle.ts:446`

- `src/routes/shipments.ts:944` — MEDIUM — `POST /shipments` 는 카드 `shipped_at` 스탬프와 `auto_complete_date` 를 세팅하면서 재고 차감만 빠졌다(후가공 자재 차감 `:950` 은 한다) — failure: 혼합주문(제작+기성)을 이 API 로 출고하면 `sync-statuses` 가 나중에 SHIPPED 로 올리는데, 그 라우트는 "auto_complete_date 는 출고 경로가 세팅하므로 이미 차감됐다"(`lifecycle.ts:535`)를 전제로 차감을 생략한다 → 기성 라인 재고가 어디서도 안 빠진다. 현재 웹 호출부는 없고 `scripts/smoke-write.cjs:184` 만 호출. — 확인한 호출부: `src/routes/orders/lifecycle.ts:533-538`

- `src/routes/cards/lifecycle.ts:1195` — MEDIUM — `print-toggle` 이 마지막 품목 체크로 카드를 PRINT_DONE 으로 올릴 때 `pp_status` 를 설정하지 않고 `card_status_history` 도 남기지 않는다(형제 `/complete:1250` 은 둘 다 한다) — failure: 후가공이 있는 카드가 `pp_status=NULL` 로 남아 ①`PATCH /:id/ship:884` 의 "후가공 미완료" 경고가 안 뜨고(미완료 상태로 무경고 출고) ②`bulk/pp-complete:841`(`pp_status='PENDING'` 조건)로 완료 처리할 수 없다. 상태 이력도 비어 감사 로그가 끊긴다. — 확인한 호출부: `src/scripts/cardDetail.js:456`

- `src/routes/productionReports.ts:28` — MEDIUM — 전 라우트가 `date(print_completed_at)` / `strftime('%H', print_completed_at)` 를 직접 쓴다. 이 컬럼은 **UTC naive**(`printEvents.ts:14` kstNaiveToUtc 가 -9h 해서 저장)이고, 업무일 SSOT `printEventKstDay()`(`src/utils/printEventDay.ts`, 2026-09-01 신설)가 이미 있다 — failure: `/daily-summary?date=2026-09-02` 가 KST 09:00~익일 09:00 을 센다(00~09시 출력은 전날로 빠짐). 시간대별 통계는 9시간 통째로 밀려 10시 작업이 01시로 표시된다. `daily-summary` 의 `total_sqm` 도 `copy_total` 을 안 곱해 `/print-events` 요약(`printEvents.ts:903`)과 값이 다르다. — 확인한 호출부: `src/utils/printEventDay.ts`(주석에 동일 사고 기록)

- `src/routes/printEvents.ts:1327` — MEDIUM — `POST /print-events/link` 가 `print_file_map.order_item_id` 에 `cards.order_item_id` 를 넣는데, 정규 생성기가 이 컬럼에 **항상 NULL** 을 INSERT 한다(`orders/helpers.ts:408`) — failure: 사람이 파일명↔카드를 연결해도 학습된 맵의 order_item_id 가 NULL 이라, 다음 출력 이벤트에서 `autoCheckCardItem(:236)` 이 아무 품목도 체크하지 못하고 카드가 PRINT_DONE 으로 전이되지 않는다(PRINTING 까지만 간다). — 확인한 호출부: `printEvents.ts:234-253`, `orders/helpers.ts:396-419`

- `src/routes/inspections.ts:274` — MEDIUM — 입고 검수 상태 UPDATE 가 `WHERE ... AND (inspection_status IS NULL OR inspection_status = 'PENDING_REVIEW')` 로 걸려 있다 — failure: 1차 검수가 NORMAL 로 확정된 뒤 재검수에서 FAIL·수량부족이 나와도 `PENDING_REVIEW` 로 **올라가지 못한다**(0행, 응답은 success:true + PENDING_REVIEW 로 보고). 화면과 DB 가 갈린다. — 확인한 호출부: 같은 파일 :250(inspectionStatus 산출), :286(응답)

- `src/routes/orders/operations.ts:198` — MEDIUM — `POST /orders/:id/copy` 의 라인 복사가 `finishing`·`price_status`·`auto_amount`·`line_discount`·`ai_analysis_id`·`shipment_ready` 를 복사하지 않는다 — failure: 복사본 주문은 마감(봉제·열재단) 정보가 사라져 카드 체크리스트에 마감 스텝이 안 생기고(`helpers.ts:374`), `auto_amount` 가 NULL 로 남아 `create.ts:330` 이 명시적으로 피하려던 상태가 된다. PENDING 단가 라인도 CONFIRMED 로 복사돼 금액이 확정된 것처럼 보인다.

## 확인했지만 이상 없음 (1줄)
`buildOrderListFilter`/`buildQuotListFilter` 파라미터 순서·`?` 개수 대조(전 호출부 일치, `core.ts:203` invertedWhere 치환 포함) · `cards/queries.ts:733` defect-stats 의 SELECT절 서브쿼리 바인드 순서(정상) · D1 바인드 80/40 청크 분할 · `syncArAdjustmentStmts` 멱등 · `deductStockLinesOnShip`↔`restoreStockLinesOnUnship` 대칭(OUT 행 철회 방식) · orders/cards/quotations 목록 페이지네이션 산식 · `entityFilter` 별칭 사용 · 응답 필드↔`src/scripts/*.js` 소비 필드명(orders·cards·shipments·quotations 주요 목록/상세) · 후가공·마감 마스터 라우트.
그 밖 낮은 순위 관찰 4건: `workbench.ts:618` 존재하지 않는 상태값 `'PRODUCTION'`(출력중 주문 라인이 경로① 목록에서 누락) · `orders/lifecycle.ts:500` restore 가 모든 HOLD 카드를 PRINTING 으로 올리고 card_status_history 미기록 · `scan.ts:230` CARD:ship 이 PRINT_DONE 검증·재고차감·주문전이·shipment 기록 전부 없음 · `quotations.ts:669` order_date/order_year/order_month 를 UTC 로 생성(00~09시 KST 는 전날·전월).

## 기각한 후보 (5줄)
- `orders/queries.ts:191` /ready-to-ship 의 cards×order_items 곱집계(card_count·total_quantity 부풀림) — 소비자 0건(스크립트·페이지 어디서도 호출 안 함) → 사용자 영향 없음.
- `orders/update.ts` items 누락 시 전 라인 삭제 — 유일 호출부(`orderForm/calc.js:777`)가 항상 전체 payload 를 보냄.
- `quotations.ts:297` vat 미반올림 — `computeLineAmount().auto` 가 100원 배수라 ×0.1 이 정수, 소수 발생 불가.
- `cards/queries.ts:629` /stats/daily 의 UTC 날짜 그룹 — updated_at 자체가 UTC 라 내부 일관, 7일 추이 표시에 한정.
- `postProcessing.ts` 라우트 등록 순서(`/stats` 가 `/:id/subcategories` 뒤) — 단일 세그먼트 `:id` GET 라우트가 없어 섀도잉 없음.
