# 묶음 ④a — 주문서·주문목록 클라이언트 JS 수정 보고

브랜치 `session/fix-scripts-orders` · 워크트리 `C:\Users\user\dongsan_mes-worktrees\fix-scripts-orders`
**수정 15건 / 건너뜀 0건** (지시 항목 15건 전부 처리). 부수 발견 2건 추가 수정.

---

## HIGH (8건)

| # | 위치 | 조치 |
|---|---|---|
| 1 | `src/scripts/layout/shell.js:1244` (신설) · `src/scripts/orders.js:869,902,963` | `window.showModal(title, html, buttons)` + `window.closeShellModal()` 를 셸에 신설하고 orders.js 가 그걸 쓰게 했다. 닫기 함수명을 `closeModal` 이 아니라 `closeShellModal` 로 한 이유 = orders.js·items/modals.js·postProcessing.js·users.js·cashFlow.js 가 **각자 자기 모달 전용 `closeModal` 을 전역에 이미 선언**해 두어 이름이 겹치면 서로를 덮는다. 버튼 캡션은 `text`·`label` 둘 다 받는다(호출부 2곳이 서로 다른 키를 쓰고 있었다). |
| 2 | `src/scripts/orderForm/sheet.js:80` | 「견적서로 저장」을 `POST /api/orders`(status QUOTATION) → **`POST /api/quotations`** 로 변경. payload 는 `routes/quotations.ts:267` 이 읽는 키만 담았고, 부모 라인에 **`client_group_id`**(없으면 묶음 자식이 `parent_id` NULL 로 흩어진다)와 **`pricing_method`**(없으면 서버가 AREA 를 FIXED 로 계산)를 추가했다. |
| 3 | `src/scripts/orderForm/parent.js:1596` | 복사 경로의 `Object.values(idMap).forEach(updateParentChildCount)` 를 **자식 있는 부모만**으로 제한(수정 경로 `:1306` 과 동일 규칙). 종전엔 일반 라인 `quantity` 가 0 으로 덮이고 서버가 `quantity \|\| 1` 로 1 을 저장했다. |
| 4 | `src/scripts/orderForm/calc.js:772` | `source_quotation_id` 를 제출 payload 에 직렬화(히든 `#sourceQuotationId`). `create.ts:176` 이 더 이상 항상 null 이 아니다 → 견적 전환수·`first_converted_at` 이 살아난다. |
| 5 | `src/scripts/orderForm/sheet.js:152,155,179` | 방향 키 `dataset.dir` → **`dataset.direction`**(`finishing.js:252` 이 심는 속성). 펀칭 셀렉터 `.pp-punch-check` → **`.pp-punching-check`**. 종전엔 className 폴백이 4개 셀렉트에서 동일해 우(R) 값 하나가 전 행 4변에 복사됐고, 펀칭 복사는 항상 무동작이었다. |
| 6 | `src/pages/orderForm.ts:530` → `src/scripts/orderFormDist.js:195` | 유통 주문서 전용 `window.addAccessoryRow` 를 **orderFormDist.js 에 신설**. `itemRow.js` 를 유통 페이지에 함께 싣는 방식은 기각 — 두 스크립트가 전역 이름 12개를 공유해 서로 덮는다(감사 「이상 없음」의 격리 전제가 깨진다). 행 구조도 다르다(`item_search_*` vs `dist_item_search_*`). |
| 7 | `src/scripts/invoice.js:51` · `src/scripts/purchaseInvoice.js:13` | 한글금액 단위 `'청'` → **`'천'`**. 세 사본 각각에 나머지 둘을 가리키는 주석 추가. |
| 8 | `src/routes/orders/listFilter.ts:104,168` · `src/scripts/ledger.js:694` | 조회조건 SSOT 에 **`client_id`** 추가(화이트리스트 + `parseInt` + bind). ledger.js 는 `clientId=` → `client_id=` 로 교체. 종전엔 조용히 무시돼 전 거래처 100건이 떴다. |

## MEDIUM (7건)

| # | 위치 | 조치 |
|---|---|---|
| 9 | `src/scripts/orderForm/parent.js:1147,1500,1795` · `src/routes/orders/core.ts:414` · `src/routes/items.ts:816` | `min_billing_side_<id>` 를 **수정·복사·견적 프리필 3경로 전부**에서 채운다. 값 공급을 위해 주문 상세 라인 쿼리와 `GET /api/items/:id` 에 `min_billing_side_cm` 을 각 1칸 추가. 견적 프리필은 이미 품목 마스터를 조회하고 있어 거기서 `pricing_method` 도 함께 보충했다. |
| 10 | `src/routes/orders/update.ts:207,239` | `internal_notes = COALESCE(?, internal_notes)` + 바인드를 `undefined ? null : 값` 으로. 옆줄 `sales_rep_id` 와 같은 규약(null=미변경·빈문자열=지우기). |
| 11 | `src/routes/orders/update.ts:213,241` | `sheet_layout_params = ?` 를 UPDATE 에 추가. 라인에서 걷는 규칙은 `create.ts:221` 과 동일(`sheet_layout_params` 있고 자식 아닌 첫 라인). |
| 12 | `src/scripts/orderForm/parent.js:1013`(헬퍼)·`:1146`·`:1499` · `src/scripts/orderForm/sheet.js:106` | `assigned_entity_<id>` 복원. 헬퍼 `setAssignedEntity()` 가 값을 넣고 **의도값을 `dataset.desiredValue` 에도 남긴다** — 옵션 로더(`sheet.js loadEntities`)가 비동기라 옵션 없이 `.value` 를 넣으면 select 가 조용히 `''` 가 되기 때문(담당자 셀렉트 #64 와 같은 함정). 로더가 그 값을 우선 재적용한다. |
| 13 | `src/scripts/orderForm/parent.js:1734` | `[name="delivery_method"]`(존재 0건) → `#deliveryMethod`. 수정·복사 경로와 같은 「(이전값)」 동적 옵션 규칙 + `onDeliveryMethodChange()` 호출까지 맞췄다. |
| 14 | `src/scripts/shipments.js:43`(헬퍼)·`:59`·`:63` | 직배 판정을 `window.MES_SLOT.isSlotMethod()`(= `constants/deliveryMethod.ts` ALIASES 사본, 4종 별칭)로 통일. MES_SLOT 부재 시 `console.warn` + 종전 2문자열 폴백. `:649` 는 표시 라벨이라 그대로. |
| 15 | `src/scripts/orderFormDist.js:205` · `src/scripts/quotationForm.js:300,316` · `src/pages/orderForm.ts` · `src/pages/quotationForm.ts` · `src/utils/vatRate.ts`(신설) | 하드코딩 `0.1` → `window.VAT_RATE`. 생산 주문서가 이미 쓰던 주입 채널을 **유통 주문서·견적서 폼에도** 연결하고, settings 조회를 `utils/vatRate.ts` 로 뽑았다(페이지 2곳만 사용 — 라우트는 병렬 에이전트 충돌 회피로 미변경). |

## 부수 발견 — 같은 경로에서 함께 고침 (2건)

- `src/scripts/orders.js:827,836` — `closeStatusModal()` 이 `_statusChangeOrderId` 를 **null 로 되돌린 뒤** `showCardConfirmModal(_statusChangeOrderId, …)` 를 부르고 있었다. showModal 을 살리면 곧바로 `PATCH /api/orders/null/status` 로 나갈 자리라 id 를 닫기 전에 붙잡도록 고쳤다. 같은 줄의 `errData.pending_cards ? 'SHIPPED' : 'SHIPPED'` 도 정리.
- `src/scripts/orders.js:870` — 모달 버튼의 `window.navigateTo` 는 코드베이스에 **정의 0**(감사 §2.5 의 그 건). 이 모달을 동작시키는 김에 `window.spaNavigate` + `location.href` 폴백으로 교체했다. weeklyPurchase.js·scan.js 의 같은 호출은 다른 에이전트 몫이라 건드리지 않았다.

## 지시대로 손대지 않은 것

- 이스케이프·XSS 계열(`cards/actions.js:94` 등) — 전량 XSS 담당 에이전트 몫.
- `update.ts:440`·`:673`(추천 법인·카드 재생성 entity) — 다른 에이전트 몫. 이번 hunk 는 **204~246 줄 구간에만** 있어 겹치지 않는다.
- 한글금액 함수 3사본 통합 — **의도적 보류**. 공용 헬퍼로 빼려면 페이지 3개(`invoice.ts`·`purchaseInvoice.ts`·`quotation.ts`)의 import·pageScript 를 고쳐야 하는데 `src/pages/purchaseInvoice.ts` 는 CRITICAL C2(반사 XSS) 수정으로 **동시 편집 중**이라 충돌 위험이 크다. 오타만 고치고 사본 3개에 상호 참조 주석을 남겼다. 후속 과제.

---

## 게이트 결과

| 게이트 | 결과 |
|---|---|
| `npm run typecheck` | ✅ 통과 |
| `npm run build` | ✅ 통과 (446 modules, `dist/_worker.js` 6,756 kB) |
| `npm run check:dom` | ✅ 통과 (109파일, 정적 getElementById 참조 전부 정의처 존재) |
| `node scripts/sort-audit.cjs` | ✅ **P1 0건** (P2 3건 = 전부 기존분, 이번 변경과 무관) |
| `npm run test:calc` | ✅ 통과 — orderline 30/30 · 마감표기 28 · 직배슬롯 67 · 파일규격 19/19 · 여신 11 · 재고단위 30/30 · 재고평가 22 · 품목중복 7/7 |
| `npm run test:orderline` | ✅ 통과 30/30 |
| `node scripts/orderform-roundtrip.cjs --help` | ⚠️ **실행 불가 — 건너뜀** (아래) |
| 변경 스크립트 11개 `node --check` | ✅ 전부 통과 (`?raw` 스크립트는 빌드가 문법오류를 못 잡으므로 별도 확인) |

### 왕복감사(`orderform-roundtrip.cjs`)를 건너뛴 이유

`--help` 플래그가 **없다** — 스크립트는 인자를 무시하고 곧장 감사를 실행한다(`scripts/orderform-roundtrip.cjs:20`, 기본 대상 `http://localhost:3000`, Playwright 헤드리스로 수정화면을 연다).
실행 결과 로컬 dev 서버에 시험 주문 #136 이 생성·삭제된 뒤 `page.waitForURL` 20초 타임아웃으로 실패했는데, **그 서버는 내 워크트리 빌드가 아니다** — 포트 3000 리스너의 커맨드라인이 `C:\Users\user\dongsan_mes\node_modules\...\workerd.exe` 로, 메인 체크아웃의 `dev:d1` 이다. 즉 이 실패는 내 변경과 무관하고, 내 변경을 검증하지도 못한다.
이 워크트리 빌드를 서빙하는 dev 서버를 따로 띄우면 포트 3000 이 충돌하고(지시 = 서버 불필요), prod 를 겨누는 건 스크립트 자신이 금지한다. → **건너뜀.** 배포 전 메인 체크아웃에서 병합본으로 1회 돌릴 것을 권장한다(수정·복사 복원 경로를 3곳 건드렸다).

---

## 커밋 (8개, 오래된 순)

| 해시 | 제목 |
|---|---|
| `ad8d9806` | fix(orders): add the missing showModal helper so list ship-completion works |
| `de985f48` | fix(order-form): save quotations to the quotations API and fix bulk finishing |
| `7ff8a1c5` | fix(order-form): stop edit/copy/quote prefill from dropping line fields |
| `74e8e74c` | fix(orders): stop PUT from wiping internal_notes and ignoring sheet layout |
| `fb240f62` | fix(order-form): wire the distribution accessory button and the VAT rate |
| `56ecfd34` | fix(print): correct the Korean amount unit typo on two printed documents |
| `4dd0baee` | fix(ledger): add the client filter the reduction modal was already sending |
| `03bff38f` | fix(shipments): use the delivery-method SSOT for the direct-delivery section |

소스 변경분은 전부 커밋됨(`git status` 미추적 = 이 보고서 파일 하나뿐 — 병합 노이즈를 피해 일부러 커밋하지 않았다). push·배포 없음.

## 병합 시 주의

- `src/routes/orders/update.ts` — 이번 hunk 는 204~246 줄뿐. `c317e8fe`(recalc 호출) 및 다른 에이전트의 `:440`·`:673` 과 물리적으로 겹치지 않는다.
- `src/routes/items.ts:816` — `GET /:id` 컬럼 목록에 `min_billing_side_cm` 한 단어 추가. 품목 담당 에이전트와 같은 줄을 만질 수 있다.
- `src/routes/orders/core.ts:414` — 주문 상세 라인 SELECT 에 컬럼 1칸 + 주석 2줄.
- `src/utils/vatRate.ts` 는 신규 파일. 라우트(`create.ts`·`update.ts`·`quotations.ts`)의 중복 조회는 **일부러 안 건드렸다** — 후속으로 묶으면 좋다.
