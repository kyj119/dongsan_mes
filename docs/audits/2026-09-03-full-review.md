# 전체 코드 리뷰 — 2026-09-03 (Fable 5.1)

> 범위 = `src/` 410파일 173,811줄 + IllustratorAutomat 63파일 32,284줄 + 결정론 게이트 20종 + prod 데이터 정합성(SELECT 25회).
> 방법 = 「다 → 나」: ① 결정론 게이트 전부 실행 ② 프로젝트 감사 스킬(security-audit 3묶음 · auto-improve Area 2·4 · qa-audit · /code-review) ③ 도메인 슬라이스 9개 리뷰 에이전트.
> **HIGH 이상은 전부 메인 세션이 소스에서 재검증**했다(에이전트 오탐 이력 때문). 표기 없는 항목 = 확인, `PLAUSIBLE` = 정황만 확인.
> 상세 원문(항목별 실패 시나리오·기각 오탐) = `docs/audits/2026-09-03-full-review/*.md` 15개.

## 요약

| 축 | CRITICAL | HIGH | MEDIUM | 비고 |
|---|---|---|---|---|
| 보안 (SQLi·XSS·CSV·인증·IDOR·비즈니스·인프라) | **2** | 23 | 37 | SQLi **0** (보간 1,899곳 전수) |
| 주문·생산·출고 (routes A · scripts E) | – | 12 | 15 | |
| 회계·자금·세무·급여·HR (routes B · scripts F · 문서 템플릿) | – | 12 | 15 | |
| 품목·재고·구매·단가 (routes C · scripts G) | – | 15 | 25 | |
| 플랫폼·연동·페이지·셸 (routes D · scripts G · pages H · QA) | – | 13 | 32 | |
| 미커밋 S2 원가 diff (`/code-review`) | – | 6 | 4 | 4건은 컴파일 실행으로 실증 |
| 코드 품질 횡단 (Area 2) | – | 6 | 3 | |
| IllustratorAutomat | – | 2 | 11 | |
| prod 데이터 정합성 (Area 4) | – | 0 | 1 | 기지 10 |
| **합계** | **2** | **89** | **143** | |

결정론 게이트 20종 = **전부 통과**(typecheck · check:dom · audit:entity 67/67 · sort-audit P1 0 · audit:subquery · migration-drift 0 · structure · test:calc · orderline-cost 25 · credit 11 · stock-unit 30 · stock-valuation 22 · items:selftest · skills · query-cost prod 12/12 · stock-ledger prod 드리프트 0 · smoke local 114/114 · smoke:prod 114/114 · test:symmetry · test:ship-stock · test:autodeduct). 유일한 빨간불 `audit:ia-jsx` 드리프트 2 = 현황판 「⏳ IA 미배포(패널 검색 공백)」 그 건.

---

## 1. 즉시 조치 — CRITICAL 2

| # | 위치 | 결함 | 수정안 |
|---|---|---|---|
| C1 | `src/middleware/auth.ts:22` + `src/middleware/permissions.ts:54,124` | `authMiddleware` 가 서명만 검증해 **포털 고객 토큰**(`portalAuth.ts:20`, `portal:true`, role 없음)과 **직원 셀프 토큰**(`hrSelf.ts:57`, `scope:'employee-self'`)이 내부 API에 도달. `requirePagePermission`·`requireAdminPage` 는 role 없으면 `next()` 라 /hr·/leaves·/attendance·/dashboard·/approvals·/payment-requests·/cash-schedule·/ia-scan 통과. `authMiddleware` 만 쓰는 bank·clients·items·inventory·files·prices·notifications·permissions·mySelf·departments 는 게이트 자체가 없음. entityId 기본 1 | `authMiddleware`·`pageAuthMiddleware` 에서 `payload.role`·`payload.id` 없거나 `portal`/`scope` 클레임 있으면 401. `requirePagePermission`/`requireAdminPage` 의 `!user?.role → next()` 는 비SPA 초기 로드용이므로 유지하되 **user 가 있는데 role 이 없으면** 403 |
| C2 | `src/pages/purchaseInvoice.ts:6,138` (`index.tsx:455`) | `var PO_ID = ${poId}` 원문 삽입. 페이지가 `pageAuthMiddleware`(비SPA 무인증)+`requirePagePermission`(user 없음 통과) 라 **무인증 반사 XSS** — 링크 한 번으로 localStorage 토큰 탈취. 형제 인쇄 페이지 3개는 `parseInt`+`isNaN` 가드 | `parseInt` + `isNaN → 400`. 같은 계열 `hrDetail.ts:8`(id raw), `payslip.ts:8`(`</script>` 미중화)도 함께 |

---

## 2. HIGH — 도메인별

### 2.1 보안 (23)
인증·권한
- `src/routes/auth.ts:120` `/refresh` 가 users 조회 없이 클레임 재서명 → 비활성·강등 계정 무한 갱신, portal/self 토큰도 8h 토큰으로 승격. `:144` `entityId: payload.entityId || 1` → **ADMIN 전체모드(0)가 갱신 뒤 법인 1 로 바뀜**
- `src/routes/auth.ts:196` switch-entity 비관리자 가드 `userRow?.default_entity_id &&` → NULL/0 이면 통과 = STAFF 가 임의 법인 토큰
- `src/middleware/permissions.ts:124` `requireAdminPage` 동일 우회(/ia-scan·/ia-auto)

IDOR(형제 핸들러는 가드 있음)
- `src/routes/orders/core.ts:263` GET `/:id/invoice` `WHERE o.id=?` 만(형제 GET `/:id` 는 viewerEntity) · `invoice.js:197` 호출
- `src/routes/cards/lifecycle.ts:1157` print-toggle `cardEntityScope` 없음(형제 7곳 있음) → 타법인 카드 출력완료·주문상태 연쇄
- `src/routes/inventory.ts:849` GET `/receipts/:id` entity 없음(`receiving.js:599`)
- `src/routes/priceList.ts:166-176` 정책 삭제가 entity 조회 실패에도 404 없이 진행 + `UPDATE clients`/`DELETE rules` entity 무필터
- `src/routes/kakao.ts:1027` `/send-sms-bulk` employees 대상 entity 무필터(#610 형제)
- `src/routes/weeklyPurchase.ts:38` MRP 활성주문 entity 무필터(같은 응답의 현재고·발주중은 필터)

비즈니스 로직·원자성
- `src/routes/inventory.ts:499~568` POST `/receipts` = authMiddleware 만(전 역할) · 수량 하한 없음(음수→재고 감소) · **재고 batch(:557)와 원장 batch(:568) 분리**(CLAUDE.md 원자성 규칙 위반)
- `src/routes/purchaseOrders/po-receive.ts:99` receiveQty 하한 없음(`> remaining` 만) → 음수 입고
- `src/routes/approvals.ts:172` reference_type/id 본문 그대로 → `handlePostApproval`(:588) 소유권·entity 검사 없이 credit_status/purchase_requests 승인 · `:352` approver_role==userRole 이면 **자가 승인**
- `src/routes/accounting.ts:508,537,573` 법인간거래 POST/PUT/DELETE 핸들러 가드 없음(라우터=열람권한)

XSS (거래처명·분류명 등 마스터 자유입력이 raw innerHTML/onclick)
- `src/scripts/cards/actions.js:94` `replace(/'/g,'\x27')` 은 **no-op**(같은 문자) + `:100` span raw · `accounting.js:186` onclick `"` 미이스케이프 · `items/modals.js:559,627` 동일 · `payroll.js:54-56` 동일 · `forecast.js:89,128,156` · `bank.js:2159` · `items/core.js:196` · `inventoryCount.js:119` · `productionReports.js:149` · `taxInvoices.js:597` · `purchaseInvoice.js:124-135`(회사·공급처 마스터 전부 raw)

CSV 수식 주입
- `src/scripts/vatReports.js:209,217` `join(',')` 무이스케이프(수식·콤마 열 밀림) · `ledger.js:1571` `"` 미중복

### 2.2 주문·생산·출고 (12)
- `src/routes/production.ts:131` body 미포함 필드(weather 등)를 `undefined` 로 bind → `D1_TYPE_ERROR` **결정적 500**(`production.js:1040` 은 `{log_date, shift}` 만 전송)
- `src/routes/orders/update.ts:440` PUT 담당법인 추천 기준=세션 법인(`getEntityId(c)||1`), create 는 주문 법인 → ADMIN 이 청주 주문 저장만 해도 `assigned_entity_id` 소실·분할청구 재편 · `:673` 카드 재생성 entityId 도 세션 법인(`lifecycle.ts:1131` 은 주문 법인)
- `src/routes/orders/operations.ts:328` 견적→주문 전환이 상태만 CONFIRMED, **카드 미생성**(`create.ts:579` 는 생성)
- `src/routes/orders/core.ts:598-604 → :648` 재고 환원 3종을 먼저 실행하고 ADMIN 검사는 뒤 → MANAGER 가 CANCELLED 주문 삭제 시도만으로 **재고 환원, 삭제는 403**
- `src/routes/printEvents.ts:660` `/batch` 가 첫 OK 이벤트로 카드 PRINT_DONE 직행(단건 `:465-475` 는 타일완료·autoCheck·주문동기 경유)
- `src/routes/returns.ts:177` RETURN IN 원장을 라인별 INSERT → 같은 품목 2라인 반품 시 UNIQUE(0293) 위반 `PLAUSIBLE`
- `src/scripts/orders.js:869,902` `showModal` **정의 0** → 출고완료 상태변경에서 `requires_confirmation` 응답 시 ReferenceError
- `src/scripts/orderForm/sheet.js:80` 「견적서로 저장」이 POST `/api/orders`(status QUOTATION) → `quotations` 테이블 아님 → 목록 빈칸
- `src/scripts/orderForm/parent.js:1597` 주문 복사가 idMap 전체에 `updateParentChildCount` → **일반 라인 quantity 0 덮임**(`:783-784`)
- `src/scripts/orderForm/parent.js:1808` `source_quotation_id` 히든을 만들지만 `calc.js` 직렬화기가 안 읽음 → `create.ts:176` 항상 null(견적 전환수 파생 무력)
- `src/scripts/orderForm/sheet.js:152` 후가공 일괄적용 키 `dataset.dir` vs 실제 `data-direction`(`finishing.js:250`) → 4방향이 하나로 뭉침
- `src/pages/orderForm.ts:530` 유통 주문서 「부속품」 `addAccessoryRow` 미포함(pageScript=[deliverySlot, distPageScript]) → ReferenceError

### 2.3 회계·자금·세무·급여·HR (12)
- `src/routes/ledger/ar-ledger.ts:652` 마감요약 총미수금 = 폐기 `clients.balance` SUM(prod 전량 0) → 「0원」
- `src/routes/taxInvoices/helpers.ts:399` 분할 계산서 total=supply+tax(**에누리 미차감**, 청구그룹 billed 는 차감) → AR↔계산서 불일치
- `src/routes/taxInvoices/issue.ts:562` 수정발행 items 없으면 원본 **양수 그대로** 복사(환입·계약해제는 음수여야, 프론트는 code·date·notes 만 전송)
- `src/utils/expenseEstimator.ts:50,53,65,71` `substr(transaction_date,1,7)` 인데 저장형식 **YYYYMMDD**(`cardExpenses.ts:996`) → `'2026083'` 비교 무의미
- `src/utils/cashflowEngine.ts:395,419` 카드대금 예정액이 CANCEL·is_offset 미제외(`:374` 조회 무필터) → 승인+취소가 2배
- `src/routes/payroll/year-end.ts:236-251` 보험·의료·교육·기부를 **소득공제와 세액공제 양쪽에** 적용
- `src/routes/bank.ts:2660` auto-sync `parseFloat(Balance||'0')` → 잔액 미제공을 0 저장(`:786` 수동 경로는 null 처리 #500)
- `src/routes/fixedAssets.ts:256/307` 이관자산(records 앵커 없음) `newBookValue=취득가−누계` → 전기말 장부가 무시
- `src/routes/payroll/core.ts:679`(+`:506`) 전체모드 `/batch` 가 전 법인 직원을 돌며 `entity_id=1` 기록
- `src/templates/laborContract.ts:400` 월급제 근로계약서 「월 급여」에 **시급** 인쇄(계산해 둔 총액 미사용) — 두 슬라이스 독립 발견
- `src/pages/laborContracts.ts:141,146` 계약서 수정 시 기본급·고정연장 미저장 `PLAUSIBLE`(`hr.ts:1341` setCols 허용목록 미확인)
- `src/scripts/accounting.js:852` `/api/clients` 를 배열로 취급, 서버는 `{clients, pagination}`(`clients.ts:185`) → 법인간거래 거래처 검색 **항상 0건** · `ledger.js:694` 감액 모달 `clientId=` 가 `orders/listFilter.ts` 에 없음 → 전 거래처 100건

### 2.4 품목·재고·구매·단가 (15)
- `src/routes/purchaseOrders/po-special.ts:153,265` 재발주·빠른발주 채번이 법인별 MAX(`getNextSeqNumber`) vs `po_number` **전역 UNIQUE**(정규 `core.ts:247` 은 `E{eid}`) → 타법인 동일번호 충돌
- `src/routes/inventoryCount.ts:60-67` count 쿼리가 `scope=mine` 절을 재조립 안 하고 params 그대로 → **바인드 초과 500**
- `src/routes/inventoryCount.ts:822` 실사 승인 ADJUST 원장 UNIQUE(0293)에 zone 없음 → 같은 품목 2구역이면 UNIQUE 위반(전수 실사가 (item, zone) 전개)
- `src/routes/purchaseOrders/po-receive.ts:160→228→302` 락 **이전** prefetch 값으로 `SET quantity = ?` 절대값 덮어쓰기 → 사이의 자동차감·출고 소실
- `src/routes/purchaseInvoices.ts:161` 매입확정이 원장 `total_amount = quantity(base) × 관리단가` → pack 배 과대
- `src/routes/purchaseOrders/core.ts:572` 전이표 `PARTIAL_RECEIVED→CANCELLED→DRAFT` 허용(재고 이동 후) · 수정/삭제 가드는 status 만 봄
- `src/routes/purchaseRequests.ts:753` `SELECT id, status` 만 → `pr.supplier_id` undefined = 공급업체 폴백 사문
- `src/scripts/items/modals.js:214→236` `widthMm` null 로 시작해 MATERIAL 만 채우는데 항상 전송 → **제품 수정 저장 시 width_mm NULL 덮어쓰기**(폭 뱃지·자동차감 근거 소실)
- `src/scripts/purchaseOrders.js:77` 공급업체 드롭다운 `/api/clients` limit 없음 → 기본 50건(`clients.ts:59`) 외 선택 불가
- `src/scripts/inventoryCount.js:388/540` 실사 입력 표시(`uomFromBase`)와 저장(`×ps` 무조건) 비대칭
- `src/scripts/receiving.js:229` · `purchaseInvoices.js:73` 보호 파일 `<a href target=_blank>` 직접 링크 → Authorization 없음 = 항상 401
- `src/routes/weeklyPurchase.ts:38` (2.1 참조) · `src/routes/priceList.ts:166` (2.1 참조)
- 미커밋 원가 diff → §2.6

### 2.5 플랫폼·연동·페이지·셸 (13)
- `src/routes/portal.ts:294` `/api/portal/dashboard` 가 **존재하지 않는 `ledger` 테이블** 조회(마이그에 CREATE 없음) → 500
- `src/routes/messages.ts:820` 알림톡 대량발송 `msg: content.body` → 수신자별 치환 결과 버림(전원 동일 원문)
- `src/routes/migration.ts:878` `/recalculate-all-balances` 가 폐기 `clients.balance` 재기록(ADMIN 전용)
- `src/routes/tasks.ts:262` 수동 재시도가 `retry_count` 미초기화 `PLAUSIBLE`
- `src/scripts/bom.js:147` · `approvals.js:620` · `priceManagement.js:20` · `migration.js:257` 초기화가 `DOMContentLoaded` 단독 → **SPA 전환으로 열면 영구 스켈레톤**(`shell.js:1767` 주석이 미발화 경로 인정)
- `src/scripts/tasks.js:121` `setInterval 10s` × 2엔드포인트, `document.hidden` 가드 없음 → 탭 하나가 하루 17,000회(CF 과금 가드 위반)
- `src/scripts/weeklyPurchase.js:224` · `scan.js:209` `window.navigateTo` **정의 0** → PR 생성 후 이동·스캔 결과 이동 TypeError
- `src/pages/clients.ts:242,247` 우편번호·상세주소를 클라가 보내지만(`clients.js:437`) INSERT(`routes/clients.ts:851`)·UPDATE(`:1063`) 어디에도 없음 → **영구 유실** · `:252,288` 배송지·비고는 INSERT 경로만 누락
- `src/scripts/invoice.js:51` · `purchaseInvoice.js:13` 한글금액 단위 `'청'`(정 `'천'`, `quotation.js:46` 만 정상) → 거래명세서·매입계산서 인쇄본 오표기
- `src/pages/orderForm.ts:127,483` · `clients.ts:233` 배송방법 셀렉트 `직배`(SSOT `직접배송`, `constants/deliveryMethod.ts`, 0526) · `clients.ts:41-45` 거래처 배송 필터가 영문 enum(SAME/FREIGHT/DIRECT/PICKUP) → **항상 0건**
- `src/routes/dashboard.ts:508,512` 장비 가동률만 `print_started_at` 단독(`printEventKstDay` 미적용, 결측 429건 탈락) · `forecast.ts:143,147,150` `date(created_at)` UTC 버킷(`d1de3334` 가 없앤 결함 잔존)

### 2.6 미커밋 S2 주문 라인 원가 diff (6 HIGH · 4 MEDIUM) — `code-review-utils.md`
- `materialRequirement.ts:84` 계획 로더가 `avg_unit_cost` 미조회 → `selectRollPlacement` 가 계획=면적 / 원가=단가 모드로 **다른 원단 선택**(실증: 70×170 → 계획 AQ2-70 1.859yd, 원가 AQ2-180 0.766yd)
- `rollConsumption.ts:161` `byPrice` 가 무단가 후보 1개로 전체 면적모드 전환 → NO_PRICE·원가 0(실증)
- `costCalculator.ts:135` margin_rate = `unit_price×qty` → AREA 단가·`line_discount` 무시(`order_items.amount` 안 읽음)
- `costCalculator.ts:128` `useBom = coverage==='FULL'` → NO_DEDUCT 라인의 잉크 1,890 버림(실증)
- `costCalculator.ts:113` 라인당 `cost_standards` SELECT → backfill 100건 subrequest 초과 시 ERROR 주문을 커서가 건너뜀(영구 0)
- `costCalculator.ts:90` 견적전환(`quotations.ts:692,721`)·주문복사(`operations.ts:199,239`) 가 recalc 미호출 → 원가 0 유지
- MEDIUM: `materialRequirement.ts:138` width_mm=0 조용히 skip · `autoDeductInventory.ts:154` 구 선택규칙 유지(헤더 주장 불일치) · `orderLineCost.ts:211` `usage_type/quantity` 무시(간판 BOM) · `:202` 로더·디스패치 3중 사본

### 2.7 IllustratorAutomat (2)
- `com.mes.a0.panel/js/cut-main.js:2439-2442` `SELALL_MIN_HOST='CUT-CEP-0.24.0'` 문자열을 `hostAtLeast` 에 → 상시 false → **[◎ 전체] 영구 불능** + 「호스트 구버전」 오진(실호스트 0.30.0)
- `designer/mes-cut-host.jsx:3159` 재단 등록 manifest `"scale_pct":100` 하드코딩 → 배율 1/S 저장 판의 대기물 규격 1/S(청구면적 1/S²)

---

## 3. MEDIUM 142 — 주목 항목 (전량 = 상세 파일)
- **entity 본문 신뢰**: `orders/create.ts:95` billing_entity_id · `purchaseOrders/core.ts:240` entity_id · `migration.ts:346,479`
- **금액 무제한**: `orders/create.ts:155`·`update.ts:191` discount_amount · `claims.ts:107`·`returns.ts:123` 환불액
- **분리 쓰기(원자성)**: `inventory.ts:1023`·`:1313` · `scan.ts:298`
- **UTC/KST**: `productionReports.ts:28` 전 라우트 `date(print_completed_at)` · `rip.ts:1262-1285` 한 응답 안 날짜축 혼재 · `po-queries.ts:68` · 클라 `toISOString().slice(0,10)` 4곳(`cashSchedule.js:327`·`reports.js:61` 등)
- **셸 전역 덮어쓰기**: `inventoryDashboard.js:7` escHtml · `capsSettings.js:68` timeAgo · `taxInvoices.js:10`↔`cashReceipts.js:1` currentPage
- **폐기 캐시 잔존**: `purchaseOrders/templates.ts:280` `purchase_balance` 누적(08-31 14곳 제거 후 1곳 잔존) · `aiInsights.ts:67,148` 폐기 여신 산식 저장
- **채번 COUNT+1**: `po-receive.ts:56` RCV · `inventory.ts:897` REL(UNIQUE) · `migration.ts:389`
- **역할 가드 없음**: `inventory.ts:996,880,1284` adjustments/releases/transfer · `purchaseInvoices.ts:295` · `notifications.ts:325` cleanup
- **문서·페이지**: `yearEnd.ts:305` 발행법인 동산기획 하드코딩 · `insuranceReports.ts:187` 암호문 주민번호 그대로 복사 · `accounts-payable.ts:1054` CSV 헤더 8열/데이터 7값 · `vatReports.js:222` 열 밀림 · `settings.ts:810` 배치도 select 사문
- **IA**: `ExtractGroups.jsx:492` pdfCompatible=true(규칙 위반) · `SheetLayout.jsx:586` 닫힌 문서 검증 · `mes-a0-host.jsx:964`/`mes-cut-host.jsx:3141` manifest entity_id 1 하드코딩 · 셸 서명이 파일 삭제 미감지
- **prod 데이터(Area 4)**: 하나은행 마통 3중 등록 잔재 — 비활성 #8·#9 에 거래 3건, 대출이자 1,938,893 원 3계좌 중복 APPLIED · LOW 9 · 기지 10

## 4. QA (Playwright, local) — 결과 = `qa-audit.md`
- Level 1 페이지 로드 **89/90** — 실패 1 = /material-forecast(#318 기지). 환경성 콘솔 에러 6페이지는 통과 집계.
- Level 2 API **57/59** — 실패 = barobill/status 500(로컬 env 미설정) · forecast/material-consumption 404. smoke 정본 89개 중 87 통과.
- Level 3 시나리오 **3/5 + 부분 2** — 단가표(로컬 price_sheets 0건)·메시지(바로빌 미설정)는 데이터·환경 탓, 결함 아님.
- 신규 MEDIUM 1 — `src/routes/shipments.ts:665` 출고 대시보드 카운터가 `?date=` 를 무시(`today = kstYmd()` 고정, 화면 날짜를 바꿔도 오늘 값).

## 5. 수정 묶음 제안 (우선순위)
1. **인증 경계 1커밋** — C1 + refresh/switch-entity/`entityId||1` + `requireAdminPage`. 게이트: 포털·셀프 토큰으로 `/api/hr` 401 확인하는 selftest 신설.
2. **반사 XSS 3페이지 + innerHTML 11곳 + CSV 2곳** — `escapeHtml` 전역 헬퍼 적용, onclick 은 data-attr.
3. **재고 원자성·수량 하한** — receipts/po-receive/실사 승인 UNIQUE zone/입고 절대값 덮어쓰기. 게이트: `test:symmetry` 확장.
4. **현장 즉시 체감 결함** — `showModal`·`navigateTo` 미정의, SPA 초기화 4페이지, 거래처 주소 유실, 근로계약서 시급, 한글금액 `청`, 배송방법 `직배`, production 500, 견적→주문 카드 미생성.
5. **회계 수치** — 마감요약 balance, 계산서 에누리·수정발행 부호, 카드 예정액 CANCEL, 연말정산 이중공제, 급여 batch entity.
6. **S2 원가 diff** — 배포 전 §2.6 6건 반영(계획↔원가 동일 선택 규칙이 핵심).

## 6. 방법·한계
- `/code-review` 는 경로를 줘도 **변경분만** 본다 → 커밋된 코드는 도메인 슬라이스 에이전트로 대체.
- 세션 한도 2회(22:54·13:54Z) — 에이전트는 재생성 대신 SendMessage 재개(컨텍스트 유지). 총 에이전트 20개.
- 기각한 오탐·「확인했지만 이상 없음」 목록은 각 상세 파일 하단.
- MEDIUM 은 에이전트 보고 그대로(메인 미검증). HIGH 중 `PLAUSIBLE` 3건은 수정 전 재현 필요.
