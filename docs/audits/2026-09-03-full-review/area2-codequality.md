# auto-improve Area 2 — 코드 품질 심층 분석 (READ-ONLY)

- 대상: `C:\Users\user\dongsan_mes` 워킹트리 (main, 2026-09-02)
- 제외: 미커밋 원가 계산 diff (`costs.ts` · `costCalculator.ts` · `materialRequirement.ts` · `rollConsumption.ts` · `orderLineCost.ts` · `migrations/0554`) — 별도 리뷰어 담당
- 결정론 게이트(typecheck·check:dom·entity·sort·subquery·migration-drift·structure·calc·symmetry·ship-stock·autodeduct·smoke)는 재실행하지 않음

**결과: HIGH 6 · MEDIUM 3 · LOW 1 (총 10건)**

---

## 조치 필요 (심각도순)

### HIGH

**1. `src/scripts/invoice.js:51` · `src/scripts/purchaseInvoice.js:13` — HIGH — 한글금액 단위 배열 오타 `'청'`(정: `'천'`), 형제 `quotation.js:46`만 정상**
거래명세서에서 최종금액 3,254,000원 → `numberToKorean`(invoice.js:47)이 `삼백이십오만사청원` 을 만들고 `invoice.js:123` 이 `일금 삼백이십오만사청원정` 으로 인쇄·팩스·이메일 발송한다. 매입계산서(`purchaseInvoice.js:97`)도 동일. 세 사본 중 견적서(`quotation.js:46`)만 `'천'` 이라 전형적 복붙 드리프트다.

**2. `src/routes/orders/update.ts:440` — HIGH — PUT이 담당법인 추천 기준을 「주문 법인」이 아니라 「세션 법인」으로 넘긴다 (create·append 형제는 정상)**
`recommendAssignedEntity(item, billingEntityId)`(helpers.ts:41)의 2번째 인자는 청구 법인인데, PUT만 `getEntityId(c) || 1` 을 넘긴다 — POST는 `orderEntityId=billingEntityId`(create.ts:294), 라인추가는 `Number(order.entity_id) || …`(create.ts:777/827)로 둘 다 주문 행 기준이다. 같은 핸들러가 `existingOrder.entity_id` 를 이미 갖고 있다(`update.ts:506` 에서 사용).
구체 실패: 동산(1) 소속 **간판** 주문을 선명(2) 계정이 열어 배송지만 고쳐 저장하면 → `getCardGroup`=SIGN → 추천 2, `2 === billingEntityId(2)` 로 **NULL 반환** → `assigned_entity_id` 가 2 에서 NULL 로 지워진다. PUT은 `order_items` 를 전량 delete+reinsert 하고 곧바로 `recalcOrderBillingGroups`(update.ts:552)가 돌아 **선명 몫 청구그룹이 사라지고 전액 동산 귀속**된다. ADMIN 전체모드(entityId=0)는 `|| 1` 로 떨어져 모든 타법인 주문에서 같은 재계산이 일어난다.

**3. `src/pages/orderForm.ts:127` · `:483` · `src/pages/clients.ts:233` — HIGH — 배송방법 입력 셀렉트가 폐기값 `직배` 를 그대로 쓴다 (SSOT·마이그 0526과 어긋남)**
`src/constants/deliveryMethod.ts:21` 이 정본을 `직접배송` 으로 선언하고("화면 셀렉트·검증이 모두 이 순서를 쓴다"), `migrations/0526_*.sql` 이 `orders`·`clients` 데이터를 `직배`→`직접배송` 으로 통일했는데 **입력 폼 3곳만 안 따라왔다**. 필터·목록 페이지는 이미 `직접배송`(`pages/orders.ts:140`·`pages/shipments.ts:473,547`·`pages/shipmentsDashboard.ts:23`).
구체 실패 3연쇄:
- `src/routes/orders/listFilter.ts:168` 이 `o.delivery_method = ?` 정확일치라, /orders 배송방법 필터에서 `직접배송` 을 고르면 **주문서로 새로 만든 직배 건이 전부 누락**된다.
- `src/scripts/orderForm/client.js:73-74` 의 `hasOpt` 가드 때문에, 0526 이후 `delivery_method='직접배송'` 인 거래처를 고르면 **자동선택이 통째로 no-op** → 첫 옵션 `대신택배` 로 남는다.
- 거래처 모달 저장(`clients.js:445` → `routes/clients.ts:998`)이 `직배` 를 다시 쓴다 — `isValidDeliveryMethod` 가 하위호환으로 받아줘 400도 안 난다 → **0526을 한 건씩 되돌린다**.
(수정모드는 `parent.js:1028`·`:1407` 이 "(이전값)" 동적 옵션으로 값 자체는 보존한다 — 정본값이 「이전값」으로 표시되는 부작용만 있다.)

**4. `src/pages/clients.ts:41-45` — HIGH — 거래처 목록 「배송」 필터가 옛 영문 enum이라 어떤 값을 골라도 0건**
셀렉트가 `SAME`/`FREIGHT`/`DIRECT`/`PICKUP` 을 보내는데(`scripts/clients.js:78`→`:187`), `src/routes/clients.ts:107` 은 `c.delivery_method = ?` 정확일치다. 그런데 `migrations/0290_clients_delivery_method_korean.sql:4-6` 과 `0303_*.sql:18-20` 이 `clients.delivery_method` 를 이미 한글로 전환했고, `routes/clients.ts:994` 의 `isValidDeliveryMethod` 가 영문값 쓰기를 400으로 막는다. 즉 **매칭될 행이 구조적으로 0개** — 필터가 조용히 빈 목록만 낸다.

**5. `src/routes/dashboard.ts:508` · `:512` — HIGH — 장비 가동률만 `print_started_at` 단독 축, 바로 위 형제는 `printEventKstDay` 로 고쳐졌다**
커밋 `d1de3334`(2026-09-01)가 `/stats/production-today`(dashboard.ts:439)를 공유 헬퍼로 옮기면서 **바로 다음 핸들러 `/stats/equipment-utilization`(dashboard.ts:484)은 건드리지 않았다**. `src/utils/printEventDay.ts` 헤더가 "print_events 를 날짜로 묶는 곳은 전부 여기를 쓴다. 리터럴 금지" 라고 못박은 규칙 위반이다.
구체 실패: 같은 헤더의 실측대로 `print_started_at` 은 결측 429건인데, `kstDateOf('pe.print_started_at') >= …` 는 NULL을 false로 떨궈 **그 429건이 장비별 가동시간·active_days·print_count에서 통째로 빠진다**. `/api/dashboard/stats/production-today` 와 `/stats/equipment-utilization` 을 같은 화면(`scripts/dashboard.js:658`·`:708`)이 나란히 그리므로 두 숫자가 서로 안 맞는다.

**6. `src/routes/forecast.ts:143` · `:147` · `:150` — HIGH — 설비 캐파 분석이 print_events를 `date(created_at)` UTC 버킷으로 묶는다**
`d1de3334` 가 생산현황에서 없앤 결함 2종이 여기 그대로 남았다 — ① 축이 `created_at`(서버 수신 시각) ② `date()` 가 UTC.
구체 실패: 커밋이 실측한 대로 전 기간 8,982건 중 1,792건(20%)이 출력일과 적재일이 다르고 2026-08-10 하루에 1,750건이 몰렸다 → `/api/forecast/capacity-analysis`(호출처 `scripts/equipmentDashboard.js:27`·`:30`)의 장비별 일평균·최대일 가동률이 그날 하루만 폭증한 값으로 계산된다. 추가로 00~09시 KST 출력이 전날 버킷으로 가 `dates` 집합의 가동일수가 실제와 어긋난다. 픽스 = `printEventKstDay()`/`printEventAt()` 로 교체.

### MEDIUM

**7. `src/scripts/orderFormDist.js:205` · `src/scripts/quotationForm.js:316` — MEDIUM — 부가세율 하드코딩 0.1 (서버는 `settings.vat_rate`)**
2026-07-30 에 생산 주문서는 정본화됐다 — `pages/orderForm.ts:403` 이 `window.VAT_RATE` 를 주입하고 `scripts/orderForm/calc.js:200` 이 그걸 읽는다. 그런데 **유통 주문서는 주입 자체가 없고**(`pages/orderForm.ts:595` 의 pageScript 에 `window.VAT_RATE` 없음) 스크립트가 `Math.round(total * 0.1)` 을 쓴다. 견적서 폼도 동일(`quotationForm.js:316`).
구체 실패: `settings.vat_rate` 를 0.10 이외로 바꾸면 서버(`routes/orders/create.ts:130`·`routes/quotations.ts:283`)는 새 값으로 저장하는데 화면 합계는 10%로 남는다 → 등록 직후 화면 금액과 저장 금액이 갈린다.

**8. `src/routes/purchaseOrders/po-queries.ts:68` — MEDIUM — 「이번 달 발주 금액」만 `date('now','start of month')` = UTC**
같은 핸들러가 바로 위(`:59`)에서는 `today = kstYmd()`(`:45`)를 바인드해 KST 기준으로 비교한다. 이 한 줄만 raw `date('now')` 다.
구체 실패: 매월 1일 KST 00:00~09:00 사이에 발주 통계를 열면 UTC 기준으로 아직 전월이라 `stats.monthly_amount` 가 **전월 전체 발주액**을 보여준다.

**9. `src/routes/waste.ts:10,39,86` · `src/routes/budgets.ts:11,25,57,130` — MEDIUM — 프론트 호출처 0건인 고아 라우터 2개 (쓰기 포함)**
`src/index.tsx:287`·`:290` 에 마운트돼 있고 authMiddleware 도 붙지만, `src/scripts`·`src/pages` 전체에서 `/api/waste`·`/api/budgets` 참조가 0건이고 대응 페이지도 없다(`src/pages` 에 waste/budget 파일 없음). `budgets` 는 서비스 소비처도 없다 — `src/routes/cron.ts:357` 의 `checkBudgets`(`services/budgetAlert.ts`)는 `budgets` 테이블을 읽지 않는다. `waste_records` 를 쓰는 유일한 경로가 `waste.ts:52` 라 **UI로는 폐기 실적을 넣을 방법이 없다**(삭제만 `orders/update.ts:346` 에서 일어난다). #334 도달성 규칙상 보안 이슈가 아니라 정리 대상. 미완성 기능인지 폐기 대상인지는 owner 판단 필요.

### LOW

**10. `src/types/models.ts:126` — LOW — `Entity.updated_at` 이 필수 필드인데 `entities` 테이블에 그 컬럼이 없다**
`migrations/0145_entities.sql:2` 의 CREATE 이후 어떤 마이그도 `entities.updated_at` 을 추가하지 않았다(스키마 실측 22컬럼에 부재, `created_at` 만 존재). 현재 이 필드를 읽는 SELECT·쓰는 UPDATE 가 0건이라 무해하지만, 타입을 믿고 `SELECT updated_at FROM entities` 를 쓰면 prepare 단계 throw 로 해당 핸들러가 100% 사망한다(#377/A-027 클래스). 필드 제거 권장.

---

## 확인했지만 이상 없음

- INSERT 컬럼 존재성 전수 (src 전체, migrations 555개 ground-truth) — net-new 0
- 명시 SELECT 컬럼 존재성 (단일테이블) — 후보 32건 전량 `SELECT 1 FROM …` 리터럴 FP
- UPDATE SET 컬럼 존재성 (서브쿼리 절단 적용) — 0건
- `entity_id` 누락 INSERT (entity_id 보유 테이블 전수) — 동적 컬럼 3건 모두 조건부 push 확인, 실누락 0
- authMiddleware 커버리지 (recursive, 132 라우트 파일) — 무-auth 7건 전부 정당(cron=agentKeyMiddleware · hrSelf=scoped token · publicUnsubscribe=의도적 public+rateLimit · messagesAd=`messages.ts:121` 의 `use('/*')` 상속 · helpers/shared=Map.get FP)
- `models.ts` 인터페이스 ↔ 스키마 대조 — #10 외 0건
- D1 바인드 한도 동적 IN절 미청크 (#458) — `shipments.ts:196`·`orders/queries.ts:245,318`·`cards/queries.ts:328,391`·`ledger/ar-helpers.ts:46` 모두 80청크 적용 확인, 나머지는 LIMIT/slice/직원수로 bounded
- 「주문당 헬퍼-루프」 서브요청 소진 (#478) — 신규 0
- 중복 블록 드리프트: `formatKST`/`toKstDate` 4사본 · `entityAssignOptions` 3사본 · claims/leaves/returns 페이징 3사본 · orders/purchaseOrders/quotations summary 응답 3사본 · `order_items` INSERT 컬럼셋(create↔update) — 전부 동일
- batch 결과 배열 인덱스 정렬 (update.ts `putParentStmts`/`putParentClientGroupIds`/`putParentItems`) — 같은 `continue` 가드 뒤 push, 정합
- `?raw` concat 전역 스코프 충돌 — orderForm(9본)·cards(8본)·items(4본)·orders·shipments·cardDetail·orderFormDist 전 번들 최상위 심볼 충돌 0
- `UPDATE inventory SET quantity` ↔ 원장 INSERT 짝 (20곳) — `inventoryCount.ts:666/817` 포함 batch 동봉 확인
- 마이그레이션 멱등성 (최근 40개) — CREATE 전량 `IF NOT EXISTS`, `0554` 는 `ON CONFLICT DO UPDATE`
- 고아 라우터 도달성 — `/api/cron`(외부 워커)·`/api/webhooks`(빈 라우터)·`/api/ai-layout`(IllustratorAutomat 폴링)·`/api/files`(#365 범용 프록시 예외, Area 5 소관)
- dead export 15건 — `getProductionDeadline`/`isSlotSelectable`/`formatPPList` 등은 selftest(`scripts/delivery-slot-selftest.cjs`·`finishing-label-selftest.cjs`)가 호출, dead 아님
- 라인추가(`POST /:id/items`) 가드 — 상태 화이트리스트(create.ts:772)로 SHIPPED 차단, 재고 차감 우회 경로 없음

## 기각한 오탐

- 컬럼 존재성 후보 28건 → 스키마 파서의 **CRLF 버그**(`--[^\n]*` 대신 `--.*$` 사용 시 `\r` 때문에 주석이 안 지워짐). 파서 수정 후 전량 소멸 — 영역 파일의 「재검증 없이 신뢰 금지」 규칙이 그대로 적중.
- `SELECT 1 FROM x` 32건 → 리터럴 상수를 컬럼으로 오파싱.
- `attendance.ts:377/385`·`hr.ts:488` entity_id 누락 → 동적 `cols` 배열에 조건부 push(`attendance.ts:362`·`hr.ts:481`).
- `clients.ts:142`·`forecast.ts:24` 등 rolling-window `date('now','-N days')` → 9시간 편차가 수개월 창에서 무의미. 「업무일 판정」이 아니라 보고 대상 아님(#8 은 월경계라 예외).
- `structure-audit` writePathAsymmetry 12건 → 전부 `WHERE id = ?` 형태로 상위에서 소유·법인 검증됨. audit:entity 67/67 통과와 일치.

## 미실행

- prod DB 실측 대조(`rows_read`·`EXPLAIN QUERY PLAN`·실제 `직배`/`직접배송` 행수) — READ-ONLY 지시로 wrangler 조회 미실행. 위 HIGH 3·4 의 영향 건수는 코드·마이그레이션 근거만으로 판정했고, 실제 오염 규모는 prod 조회가 필요하다.
- 미커밋 원가 계산 diff — 지시대로 제외.
