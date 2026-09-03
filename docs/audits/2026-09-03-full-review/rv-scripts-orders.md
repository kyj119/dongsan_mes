# 슬라이스 E 결과 — 검사 13파일 전문 정독 (약 8,900줄) + 슬라이스 전체 31파일 대상 기계 점검 2종

정독: `shared/deliverySlot.js` · `shared/finishingLabel.js` · `orderForm/{calc,client,finishing,parent}.js` · `orderForm/{itemRow,sheet}.js`(주요부) · `orders.js` · `shipments.js`(주요부) · `cards/actions.js` · `scan.js` · `schedule.js`
대조한 서버 정본: `utils/{orderLineAmount,productionDeadline,finishingLabel}.ts` · `constants/deliveryMethod.ts` · `routes/orders/{create,update,lifecycle,queries,listFilter}.ts` · `routes/{shipments,quotations,scan,cards/lifecycle}.ts`
기계 점검: ①페이지별 전역 top-level 선언 충돌 스캔(브레이스 깊이 파서, 5개 페이지 그룹) ②슬라이스 14개 스크립트의 모든 fetch/axios 엔드포인트 실재 검증(20개 표본 전수)

---

### 조치 필요 (심각도순, 12건)

- `src/scripts/orders.js:869` · `:902` — **HIGH** — `showModal(...)` 이 코드베이스 어디에도 정의돼 있지 않다(`grep -rn "showModal" src/` 결과 = 이 두 호출뿐, 정의 0). — 주문목록 상태변경에서 출고완료를 고르면 서버가 `requires_confirmation` 을 돌려주고(HTTP 200) `:828` 이 `showCardConfirmModal` → `showModal` 로 들어가 ReferenceError. 미완료 카드가 있는 주문은 **목록에서 출고 처리를 끝낼 수 없다**. 같은 이유로 자재 부족 경고(`:816`)도 뜨지 않고 "상태 변경 중 오류" 토스트만 남는다. — counterpart checked: `src/routes/orders/lifecycle.ts:207-217`

- `src/scripts/orderForm/sheet.js:80` — **HIGH** — 주문서의 「견적서로 저장」이 `POST /api/orders` + `status:'QUOTATION'` 으로 **orders 테이블에** 쓰고 `/quotations` 로 이동한다. — 견적서 목록은 분리된 `quotations` 테이블만 조회하므로(0191 분리) 저장 성공 토스트 뒤 빈 목록에 떨어진다. 정상 경로인 `quotationForm.js:509` 는 `POST /api/quotations` 를 쓴다. — counterpart checked: `src/routes/quotations.ts:82` · `:112`

- `src/scripts/orderForm/parent.js:1596-1598` — **HIGH** — 주문 복사(`?copy=1`) 경로가 `Object.values(idMap).forEach(pid => updateParentChildCount(pid))` 로 **모든** 부모행에 자식 수 재계산을 건다. `idMap` 은 묶음이 아닌 일반 라인까지 담는다. — 묶음 품목이 1건이라도 있는 주문을 복사하면 일반 라인 전부가 `quantity` 0 으로 덮이고(`:783-784`) 서버는 `item.quantity || 1` 로 1을 저장 → **수량이 조용히 1로 줄어든 복사본**이 만들어진다. 수정 경로(`:1306-1311`)는 자식 있는 부모만 골라 올바르다. — counterpart checked: `src/scripts/orderForm/parent.js:774-785` · `src/routes/orders/create.ts:313`

- `src/scripts/orderForm/parent.js:1802-1811` — **HIGH** — 견적→주문 프리필이 `source_quotation_id` 히든 필드를 만들어 폼에 붙이지만, 제출 직렬화기가 이 필드를 **읽지 않는다**(`calc.js:734-772` 의 `orderData` 에 해당 키 없음). — `create.ts:176` 의 `orderData.source_quotation_id || orderData.quotation_id` 가 항상 null → `orders.quotation_id` 미기록. 견적 전환수(`orders.quotation_id` COUNT)와 `quotations.first_converted_at` 갱신(`create.ts:234`)이 영구히 0/NULL. — counterpart checked: `src/routes/orders/create.ts:176` · `:226` · `:234-241`

- `src/scripts/orderForm/sheet.js:152` · `:155` · `:179` — **HIGH** — 「후가공 일괄 적용」의 방향 키가 `sel.dataset.dir` 인데 마감 셀렉트가 실어 보내는 속성은 `data-direction` 이다. `dataset.dir` 이 undefined 라 폴백 `sel.className` 이 쓰이고, 4개 셀렉트의 className 이 **동일**해 키가 하나로 뭉친다. — 첫 행의 상/하/좌 값이 버려지고 마지막(우) 값 하나가 나머지 전 행의 **4변 전부**에 복사된다(그대로 저장된다). 같은 함수의 펀칭 복사는 `.pp-punch-check` 를 찾는데 실제 클래스는 `.pp-punching-check` 라 항상 무동작. — counterpart checked: `src/scripts/orderForm/finishing.js:252` · `:290`

- `src/scripts/orderForm/calc.js:147-151` — **MEDIUM** — `min_billing_side_<id>` 히든은 품목 검색 선택 시에만 채워진다(`itemRow.js:223-224`). 수정·복사·견적 프리필은 그 경로를 타지 않아 값이 `''` → `parseFloat('')`=NaN → MIN_SIDE 가 100 으로 되돌아간다. — `items.min_billing_side_cm = 0` 인 UV 판재(0549 UV-JJN-06T)를 수정하면 화면 자동값이 실제보다 커지고, 그 차이 때문에 복원 로직(`parent.js:1222-1245`)이 그 행을 **수동 에누리로 오인 마킹**한다. 마킹된 행은 `calc.js:176-179` 가 금액 갱신을 건너뛰므로, 이후 규격·수량을 고쳐도 금액이 따라오지 않고 옛 금액이 수동 override 로 전송된다. — counterpart checked: `src/utils/orderLineAmount.ts:88-94` · `migrations/0549_birch6t_real_area_billing.sql:28`

- `src/routes/orders/update.ts:207` · `:233` — **MEDIUM** — `internal_notes = ?` 에 `orderData.internal_notes || null` 을 무조건 대입하는데 주문서 payload 에는 그 키가 아예 없다(`calc.js:734-772`). — 이관·API 로 들어온 특이사항이 「배송지 한 줄 수정」만으로 지워진다. 이 값은 작업지시서 인쇄의 특이사항·비고란 정본이다. 견적서 축도 같은 모양(`quotations.ts:459,469` ↔ `quotationForm.js`). 옆줄의 `sales_rep_id` 는 `COALESCE(?, sales_rep_id)` 로 이미 이 사고를 막아 뒀다. — counterpart checked: `src/scripts/cards/detail.js:477` · `:757` · `src/routes/cards/queries.ts:235`

- `src/routes/orders/update.ts:194-244` — **MEDIUM** — `sheet_layout_params` 를 UPDATE 문이 다루지 않는다. 클라는 라인마다 보내고(`calc.js:649-652`) 생성 경로는 `orders.sheet_layout_params` 에 저장한다(`create.ts:187,221-224`). — 주문 수정에서 판짜기(합판) 파라미터를 바꾸거나 지워도 반영되지 않고 옛 값이 그대로 남아 IA 의 SheetLayout 합본 처리를 계속 지배한다. — counterpart checked: `src/routes/orders/create.ts:221-224` · `src/scripts/orderForm/sheet.js:966` · `:995`

- `src/scripts/orderForm/parent.js:1130-1200` — **MEDIUM** — 수정·복사 복원이 `assigned_entity_<id>`(품목 담당법인 셀렉트, `itemRow.js:135`)를 **복원하지 않는다**. GET 응답에는 값이 실려 온다. — 셀렉트가 빈 값이라 `calc.js:613` 이 `undefined` 를 보내고 `update.ts:438-440` 이 `recommendAssignedEntity` 추천값으로 덮는다 → 손으로 지정한 담당법인이 수정 저장마다 추천값으로 되돌아가고, 이어서 `recalcOrderBillingGroups` 가 청구 분할까지 다시 나눈다. — counterpart checked: `src/routes/orders/update.ts:438-441` · `src/routes/orders/core.ts:456`

- `src/scripts/orderForm/parent.js:1734` — **MEDIUM** — 견적 프리필이 `document.querySelector('[name="delivery_method"]')` 로 배송방법을 찾는데, 그 셀렉트에는 `name` 속성이 없다(`id="deliveryMethod"` 뿐, 페이지 전체에 `name="delivery_method"` 0건). — 항상 null 이라 `if (dm)` 가드에 걸려 조용히 통과 → 견적서의 배송방법이 주문서에 실리지 않고 기본값(대신택배)으로 저장된다. — counterpart checked: `src/pages/orderForm.ts:123`

- `src/scripts/cards/actions.js:94` — **MEDIUM** — `clientName.replace(/'/g, '\x27')` 는 무동작이다. `\x27` 이 곧 작은따옴표라 「따옴표를 따옴표로」 바꾼다(이스케이프 의도가 실현되지 않음). — 거래처명에 `'` 가 들어가면 뒤에서 만드는 `onclick="togglePrintDoneGroup('…')"` · `bulkShipByClient('…')` 속성이 깨져 그 거래처 그룹의 아코디언과 **일괄 출고 버튼이 동작하지 않는다**. — counterpart checked: `src/scripts/cards/actions.js:97` · `:104` · `:170`

- `src/scripts/shipments.js:51` · `:55` — **MEDIUM** — 섹션 분류가 `'직배'`·`'직접배송'` 두 문자열만 하드코딩 비교한다. 같은 페이지에 이미 실려 있는 정본 `window.MES_SLOT.isSlotMethod()` 는 `'직접 배송'`·`'자차배송'` 까지 별칭으로 받는다. — 별칭 표기로 남은 주문은 직배 섹션이 아니라 「기타」로 떨어져 라벨·안내용지·출고 확정 대상에서 빠진다(기타 섹션에는 출고 확정 버튼이 없다). — counterpart checked: `src/scripts/shared/deliverySlot.js:19-24` · `src/constants/deliveryMethod.ts:31-35`

---

### 확인했지만 이상 없음 (1줄 나열)

전역 스코프 충돌 0건(orderForm·cards·shipments·productionReports·orders 5개 페이지 그룹 파싱 — orderFormDist.js 는 `orderFormDistPage` 가 별도 `pageScript` 로 렌더해 생산 주문서와 스코프를 공유하지 않는다, `pages/orderForm.ts:14` vs `:595`) · 슬라이스 14개 스크립트의 엔드포인트 전수 실재(표본 20개 모두 라우트 확인, 404 될 호출 0건) · `utils/finishingLabel.ts` ↔ `shared/finishingLabel.js` 분기별 논리 동일(4방 축약·좌우 우선 정렬·펀칭 4모서리·margin_ 제외·directions 객체 처리까지 일치) · `utils/productionDeadline.ts` ↔ `shared/deliverySlot.js` 상수·산식 동일(AM dayOffset −1/18:00, PM 0/13:00, 대표시각 09:00·14:00, 별칭 4종) · 오전편 선택 가드의 시각 비교는 KST(`nowKst()` = UTC+9 naive, `client.js:249-273`) · 라인 에누리 왕복(수동 마킹 → payload `amount` → `computeLineAmount` hasManual)은 대칭 · 배송지 3축(0535) 수집·분해 왕복 정상(대신화물 시 상세·우편번호 제외까지) · 출고 검수 체크리스트 응답 계약 일치(`shipment_id`·`order`·`lines`·`group`·`line_total`·`chk_done`) · 합배송 파트너 필드 계약 일치 · 저장·출고 버튼 이중제출 가드 존재(`isSubmitting`·`_shipInProgress`·`_revertInProgress`·`_statusChangeInProgress`·`_bulkShipInProgress`) · 카드 상세/스케줄 역할 게이트는 8역할 집합과 일치.

### 기각한 후보 (5줄)

- 견적 프리필의 행 id 가정(`qIdx+1`) — `addItemRow` 가 DOM 최대 id 에서 재계산하고 컨테이너를 비운 뒤 호출하므로 1..N 이 맞다(`itemRow.js:380-387`).
- `confirmShipSection` 이 체크박스 선택을 무시 — 버튼 라벨이 「출고 확정」(형제 버튼만 「선택 라벨 출력」·「선택 발송」)이고 확인창에 전체 건수를 보여주므로 섹션 전체가 설계다.
- `calc.js:660` 품목 자동정렬 비교자가 자식행에 0을 돌려주는 비일관 비교자 — 부모·자식 연결은 인접이 아니라 `client_group_id` ↔ `parent_client_id` 로 맺어져 순서가 흐트러져도 데이터는 안전하다.
- `orderFormDist.js` 와 `orderForm/*` 의 동일 이름 12개(`selectClient`·`itemCount` 등) — 위 「이상 없음」의 렌더 분기로 같은 문서에 실리지 않는다.
- `schedule.js:290` 의 30초 폴링 — 조회 2건뿐이고 CF 과금 가드가 지목한 「폴링 × 무거운 집계」에 해당하지 않아 제외.
