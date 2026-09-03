# 묶음 ④c 수정 보고 — 주문·카드·생산·출고 라우트 + 주문서·거래처 페이지

브랜치 `session/fix-routes-orders` · 기준 `16fdd316` · 커밋 11개
**수정 23건 · SKIP 1건** (배정 항목 24건 기준)

---

## HIGH — 라우트

| # | 위치 | 조치 |
|---|---|---|
| 1 | `src/routes/production.ts:127` | `POST /logs` 의 선택 필드(weather·temperature·humidity·supervisor_id·notes)를 `?? null` 로 접었다. D1 은 `undefined` 바인드를 거부해 결정적 500 이었다. |
| 2 | `src/routes/orders/update.ts:41` | `orderEntityId = existingOrder.entity_id ?? (getEntityId(c) \|\| 1)` 신설. `:445` 담당법인 추천과 `:678`·`:702` 카드 재생성이 세션 법인 대신 **주문 법인**을 쓴다(생성 경로 `create.ts:294` 와 동일). |
| 3 | `src/routes/orders/operations.ts:352` | 견적→주문 전환에 카드 생성 추가(유통이면 전 라인 `shipment_ready=1`). 이미 카드가 있으면 건너뛰어 멱등. 형제 `src/routes/quotations.ts:735` 도 같은 결함이라 함께 수정. |
| 4 | `src/routes/printEvents.ts:648` | `/batch` 가 `applyEventToCard` → 타일완료 → `autoCheckCardItem` 경로를 타게 바꿨다(단건 핸들러와 동일). batch 가 하던 CANCEL 상태이력 기록은 `applyEventToCard:212` 로 옮겨 두 호출부가 함께 갖는다. |
| 5 | `src/routes/orders/core.ts:246`·`:270` | `GET /:id/timeline` 과 `GET /:id/invoice` 에 `orderVisibilityFilter` 추가(형제 `GET /:id` 와 같은 모델). |
| 6 | `src/routes/cards/lifecycle.ts:1160` | print-toggle 에 `cardEntityScope` 추가(카드를 먼저 단독 조회 — 그 절이 별칭 없는 `order_id` 를 쓴다). `:1216` PRINT_DONE 전이에 `pp_status` + `card_status_history` 추가(`PATCH /:id/complete` 와 동일). `:1108` `POST /generate/:orderId` 에 주문 법인 가드 추가. |
| 7 | `src/routes/orders/operations.ts:296`·`:399` | convert-to-order·send-email 이 주문을 `orderVisibilityFilter` 로 읽는다. |
| 8 | `src/routes/orders/create.ts:94` | 본문 `billing_entity_id` 는 전체모드(entityId 0) 또는 ADMIN/MANAGER 만 세션 법인 외 값을 쓸 수 있다. 그 외엔 세션 법인으로 접는다. |
| 9 | `src/routes/orders/create.ts:154` · `update.ts:196` | 헤더 에누리를 `0..공급가+부가세` 로 clamp. **저장값도 clamp 값**을 쓴다(표시=계산 일치). |
| 10 | `src/routes/claims.ts:113` · `src/routes/returns.ts:123` | `resolved_amount`·`refund_amount` 음수 거부 + 연결 주문 청구액 상한. 초과·음수는 400. |

### 8번 판단 근거
`billing_entity_id` 를 보내는 클라이언트는 **현재 0곳**이다(`src/scripts`·`src/pages` 전수 grep). 메모 `design-order-intake-split` 의 "청구법인 헤더 셀렉트는 미추가(현 로그인 법인 유지, 결정)" 와 일치한다. 법인협업 접수는 세션≠청구 법인이 정상이라 ADMIN/MANAGER 예외를 남겼다.

### 7번 부분 미이행 — 수신 주소 제한
`POST /:id/send-email` 은 이미 라우터 자체가 `requireRole('ADMIN','MANAGER')` 다. 지시문의 "ADMIN/MANAGER 가 아니면 거래처 연락처로 제한" 은 **도달 가능한 호출자가 전부 ADMIN/MANAGER** 라 공집합 조건이 된다 — 코드 변경 없음. 실제 노출(타법인 주문 메일 발송)은 entity 가드로 막았다. 화이트리스트를 강제하면 임시 주소로 보내는 정상 업무가 깨지므로 넣지 않았다.

---

## HIGH — 페이지 / 거래처

| # | 위치 | 조치 |
|---|---|---|
| 11 | `src/pages/orderForm.ts:124`·`:474` · `src/pages/clients.ts:230` | 배송방법 셀렉트 3곳을 `deliveryMethodOptionsHtml()` 로 교체 → 폐기값 `직배` 소멸, SSOT(`constants/deliveryMethod.ts`)만 값을 만든다. |
| 12 | `src/pages/clients.ts:41` | 거래처 목록 「배송」 필터가 영문 enum(SAME/FREIGHT/DIRECT/PICKUP)이라 항상 0건이었다 → 같은 SSOT 옵션. 서버(`src/routes/clients.ts:105`)는 `deliveryMethodMatchValues()` 로 **정본 + 과거 표기**를 함께 IN 매칭한다(이관·외부유입 잔존 대비). |
| 13 | `src/routes/clients.ts:849`·`:869` | INSERT 에 `postal_code`·`address_detail`·`delivery_address`·`notes` 추가. |
| 14 | `src/routes/clients.ts:972` | 동적 UPDATE 에 `postal_code`·`address_detail` 추가(둘 다 컬럼 존재·SELECT 는 이미 함). |
| — | `src/pages/orderForm.ts:530` | **SKIPPED** — orders-scripts 담당 항목(지시문 명시). |

신규 헬퍼 = `src/constants/deliveryMethod.ts:66` `deliveryMethodMatchValues()` · `:78` `deliveryMethodOptionsHtml()`.

---

## MEDIUM — 라우트

| # | 위치 | 조치 |
|---|---|---|
| 15 | `src/routes/orders/update.ts:360`·`:373` | 카드 재생성 삭제 batch 에 `print_file_map.card_id`·`order_item_id` SET NULL 추가(하드삭제 `core.ts:669,687` 와 대칭). |
| 16 | `src/routes/orders/lifecycle.ts:175` | SELECT 에 `order_type` 추가 + `:309` 캐스팅 제거. 유통 주문 gap 오탐이 실제로 꺼진다. |
| 17 | `src/routes/shipments.ts:1289` | PATCH status 의 SHIPPED·IN_TRANSIT 가 `order_status_history` 를 남기고 batch 후 `deductStockLinesOnShip` 을 부른다((주문×품목×법인) OUT 행 기준 멱등). |
| 18 | `src/routes/shipments.ts:946` | `POST /shipments` 에 `deductStockLinesOnShip` 추가(후가공 차감 바로 앞). |
| 19 | `src/routes/shipments.ts:1226` | **짝 보강(지시 외, 필수)** — 취소 환원이 `orders.status='SHIPPED'` 조건 안에만 있어, `POST /shipments` 로 출고한 뒤 sync-statuses 전에 취소하면 차감만 남았다. 마지막 활성 출고 취소면 주문 상태와 무관하게 환원한다. `restoreStockLinesOnUnship` 은 OUT 행이 없으면 no-op 이라 안전. |
| 20 | `src/routes/shipments.ts:665` | `/dashboard/counts` 가 `?date=` 를 받는다(형제 `/dashboard` 와 동일). |
| 21 | `src/routes/productionReports.ts` 전 라우트 | `date(print_completed_at)` 34곳·`strftime` 5곳을 `printEventKstDay()`/`kstMonth(printEventAt())` 로 교체. `:28` `total_sqm` 에 `copy_total` 곱셈 추가(`printEvents.ts:885` 와 동일 산식). |
| 22 | `src/routes/printEvents.ts:1281` | `/link` 이 `print_file_map.order_item_id` 를 **card_items** 에서 뽑는다. `cards.order_item_id` 는 정규 생성기가 항상 NULL 로 넣어(`orders/helpers.ts:408`) 학습된 맵이 늘 NULL 이었다. 라인 2개 이상이면 NULL 유지(정본은 에이전트 `/file-map`). |
| 23 | `src/routes/inspections.ts:275` | 상태 가드를 `NULL·PENDING_REVIEW·NORMAL` 로 넓혀 재검수가 NORMAL 에서도 PENDING_REVIEW 로 올라간다. 종결 상태(WAITING_RESHIP·CANCELLED)는 입고 판정 라우트(`inventory.ts:825`) 소유로 남겼다. 응답에 `status_applied` 추가 — 0행이면 화면이 거짓말하지 않는다. |
| 24 | `src/routes/orders/operations.ts:205`·`:255` | `/copy` 가 `finishing`·`price_status`·`auto_amount`·`line_discount`·`discount_reason`·`ai_analysis_id`·`shipment_ready` 를 복사한다(부모·자식 두 pass 모두). `discount_reason` 은 목록 외지만 `line_discount` 와 짝이라 함께 넣었다. |
| 25 | `src/routes/dashboard.ts:498`·`:508`·`:512` · `src/routes/forecast.ts:141` | 장비 가동률·설비 캐파를 `printEventKstDay()` 축으로 통일. |
| 26 | `src/routes/rip.ts:1262`~`:1300` | 일별·월별·오늘 실적을 한 축(`printEventKstDay`/`kstMonth`)으로 통일. `:1704` send-item, `:2072` card-items 조인에 `cardEntityFilter(c,'c')` 추가(후자는 `cards` 조인 신설). |
| 27 | `src/routes/waste.ts:118` | 로스율 분모 `print_status='COMPLETED'` → `'OK'`(존재하지 않던 값). **추가 결함 동반 수정**: entity 절이 `w.` 별칭이라 `print_events` 에 붙으면 `no such column: w.entity_id` 로 500 이었다 → `entityFilter(c,'pe')`. 업무일 축도 SSOT 로. |

---

## 게이트 (전부 통과)

| 게이트 | 결과 |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run build` | exit 0 (6,742 kB) |
| `npm run check:dom` | exit 0 — 109파일 |
| `npm run audit:entity` | exit 0 — 67/67, 누락 0 |
| `node scripts/sort-audit.cjs` | exit 0 — P1 0건 |
| `npm run audit:subquery` | exit 0 — 신규 P1 없음(`inspections.ts:20` 은 기존 항목) |
| `npm run test:calc` | exit 0 |
| `npm run test:delivery-slot` | exit 0 — 67항목 |

서버 기동이 필요한 게이트는 미실행(지시대로).

---

## 통합자가 서버로 재검증해야 할 것

1. **`npm run test:ship-stock`** — 출고 경로에 차감 2곳(#17·#18)과 환원 조건 확대(#19)가 들어갔다. e2e 는 `bulk-ship`·`PATCH /shipments/:id/status` CANCELLED 만 쓰므로 영향 없다고 보지만 실측 필요. `POST /cards/generate/:orderId` 에 법인 가드가 붙었다 — 하네스가 ADMIN(entityId 0)이면 절이 비어 종전과 동일하다.
2. **`npm run test:symmetry`** — 클레임·반품 금액 400 이 추가됐다. 픽스처가 주문 금액을 초과하는 환불액을 쓰면 실패한다.
3. **`POST /api/print-events/batch`** — 카드 PRINT_DONE 전이 시점이 "첫 OK" 에서 "타일완료 + 전 라인 체크" 로 바뀌었다. 오프라인 큐 재현이 있으면 그것으로.
4. **`POST /api/production/logs`** — 500 이 사라지는지 실측(`{log_date, shift}` 만 전송).
5. **거래처 등록/수정** — 우편번호·상세주소·배송지·비고가 저장 후 재조회에서 남는지.

## 병합 시 주의 (main c317e8fe 이후)

`update.ts`·`create.ts`·`operations.ts`·`quotations.ts` 는 S2 원가 커밋과 겹친다. 내 훅 위치:
- `create.ts` — 청구법인 결정부(~:86), `finalAmount` 산출(~:154), INSERT 바인드 1줄(~:206).
- `update.ts` — `existingOrder` 직후 상수 1개(~:41), `finalAmount` 산출(~:196), 바인드 1줄(~:238), 삭제 batch 2줄(~:360·:373), 추천 1줄(~:445), 카드 재생성 `entityId` 2줄(~:678·:702).
- `operations.ts` — 인터페이스 2곳, copy SELECT·INSERT 2쌍, convert SELECT + 카드생성 블록, send-email SELECT.
- `quotations.ts` — import 1줄, 카드생성 블록 1개, 응답 2줄.
`recalculateOrderCosts` 호출은 **넣지 않았다**(지시대로).

## 관찰 (수정 안 함)

- `POST /orders/:id/copy` 는 상태 CONFIRMED 로 주문을 만들면서 **카드를 생성하지 않는다** — 견적 전환(#3)과 같은 결함 계열인데 리뷰 문서에도 배정 목록에도 없다. 별도 판단 필요.
- `waste.ts` 로스율 분자/분모의 출력 면적은 `copy_total` 을 곱하지 않는다(생산 리포트는 #21 로 맞췄다). 로스율이 과대 계상된다.
