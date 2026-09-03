# 슬라이스 C 결과 — 검사 33파일 / 13,050줄

검사 범위: routes(items, inventory, inventoryCount, inventoryValuation, storageZones, purchaseOrders/**8, purchaseRequests, purchaseInvoices, weeklyPurchase, bom, prices, priceList, priceLists, priceSheets) + utils(unitConvert, autoDeductInventory, autoDeductPostProcessingMaterials, autoDeductRestore, supplierPayable, inventoryZone, inventoryAlert, materialShortageCheck, consumptionForecast, entityFilter, sequenceGenerator). 마이그레이션·클라이언트 스크립트는 교차확인용으로 조회.

### 조치 필요 (심각도순)

- `src/routes/purchaseOrders/po-special.ts:153` · `:265` — HIGH — 재발주·빠른발주가 `getNextSeqNumber(prefix='YYYYMMDD-P', entityId)` 로 **법인별 MAX** 채번하는데 `po_number` 는 **전역 UNIQUE**(0032:13, 0281 주석이 "제거 불가" 명시) — 정규 경로(core.ts:247·po-special.ts:48)만 `E{eid}` 내장으로 전환됐고 이 둘은 누락. 주석 "정규 생성 경로와 동일"은 stale. — 법인1이 오늘 `20260902-P001`을 만들면 법인2의 재발주/빠른발주는 per-entity MAX=0 → 같은 번호 재생성 → UNIQUE 위반 500. `withSeqRetry` 미적용이고 재시도해도 MAX가 그대로라 **그날 내내 복구 불가**. — caller/consumer checked: `src/utils/sequenceGenerator.ts:19-29`, `migrations/0281_po_quotation_entity_unique.sql:1-4`

- `src/routes/inventoryCount.ts:60-67` — HIGH — 목록 count 쿼리가 `scope=mine` 절(:33-43)을 재조립하지 않으면서 바인드는 `params.slice(0,-2)`로 그대로 넘겨 **플레이스홀더보다 바인드가 1개 많다**. — 실사 목록에서 「내 담당만」 체크 → count 쿼리 바인드 불일치로 D1 오류 → 목록 전체가 500. 오류가 안 나는 조합에서도 count는 scope를 무시해 total이 부풀어 페이징이 어긋난다. — caller/consumer checked: `src/scripts/inventoryCount.js:85-89` (`fMineOnly` → `params.append('scope','mine')`)

- `src/routes/inventoryCount.ts:822-834` — HIGH — 승인 시 ADJUST 원장을 `(reference_type='STOCK_COUNT', reference_id=countId, item_id, entity_id)` 로 넣는데 UNIQUE 인덱스에 `storage_zone_id` 가 없다. 전수 실사는 라인을 **(item, zone) 재고 행별로 전개**한다(:402-409). — 같은 품목이 2개 창고에 있으면 ADJUST 2행이 동일 키가 되어 UNIQUE 위반 → batch 전체 롤백 → 승인 500, 실사는 SUBMITTED 로 **영구히 막힌다**(재시도해도 같은 결과). ZONE 실사는 구역이 1개라 무사. — caller/consumer checked: `migrations/0293_inventory_tx_unique_add_entity.sql:9-11`

- `src/routes/purchaseOrders/po-receive.ts:302-311` — HIGH — 입고 재고 반영이 `UPDATE inventory SET quantity = ?` **절대값 덮어쓰기**이고, 그 값(`p.balanceAfter`)은 락 획득(:228) **이전**의 prefetch(:160)로 계산된다. — prefetch↔batch 사이에 자동차감(print_event)·출고가 끼면 그 차감이 통째로 지워져 재고가 되살아난다. 같은 창(窓)에서 재고 행이 새로 생기면 `hasInventoryRow=false` 분기의 INSERT 가 UNIQUE 위반 → 입고 전체 500. 수기입고(`inventory.ts:551`)는 `quantity = quantity + ?` 상대 누적이라 이 경로만 다르다. — caller/consumer checked: `src/utils/autoDeductInventory.ts:225-231`, `src/routes/inventory.ts:551-554`

- `src/routes/purchaseInvoices.ts:161-165` — HIGH — 매입확정이 `inventory_transactions` 를 `unit_price = ?`(관리단위 단가) · `total_amount = quantity * ?` 로 덮어쓰는데, 그 행의 `quantity` 는 **base 단위**(po-receive.ts:321 이 `unit_price/packSize`·`acceptedQty*unitPrice` 로 축을 맞춰 넣은 값)다. — 시트류(1롤=50M)에서 원장 금액이 **50배**로 부푼다. `POST /inventory-valuation/recalculate-avg`(inventoryValuation.ts:150-162)가 `SUM(total_amount)/SUM(quantity)` 로 `items.avg_unit_cost` 를 만들므로 재고 평가액까지 50배 오염 — memory `feedback-avg-cost-backfill-axis` 의 재발 경로. — caller/consumer checked: `src/routes/purchaseOrders/po-receive.ts:313-324`, `src/routes/inventoryValuation.ts:150-167`

- `src/routes/priceList.ts:166-176` — HIGH — 정책 삭제에서 소유 검증 실패(타법인·미존재)에도 **404를 반환하지 않고** 계속 진행하고, 이어지는 `UPDATE clients SET price_policy_id = NULL`(:172)·`DELETE FROM price_policy_rules`(:175)에는 entity 필터가 없다. — 법인1 사용자가 법인2 정책 id 를 DELETE 하면 헤더만 남고 **규칙 전량 삭제 + 거래처 연결 해제**가 실행되고 응답은 success:true. 형제 `PUT /policies/:id/rules`(:197-199)는 #451 로 소유 가드를 받았으나 DELETE 는 누락. — caller/consumer checked: `src/routes/priceList.ts:197-199` (동일 자원 가드 존재)

- `src/routes/purchaseOrders/core.ts:572-578` — HIGH — 상태 전이표가 `PARTIAL_RECEIVED → CANCELLED → DRAFT` 를 허용해, 재고가 이미 움직인 발주를 DRAFT 로 되돌릴 수 있다. 수정 가드(:406)·삭제 가드(:651)는 **현재 status 만** 보고 `received_quantity` 를 보지 않는다. — 그 상태에서 PUT 하면 라인을 delete+reinsert 하며 `received_quantity=0`(:516)으로 초기화되어 입고 이력과 재고가 영구히 어긋나고, DELETE 하면 `inventory_receipt_items.po_item_id`·`inventory_receipts.po_id` 가 dangling 이 된다(:679-687 이 둘을 정리하지 않는다). — caller/consumer checked: `src/routes/purchaseOrders/core.ts:406-411`, `:651-656`, `:679-687`

- `src/routes/purchaseRequests.ts:753` — HIGH — auto-convert 가 `SELECT id, status` 만 조회해 `pr.supplier_id`·`pr.request_number` 가 undefined. 그래서 "이력 없으면 PR 공급업체 사용" 폴백(:810-813)이 **절대 실행되지 않고**, prSupplierName 조회(:792)도 죽는다. — 입고 이력 없는 품목이 전부 `unassigned` 로 몰려 :836 에서 **조용히 버려지는데**, PO 가 1건이라도 생기면 :904 가 PR 을 CONVERTED 로 바꿔 버려 발주되지 않은 품목을 되살릴 경로가 없다. 이력 메시지도 `발주요청 #undefined` 로 남는다(:864). — caller/consumer checked: `src/routes/purchaseRequests.ts:640` (일반 convert 는 supplier_id 를 조회함 — 비대칭)

- `src/routes/weeklyPurchase.ts:38-44` — HIGH — MRP 소요량의 원천인 활성 주문 조회에 **entity 필터가 없다**. 같은 응답의 현재고·안전재고·발주중은 전부 법인 필터(consumptionForecast.ts:52-96, :56-67)를 탄다. — 법인2로 분석하면 법인1·3의 확정/생산중 주문 소요량까지 더해져 `shortage = 예상소진 + 안전재고 − 가용재고` 가 부풀고, 그 값이 `POST /create-prs` 로 그대로 발주요청 수량이 된다(과잉발주). LIMIT 도 없다. — caller/consumer checked: `src/utils/consumptionForecast.ts:52-96`, `src/routes/weeklyPurchase.ts:123-172`

- `src/routes/items.ts:1296-1342` — MEDIUM — PUT 이 `description = ?`·`is_active = ?` 를 **무조건** SET 하는데(:1303-1304, 바인드 :1331-1332) 품목 수정 모달에는 description 입력이 아예 없다. — 품목을 한 번 수정할 때마다 `items.description` 이 조용히 NULL 로 지워지고, 비활성(soft delete) 품목을 열어 저장하면 `is_active` 미전송 → 기본값 1 로 **되살아난다**. width_mm·pack_size 등 다른 필드는 `!== undefined` 보존 패턴을 쓰는데 이 둘만 빠졌다. — caller/consumer checked: `src/scripts/items/modals.js:229-255` (payload 에 description·is_active 없음), `src/pages/items.ts` (description 입력 필드 부재)

- `src/routes/items.ts:198-227` — MEDIUM — 목록 count 쿼리가 본 쿼리의 `for_user=1` 권한 필터(:159-172)와 `item_group` 필터(:185-189)를 재조립하지 않는다. — 사용품목이 제한된 사용자의 품목 검색 모달·주문서 picker 에서 total 이 전체 품목 수로 나와 빈 페이지가 생기고 「총 N건」이 과대 표시된다. — caller/consumer checked: `src/scripts/layout/shell.js:2455`, `src/scripts/orderForm/itemRow.js:332`

- `src/routes/purchaseOrders/po-queries.ts:233` · `:284` — MEDIUM — `/my-lines`·`/my-lines-count` 에만 entity 필터가 없다. 형제 `/receiving-queue`(po-receipts.ts:393)는 `entityFilter(c,'po')` 를 적용한다. — 담당자가 다른 법인 발주 라인까지 자기 입고 대기 목록으로 보고, 사이드바 배지 숫자가 부풀어 오른다. 같은 파일 :103-111 이 stock_alerts 에서 동일 결함을 이미 고친 전례. — caller/consumer checked: `src/routes/purchaseOrders/po-receipts.ts:393`

- `src/routes/purchaseInvoices.ts:393-411` — MEDIUM — `GET /:id` 가 entity 필터로 못 찾은 경우에도 **404를 내지 않고** `{...null, items}` 를 200 으로 반환하며, `purchase_invoice_items` 조회(:404-409)에는 entity 조건이 없다. — 타법인/미존재 인보이스 id 로 호출하면 라인의 수량·단가·금액·품목명이 그대로 나간다. — caller/consumer checked: `src/routes/purchaseInvoices.ts:341-345` (형제 `/match` 는 404 처리)

- `src/routes/purchaseOrders/po-receive.ts:56-61` — MEDIUM — 입고번호를 `RCV-{date}%` **전역 COUNT+1** 로 만든다(#329 로 수기입고는 `getNextEntitySeqNumber` 전환 완료, `inventory.ts:501`). `receipt_number` 는 UNIQUE(0003:47). — 두 사람이 동시에 입고하면 같은 번호 → UNIQUE 위반 500(보상 삭제 경로 :350 이 돌면 카운트가 줄어 다음 입고가 기존 번호와 충돌). — caller/consumer checked: `src/routes/inventory.ts:499-501`, `migrations/0003_add_inventory_tables.sql:47`

- `src/routes/purchaseOrders/templates.ts:280-283` — MEDIUM — 2026-08-31 에 14곳에서 제거한 `clients.purchase_balance` 누적이 여기 한 곳 남아 있다(취소·수정 대칭 없음). — 템플릿에서 CONFIRMED 로 발주를 만들 때마다 폐기된 캐시 컬럼이 단방향으로 커진다. 현재 화면이 읽지 않아 즉시 피해는 없지만, 되돌리는 짝이 없는 누적이라 컬럼을 다시 읽는 순간 틀린 값이 된다. — caller/consumer checked: `src/utils/supplierPayable.ts:9-13`, `src/routes/purchaseOrders/core.ts:436-439` (동일 지점에서 제거됨)

- `src/routes/purchaseRequests.ts:640` · `:695` · `:724` — MEDIUM — convert 가 `SELECT id, supplier_id, status` 만 조회한 뒤 `pr.notes`(:695)·`pr.request_number`(:724)를 쓴다. — PR 비고가 PO 로 **전달되지 않고 항상 NULL** 이 되며, 상태 이력에 `발주 요청 #undefined 변환` 이 남아 원본 추적이 끊긴다. — caller/consumer checked: `src/routes/purchaseRequests.ts:685-697`

- `src/routes/inventoryCount.ts:177-183` — MEDIUM — 소모량(`기초+매입−기말`)의 매입 조회에 **PO 상태 필터가 없다**. — DRAFT·CANCELLED 발주가 매입으로 잡혀 소모량이 과소평가된다. 응답 `flags` 가 구역귀속·날짜기준 등 다른 한계는 전부 공시하는데 이것만 빠져 있어 사용자가 알 수 없다. — caller/consumer checked: `src/utils/materialShortageCheck.ts:95` (형제 집계는 `po.status IN (...)` 사용)

- `src/routes/inventory.ts:996` · `:880` · `:1284` — MEDIUM — 재고를 직접 바꾸는 `POST /adjustments`·`POST /releases`·`POST /transfer` 에 role 가드가 없다(라우터는 `authMiddleware` 만). 같은 파일의 `PUT /:id/settings`(:417)·`POST /bulk-assign-zones`(:1355)는 ADMIN/MANAGER 로 막혀 있다. — 조회 권한만 있는 계정이 임의 재고 조정·출고·창고 이동을 실행할 수 있고, 조정은 원장까지 남아 정상 기록과 구분되지 않는다. — caller/consumer checked: `src/routes/inventory.ts:414-419`, `:1352-1357`

- `src/routes/purchaseInvoices.ts:295` — MEDIUM — `POST /`(매입 인보이스 생성)에 role 가드가 없다. 형제 `/confirm`(:109)·`/:id/match`(:338)는 ADMIN/MANAGER. — 아무 인증 사용자나 AP 문서를 만들 수 있고 `invoice_number` 중복 검사도 없다. — caller/consumer checked: `src/routes/purchaseInvoices.ts:109`, `:338`

- `src/utils/consumptionForecast.ts:84-96` — MEDIUM — 소모량 집계가 `transaction_type='OUT'` 전량을 합산해 **입고취소 역분개**(inventory.ts:781, `reference_type='RECEIPT_CANCEL'`)를 소모로 센다. — 입고를 취소할수록 주간 평균 소모가 올라가 주간 발주 분석의 권장 수량이 부풀어 오른다. `reference_type NOT IN ('RECEIPT_CANCEL')` 배제가 필요. — caller/consumer checked: `src/routes/inventory.ts:778-786`, `src/routes/weeklyPurchase.ts:31-34`

- `src/routes/storageZones.ts:506-509` · `src/routes/priceLists.ts:198-201` · `src/routes/prices.ts:674-677` · `:694-699` — MEDIUM — 일괄 배정 4곳이 `item_ids`/`client_ids` 를 상한 없이 IN 절·batch 로 펼친다. 같은 성격의 `inventory.ts:1371` 은 90개 상한 + 80 청크로 막아 뒀다. — 100건 이상 선택하면 D1 바인드 한도로 500(부분 반영 없이 전량 실패), 화면에는 원인 없는 "서버 오류"만 뜬다. — caller/consumer checked: `src/routes/inventory.ts:1370-1373`, `src/utils/inventoryZone.ts:54`

- `src/routes/inventoryCount.ts:809-841` · `:550-578` — MEDIUM — 실사 승인(품목당 3문)·항목 저장(품목당 1문)이 청크 없이 단일 `db.batch` 로 나간다. 전수 실사는 활성 매입품목 × 창고 행 수만큼 라인이 생긴다(:402-409). — 900품목이면 2,700문 단일 batch — 이 저장소의 다른 모든 batch 는 80 청크 규약을 지킨다. 대형 실사에서 승인이 통째로 실패한다. — caller/consumer checked: `src/routes/purchaseRequests.ts:389-391`, `src/routes/purchaseOrders/core.ts:353-355` (80 청크 규약)

- `src/routes/prices.ts:254-258` · `:272-276` — MEDIUM — 최근 거래단가의 상관 서브쿼리 `MAX(po2.order_date)`·`MAX(o2.order_date)` 에는 entity 필터가 없는데 바깥 WHERE 에는 있다. — 그 품목·거래처의 최신 거래가 타법인 것이면 바깥 조건과 만나는 행이 0 이 되어 **최근 단가가 조용히 빈칸**으로 나온다(오류도 경고도 없음). — caller/consumer checked: `src/routes/prices.ts:249-260`

- `src/routes/inventory.ts:897-901` — MEDIUM — 출고번호를 `REL-{date}%` 전역 COUNT+1 로 만드는데 `release_number` 는 UNIQUE(0003:76). 같은 파일 :501 은 이미 MAX 기반 법인 채번으로 전환됨. — 동시 출고·출고 삭제 후 재생성에서 UNIQUE 충돌 500. 현재 UI 호출처가 없어 API 경로 한정. — caller/consumer checked: `migrations/0003_add_inventory_tables.sql:76`, `src/routes/inventory.ts:499-501`

- `src/routes/inventoryValuation.ts:23-26` — MEDIUM — `PUT /method` 가 `UPDATE settings ... WHERE setting_key='inventory_valuation_method'` 만 하고 `changes` 를 확인하지 않는다(설정 행이 없으면 0행 갱신). — 평가방법 변경이 반영되지 않았는데 success:true 가 나가고, `GET /method` 는 계속 기본값 WEIGHTED_AVG 를 돌려준다. UPSERT 필요. — caller/consumer checked: `src/routes/inventoryValuation.ts:10-15`

- `src/routes/priceSheets.ts:28` vs `src/routes/priceLists.ts:237` — MEDIUM — 고객에게 나가는 단가의 기준값이 갈린다: 단가표 세트는 `sales_price || base_price`, 단가표 미리보기는 `base_price` 단독, 주문서 제안(prices.ts:158)은 `base_price × (1+adjustment_percent)`. — `sales_price` 가 설정된 품목에서 같은 거래처·같은 품목이 화면마다 다른 금액으로 표시된다(세트 인쇄물과 미리보기가 불일치). — caller/consumer checked: `src/routes/priceList.ts:244` (`sales_price || base_price`), `src/routes/prices.ts:150-160`

### 확인했지만 이상 없음 (1줄 나열)

`utils/unitConvert.packFactor` 쓰기경로 4곳(po-receive:158·inventory 입고:528·입고취소:763) 전부 `packFactor` 사용으로 정합 · `utils/supplierPayable` 바인드 순서(3서브쿼리×2) 정상 · `autoDeductInventory`/`autoDeductPostProcessingMaterials` 재고·기록·원장 단일 batch + UNIQUE 롤백 처리 정상 · `autoDeductRestore` OUT 행 DELETE 방식(역분개 아님) + `STOCK_RESTORE` 로그 정상 · `inventoryZone` 법인 인식 리맵 + 80 청크 정상 · `inventory.ts` SELECT 서브쿼리↔JOIN 바인드 순서(:60/:68) 정상 · `materialShortageCheck` 바인드 순서 정상 · `bom.ts` `NOT IN` 은 `product_item_id NOT NULL` 이라 NULL 함정 없음 · `purchase_order_items.line_status` DEFAULT 'PENDING' 이라 입고 대기 큐 누락 없음 · `listFilter.ts`/`buildPrFilter`/`buildReceiptFilter` SSOT 및 tie-break 정상 · `excludePurchaseNonCounterpartiesSql` 은 리터럴 인라인이라 바인드 영향 없음 · `po-receipts.ts:398` receiving-queue 바인드 순서 정상 · `inventoryCount` add-items 의 TRANSFER_IN balance_after 서브쿼리는 batch 순서상 UPDATE 반영값을 읽어 정상 · `storageZones` 삭제 가드(품목·실재고 이중 확인) 정상 · `priceSheets.dedupeIds` UNIQUE 방어 정상.

### 기각한 후보 (최대 5줄, 이유)

- `inventoryCount.ts:817` 실사 승인의 `quantity = ?` 절대 덮어쓰기 — 실사의 정의 자체가 스냅샷 확정이고 `GET /:id` 가 `current_quantity` 를 경고용으로 이미 내보낸다. 설계 의도.
- `consumptionForecast.ts:110` `cons.total / weeksBack` (활성 주 수가 아닌 분석 창으로 나눔) — 필드명이 「분석기간 주간평균」이고 `active_weeks` 를 별도 노출하므로 오류 아님.
- `po-receive.ts:214-218` `willAllReceived` 가 accepted 가 아닌 received 기준 — 발주 이행 여부는 수령 기준이 맞고, 불합격분은 inspection_status/PENDING_REVIEW 축이 따로 받는다.
- `prices.ts:87-97` 청구면적 SQL 사본(`orderLineAmount` 정본과 중복) — 값 자체는 10cm 올림·최소 1m 규칙과 일치했고 주석이 의도를 명시. 게이트 미포함은 설계 부채지 결함 아님.
- `items.ts:934-937` 중복검사가 두께를 무시 — 브리핑에서 기보고로 제외 지정.
