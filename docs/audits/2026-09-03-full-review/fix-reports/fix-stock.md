# 번들 ③ 수정 보고 — 재고 원자성·수량 하한·구매·품목 라우트 (2026-09-03 전수 리뷰)

브랜치 `session/fix-stock` · 커밋 7개 · **수정 33 / SKIPPED 0 / 결정 보류 1**(단가 기준 불일치, 아래 §결정).

## 1. 항목별 결과

### 원자성 · 수량 하한
| 항목 | 위치 | 변경 |
|---|---|---|
| POST `/receipts` 가드·하한·분리 batch | `src/routes/inventory.ts:478` | `requireEditOrRole('/receiving','ADMIN','MANAGER')` · quantity/unit_price `Number()` 강제 + 비유한·≤0 → 400(하한 자체는 이미 있었고 문자열이 통과하던 구멍을 막음) · 재고 UPDATE + 원장 INSERT **한 batch**, balance_after 서브쿼리(`:548`) · 원장 품목당 1행 합산 · batch 실패 시 헤더 보상 삭제(`:596`) |
| po-receive 하한 | `src/routes/purchaseOrders/po-receive.ts:97` | received ≤ 0 · accepted/rejected < 0 · 비유한 → 400 |
| po-receive 절대값 덮어쓰기 | `po-receive.ts:294`, `:310` | 락 이전 prefetch(`invQtyMap`) 제거 → `INSERT OR IGNORE` + `quantity = quantity + ?`(base) + 원장 서브쿼리, 같은 batch. 원장은 품목당 1행 합산(발주 2줄 같은 품목 UNIQUE 회피) |
| adjustments 분리 쓰기 | `inventory.ts:1037` | 재고 행 생성·조정기록·원장·UPDATE 를 한 batch(`:1066`). 부족 판정은 `INSERT…SELECT … WHERE quantity+?>=0` 와 마지막 UPDATE 가 같은 술어 공유 → changes=0 이면 기록도 0행. 조정 0 → 400 추가 |
| transfer 3분할 쓰기 | `inventory.ts:1320` | 원장 OUT·도착 생성·도착 가산·원장 IN·출발 차감을 한 batch(`:1353`). 출발 행은 **마지막 문장에서만** 바뀌므로 앞 4문장이 같은 `quantity >= ?` 스냅샷을 본다(#459 TOCTOU 유지) |
| scan stock-out 분리 쓰기 | `src/routes/scan.ts:303` | 원장 `INSERT…SELECT`(같은 술어) + UPDATE 한 batch, `res[1].meta.changes` 로 부족 판정 |
| inventoryCount count 바인드 | `src/routes/inventoryCount.ts:61` | count 쿼리에 `sz` JOIN + scope=mine 절 재조립 |
| 실사 승인 UNIQUE(품목×창고) | `inventoryCount.ts:850` | `reference_id = inventory_count_items.id`(라인=품목×창고 당 1) · notes 에 실사번호·count_id·line 보존 · `INSERT OR IGNORE` — §결정 참고 |
| returns RESOLVED 라인별 원장 | `src/routes/returns.ts:179` | **실제 결함 확인**(같은 item_id 주문라인 2개 → 같은 UNIQUE 키). (법인, 품목) 단위로 수량 합산 후 재고·원장 1행 |
| 매입확정 원장 축 | `src/routes/purchaseInvoices.ts:146`, `:176` | 품목별 `packFactor` 조회 → `unit_price = price/pack`, `total_amount = quantity(base) × price/pack` |
| 주문 삭제 권한 순서 | `src/routes/orders/core.ts:602` | `needsSoftDelete` 계산 후 **재고 환원 3종보다 앞**에 ADMIN 검사. 뒤의 중복 검사는 제거 |

### 채번 · 전이 · SELECT
| 항목 | 위치 | 변경 |
|---|---|---|
| 재발주·빠른발주 채번 | `src/routes/purchaseOrders/po-special.ts:153`, `:266` | `getNextEntitySeqNumber(…, {suffix:'P'})` — core.ts POST 와 동일. `getNextSeqNumber` import 제거 |
| RCV 채번 | `po-receive.ts:64` | `getNextEntitySeqNumber(base:'RCV-')`, 법인 확정을 채번 앞으로 이동 |
| REL 채번 | `inventory.ts:927` | `getNextEntitySeqNumber(base:'REL-')` |
| PO 전이·수정·삭제 가드 | `src/routes/purchaseOrders/core.ts:28`(헬퍼), `:424` PUT, `:603` status, `:676` DELETE | `poHasReceivedLines`: 라인 하나라도 received_quantity>0 이면 PUT 400 · DRAFT 복귀 400 · DELETE 400. `PARTIAL_RECEIVED→CANCELLED`(잔량 취소)는 유지 |
| purchaseRequests SELECT 열 | `src/routes/purchaseRequests.ts:641`, `:756` | convert: `request_number, notes` 추가 · auto-convert: `request_number, supplier_id` 추가(폴백 복구) |

### entity · 역할 가드
| 항목 | 위치 | 변경 |
|---|---|---|
| GET `/receipts/:id` | `inventory.ts:874` | `entityFilter(c,'ir')` |
| priceList 정책 삭제 | `src/routes/priceList.ts:162-178` | 소유 조회 실패 → 404, 검증 뒤에만 clients NULL·rules·헤더 삭제를 한 batch |
| weeklyPurchase MRP | `src/routes/weeklyPurchase.ts:45` | `o.entity_id = effectiveEntity`(같은 응답의 재고·발주중과 동일 축) |
| `/my-lines`·`/my-lines-count` | `src/routes/purchaseOrders/po-queries.ts:238`, `:290` | `entityFilter(c,'po')`, 바인드 순서 = ef → user.id |
| purchaseInvoices GET `/:id` | `purchaseInvoices.ts:362` | 미존재/타법인 → 404 |
| adjustments/releases/transfer 가드 | `inventory.ts:903`, `:1037`, `:1320` | `requireEditOrRole('/inventory','ADMIN','MANAGER')` |
| purchaseInvoices POST 가드 | `purchaseInvoices.ts:312` | `requireRole('ADMIN','MANAGER')`(형제 confirm/match 와 동일) |
| prices 최근단가 서브쿼리 | `src/routes/prices.ts:251`, `:270` | `entityFilter(c,'po2'/'o2')` 를 서브쿼리에 추가, 바인드는 바깥 ef 뒤에 |

### 잔존 캐시 · MEDIUM
| 항목 | 위치 | 변경 |
|---|---|---|
| templates purchase_balance | `src/routes/purchaseOrders/templates.ts:279` | 누적 UPDATE 제거 |
| consumption PO 상태 | `inventoryCount.ts:191` | `po.status IN ('CONFIRMED','PARTIAL_RECEIVED','RECEIVED')` |
| consumptionForecast RECEIPT_CANCEL | `src/utils/consumptionForecast.ts:92` | `COALESCE(reference_type,'') != 'RECEIPT_CANCEL'` |
| 실사 승인·저장 batch 청크 | `inventoryCount.ts:858`, `:561` | 승인 78문(=26품목×3) 청크 · 저장 80 청크 |
| IN(...) 무상한 4곳 | `src/routes/storageZones.ts:507` · `src/routes/priceLists.ts:200` · `prices.ts:681`, `:703` | 80 청크 |
| inventoryValuation PUT | `src/routes/inventoryValuation.ts:27` | `INSERT … ON CONFLICT(setting_key) DO UPDATE` |
| items PUT description/is_active | `src/routes/items.ts:1277` | 전송 시에만 SET(`!== undefined` 패턴) |
| items count 필터 | `items.ts:160`, `:223` | for_user 허용그룹 절을 한 번 만들어 본/count 양쪽에 적용 · `item_group` 절 추가 |
| priceSheets vs priceLists 단가 기준 | `src/routes/priceSheets.ts:28` vs `src/routes/priceLists.ts:237` | **변경 없음** — §결정 |

## 2. 설계 결정
- **쓰기 가드 = `requireEditOrRole(page,'ADMIN','MANAGER')`.** 재고 라우터 형제(`/:id/settings`, `/bulk-assign-zones`)는 인라인 ADMIN/MANAGER, po-receive 는 라우터 read 게이트뿐이라 "가장 가까운 형제"가 둘로 갈린다. 가산형 가드는 ADMIN·MANAGER 를 종전대로 통과시키고 그 외 역할은 `/receiving`·`/inventory` **can_edit** 로 통제한다(permissions.ts 의 "회귀 0" 규약). ⚠️ prod 에서 OPERATOR 등이 can_access 만으로 수기입고를 하고 있었다면 `/permissions` 매트릭스에서 can_edit 부여가 필요하다 — 배포 전 확인 항목. purchaseInvoices POST 는 형제와 똑같이 `requireRole` 로 맞췄다.
- **UNIQUE 참조키 전략(실사 승인)** = `reference_id = 실사 라인 id`. 후보 ②(품목 단위 합산)는 storage_zone_id 가 1개만 남아 창고별 원장이 사라진다. 라인 id 는 (품목, 창고) 당 하나라 인덱스를 그대로 두고 창고별 행을 살린다. STOCK_COUNT reference_id 를 실사로 되짚는 소비처는 없고(constants 라벨·`pages/inventory.ts` 옵션뿐) 실사 번호·count_id 는 notes 에 남긴다. 청크 경계 실패 → 재승인 시 UPDATE 는 절대값(멱등), 원장은 같은 키라 `OR IGNORE` 가 중복을 막는다. 상태 APPROVED 전환은 전 청크 반영 뒤.
- **원장 품목당 1행 합산**(receipts·po-receive·receipt-cancel·returns·releases): 같은 품목 다중 라인이 UNIQUE(0293) 키에서 충돌해 batch 전체를 뒤집는 결함이 5 경로에 공통이었다. 입고/출고 **라인 테이블은 사용자 입력대로 줄별 보존**, 원장만 합친다. 단가는 금액÷base수량(단일 라인일 때 종전 `unitPrice/pack` 과 동일).
- **단일 batch 안의 부족 판정**(adjustments·scan·transfer): 기록 문장을 `INSERT…SELECT … WHERE <충분 조건>` 으로 먼저 넣고, 재고를 바꾸는 UPDATE 를 **마지막**에 같은 술어로 둔다. batch 는 한 트랜잭션·순차 실행이라 셋이 같은 스냅샷을 보고, 마지막 UPDATE 의 `meta.changes` 하나로 판정한다 — 보상 삭제 코드가 필요 없다.
- **releases** 는 다품목이라 문장별 가드를 못 쓴다 → 사전 재고 검증(품목 합산)을 유지하고 `quantity = quantity - ?` 상대 차감으로만 바꿨다(레이스 시 절대값 되살림 대신 최악이 음수 잔량). 
- **PO 전이**: `PARTIAL_RECEIVED → CANCELLED` 는 잔량 취소로 유지, `CANCELLED → DRAFT` 만 입고 이력 있으면 차단. PUT/DELETE 도 status 대신 `received_quantity > 0` 로 판정.
- **단가 기준 불일치(priceSheets `sales_price||base_price` vs priceLists 미리보기 `base_price` vs 주문서 `base_price×(1+adj)`)** — 지시대로 미변경. 오너 결정 필요: ① 단가표 세트가 정본(`sales_price` 우선)이면 미리보기·주문서 제안도 `sales_price` 를 보게 통일 ② 반대면 priceSheets 를 `base_price` 로. 현재는 `sales_price` 가 설정된 품목에서 화면마다 다른 금액이 나간다.

## 3. 게이트 결과
| 게이트 | 결과 |
|---|---|
| `npm run typecheck` | 통과 |
| `npm run build` | 통과 (445 modules) |
| `npm run audit:entity` | 67/67 통과, 누락 0 |
| `node scripts/sort-audit.cjs` | P1 0 (P2 2건은 기존·미접촉 파일) |
| `npm run audit:subquery` | exit 0 (P1 표시 27건은 정보성·기존 코드, 본 변경분 없음) |
| `npm run test:calc` | 전부 통과 (orderline 30 · finishing 28 · slot 67 · dims 19 · credit 11 · stock-unit 30 · valuation 22 · items 7) |
| `npm run test:stock-unit` · `test:stock-valuation` | 30/30 · 22 통과 |
| `npm run smoke` (3103) | **114/114** |
| `npm run test:symmetry` (3103) | **28/28** — 기존 17 + 신규 ⑥ 11(수량 0/음수/비숫자 400 · 거부 시 재고 불변 · 같은 품목 2줄 입고 200 · 재고Δ==원장Δ · 상세 200 · 취소 200 · 취소 후 재고·원장 원복) |
| `npm run test:ship-stock` (3103) | 20/20 |
| `npm run test:autodeduct` (3103) | 20/20 (1회 로그인 rate-limit 429 → 50초 대기 후 재실행 통과) |
| 수동 스크립트(3103, 30항목) | 전부 통과 — adjustments 초과/0/−5 · scan stock-out 정상/초과 · transfer 왕복/초과(총재고 불변·원장 2행) · `/inventory-counts?scope=mine` 200 · valuation PUT 반영 · PO 생성→CONFIRMED→음수 입고 400→같은 품목 2줄 입고 200(`RCV-E1-…`, 원장 PURCHASE 1행, 재고Δ==원장 수량)→CANCELLED 허용→DRAFT 400→DELETE 400→입고 취소 원복 · purchase-invoices/:id 404 · items PUT description/is_active 보존 |

미검증(게이트 밖): 매입확정 원장 축(pack 품목 인보이스 흐름 e2e 없음 — 타입체크·수식 대조로만) · MANAGER 계정 주문 삭제 403 순서(로그인 계정이 admin 뿐) · 실사 2창고 승인(로컬 D1 에 2창고 재고 픽스처 없음 — 라인 id 유일성으로 논증).
서버는 검증 후 3103 리스너(workerd)와 그 부모 wrangler node 만 종료했다.

## 4. 커밋 (`session/fix-stock`, base 16fdd316)
| 해시 | 내용 |
|---|---|
| `238f0888` | fix(stock): inventory.ts 입고/출고/조정/이동/취소 원자성·가드·하한, scan, returns |
| `3e41815e` | fix(po-receive): 상대 누적·RCV 법인 채번·하한 |
| `5f78c1e9` | fix(inventory-count): count 바인드·라인 참조키·청크·PO 상태 |
| `70631828` | fix(purchase-invoices,orders): base 축·POST 가드·404 / 삭제 권한 순서 |
| `5a9acb73` | fix(purchase-orders): E{eid} 채번·입고 가드·entity 필터·purchase_balance 제거·PR SELECT |
| `c5d55a76` | fix(items,prices,inventory): entity 스코프·IN 청크·설정 upsert·부분 PUT |
| `be1b89a3` | test(symmetry): 입고 하한·원자성·취소 환원 11항목 |

푸시·배포 없음. 로컬 공유 D1 에는 e2e·수동 검증 데이터(조정 +20 시드 3회, PO #27~, 입고/취소)가 남아 있다(prod 무관).
