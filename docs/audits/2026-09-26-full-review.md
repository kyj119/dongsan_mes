# 전체 코드 리뷰 — 2026-09-26

Workflow 15트랙(메타·게이트·도메인 코드·외부 축) → 중·고 발견마다 반박 검증. **확정 89 · 반박 9 · low 미검증 62.**

브랜치 `session/review-fixes` 에서 가벼운 확정분 30건을 고쳤다(아래 「반영」). 나머지는 결정 또는 큰 작업이라 선택지로 남긴다.

## 반영 (30건)

| # | 심각도 | 위치 | 결함 |
|---|---|---|---|
| 2 | high | `src/routes/printEvents.ts:413` | When a print event completes a card, the order-status sync in autoCheckCardItem is a hand-copied version of syncOrderStatusFromCards, and the copy leaves out the SHIPPED/CANCELLED/HOLD skip, the conditional `WHERE status=?` guard and the order_status_history insert, so a print event can bring a cancelled order back to life. |
| 4 | high | `src/routes/purchaseInvoices.ts:213` | 매입확정(/confirm)이 judgeBasePriceSync 판정 없이 items.base_price 를 매입 단가로 덮는다. 주석에는 '입고 Phase4와 동일 정책'이라고 적혀 있지만 실제로는 판매품목 가드가 빠져 있다. |
| 7 | high | `src/routes/auth.ts:240` | 법인 전환(POST /switch-entity)이 DB를 다시 읽지 않고 제시된 JWT의 role·is_coordinator로 8시간짜리 새 토큰을 발급합니다. 같은 날 /refresh에는 넣은 is_active 재확인과 역할 갱신이 이 형제 경로에는 빠져 있습니다. |
| 9 | high | `.github/workflows/backup.yml:63` | The daily D1 backup runs `wrangler r2 object put` without `--remote`. Wrangler 4 then writes to local Miniflare storage, so the backup never reaches the real R2 bucket, yet the job is reported as a success every day. |
| 10 | high | `.claude/skills/auto-improve/SKILL.md:162` | 자동 수정과 승인 이슈 처리의 검증 단계가 `npm run e2e`를 지시합니다. 이 명령은 기본 대상이 prod(webapp-9i0.pages.dev)이고, 쓰기 스위트 crud-*.spec.ts까지 실행해 prod DB를 다시 오염시킵니다. |
| 16 | medium | `src/routes/orders/queries.ts:374` | bulk-ship·PATCH /shipments/:orderId/ship·POST /shipments 가 주문 상태를 확인하지 않고 deductStockLinesOnShip 을 불러 CANCELLED 주문에서도 재고를 차감한다. |
| 19 | medium | `src/routes/taxInvoices/issue.ts:718` | 수정발행(MODIFY) 계산서를 취소하면 그 계산서에 링크된 그룹이 없어 폴백 경로로 빠지고, 원본 계산서의 주문×법인 청구그룹 전체를 미청구로 되돌린다. |
| 22 | medium | `src/services/barobillSms.ts:215` | MMS 는 수신자별 순차 호출인데 중간 한 건에서 예외(HTTP 오류·SOAP Fault)가 나면 catch 가 전체를 「실패·results 없음」으로 반환해, 이미 나간 앞 수신자까지 실패로 기록된다. |
| 27 | medium | `.claude/skills/deploy-verify/SKILL.md:109` | Phase 4의 배포 후 prod 열 잘림 감사가 `npm run audit:table-clip`을 --base 없이 부른다. 기본 대상이 localhost인데, 바로 앞 Phase 1의 journey:gate가 :3000 서버를 남겨 두므로 prod 대신 로컬을 재고 통과한다. |
| 28 | medium | `.claude/skills/deploy-verify/SKILL.md:14` | /deploy-verify Phase 1에 check:fn, audit:jwt-decode, audit:bind-limit, audit:migration-number, canary:write가 없다. 이 게이트들은 CI(push 후)와 ship:gate에만 있어서, 로컬 deploy:prod 경로에서는 배포 전에 돌지 않는다. |
| 29 | medium | `docs/WORKTREE_WORKFLOW.md:25` | 사용법이 3) worktree에서 `npm run deploy:prod`를 하고 4) main에 push하는 순서다. 이는 push FIRST 원칙에 어긋나고, /deploy-verify 게이트(test:calc·journey·entity)와 dirty/behind 확인도 우회한다. 배포 전 검증도 localhost 기본인 `npm run smoke`다. |
| 30 | medium | `.claude/hooks/_danger-patterns.cjs:17` | HARD_BLOCK이 긴 옵션 철자만 잡는다. 실측 결과 `git push -f`, `git push origin +main`, `git push --mirror`, `rm --recursive`, `rmdir /s /q`, PowerShell `ri x -r`, `git branch --delete --force`가 모두 통과한다. |
| 36 | medium | `src/routes/payroll/tax-agent.ts:98` | 세무대리인 CSV 3종(changes·payroll·annual)이 employees.resident_number(aes: 암호문)를 복호화하지 않고 maskRrn에 넘긴다. ADMIN은 암호문 전체를, MANAGER는 'aes:xxxx******'를 받는다. |
| 37 | medium | `src/routes/leaves.ts:1224` | 연차수당 반영(apply-unused-allowance)이 공제를 다시 계산할 때 childrenUnder20을 넘기지 않아 자녀세액공제가 빠진다. total_salary를 다시 만들 때 absent_deduction도 빼지 않아 결근 차감이 되돌아간다. |
| 38 | medium | `src/routes/payroll/core.ts:803` | sync-attendance(:803)와 recalc-deductions(:1209)가 대상을 status != 'PAID'로 골라 승인(APPROVED)된 급여까지 다시 계산해 덮어쓴다. /save의 확정 잠금(#B1)과 apply-unused-allowance의 'PENDING만' 정책과 어긋난다. |
| 39 | medium | `src/routes/payroll/core.ts:900` | 근태 동기화의 월중 입·퇴사(isPartial) 분기가 hourlyWage를 설정하지 않아(초기값 0) 결근 공제가 항상 0이다. preview와 save는 pro.hourly_wage를 쓴다. |
| 41 | medium | `src/routes/leaves.ts:652` | 반려·신청삭제가 UPDATE/DELETE가 0행이어도(대상이 APPROVED인 경우) clearLeaveAttendance를 실행한다. 이 함수는 요청 id가 아니라 날짜 범위로 근태 휴가 마킹을 지우므로, 승인된 다른 휴가의 마킹까지 지운다. |
| 45 | medium | `src/scripts/dashboard.js:168` | The dashboard's top-clients card puts encodeURIComponent(client.client_name) straight into a single-quoted onclick. encodeURIComponent does not encode ' ( ) so a client name can inject JavaScript. |
| 48 | medium | `src/routes/clients.ts:475` | Client intelligence revenue (and the category revenue in forecast.ts:39) is SUM(oi.unit_price * oi.quantity), which ignores the unit-price axis. For AREA lines it misses the ㎡ area; it also ignores discounts and minimum billing. |
| 49 | medium | `src/scripts/invoice.js:320` | 거래명세서 페이지는 shell.js 를 싣지 않는 독립 HTML인데 createTaxInvoice 가 성공 직후 navigateTo() 를 불러 ReferenceError 가 나고, catch 가 이를 「세금계산서 발행 실패」로 띄운다. |
| 51 | medium | `src/scripts/quotation.js:294` | 독립 견적서 페이지의 convertToOrder 가 shell 에만 있는 showConfirm 을 try 밖에서 불러, [주문으로 전환] 버튼이 ReferenceError 로 아무 반응 없이 죽는다(308·312 의 navigateTo 도 같은 문제). |
| 52 | medium | `src/scripts/migration.js:6` | SPA 로 주입되는 페이지 스크립트에 최상위 const/let 이 있어서, 같은 페이지에 다시 들어오거나 다른 페이지가 같은 이름을 var 로 선언한 뒤 들어오면 스크립트 전체가 SyntaxError 로 실행되지 않는다. |
| 53 | medium | `src/scripts/inventoryCount.js:849` | readyState 가드 없이 DOMContentLoaded 에만 초기화를 걸어 두어, SPA 로 진입하면(사이드바 클릭이 기본 경로) 초기화가 영영 실행되지 않는다. cashReceipts.js:422·hometaxInvoices.js:452 도 같은 형태다. |
| 62 | medium | `scripts/journey/cycle.cjs:122` | journey:gate decides pass/fail only by counting '✗' lines in report.cjs output and ignores Playwright's exit code. If no tests run (spec load error, empty suite) or `test.only` is left in, the gate still passes. |
| 63 | medium | `scripts/render-junk-audit.cjs:296` | render-junk and table-clip count a screen that bounced to /login or failed to load as a 'note' with zero hits and still exit 0. If authentication breaks, every screen goes unmeasured and the audit still reports OK. |
| 66 | medium | `.claude/skills/ship/SKILL.md:58` | /ship의 배포 전 가드가 /deploy-verify보다 약합니다. 커밋되지 않은 작업분을 그대로 배포하는 것을 허용하고, behind(원격보다 뒤처짐) 검사가 없으며, push를 배포 뒤로 미룹니다. 이는 CLAUDE.md·메모리의 push-FIRST 및 'dirty면 배포 금지'와 모순됩니다. |
| 67 | medium | `.claude/skills/review-checklist/SKILL.md:33` | §2가 IllustratorAutomat/publish/의 ExtractGroups·ProcessOrderItem·PackGroups와 source를 diff하라고 지시하는데, publish/에는 SheetLayout.jsx만 있습니다. 또 anti-patterns AP-003의 'publish 복사'는 CLAUDE.md가 명시한 런타임 정본(실행 중 exe 폴더, publish 아님)과 반대입니다. |
| 72 | low | `src/routes/cards/lifecycle.ts:1315` | /:id/revert does not check shipped_at, so a card that has already shipped can be sent back to PRINT_PENDING. Its auto-deducted materials are restored, but the order stays SHIPPED because syncOrderStatusFromCards skips SHIPPED orders. |
| 76 | low | `scripts/ia-deploy.cjs:125` | runGates가 `GATES.filter(g => pkg.scripts[g])`로 package.json에 없는 게이트를 경고 없이 건너뛴다. 게이트 스크립트 이름을 바꾸거나 지우면 IA 배포 게이트가 조용히 빠진다. |
| 78 | low | `src/routes/purchaseInvoices.ts:236` | 매입확정이 PO 총액을 다시 계산하면서 final_amount = subtotal + vat 로 덮는다. 기존 discount_amount 를 빼지 않아 할인이 사라진다. |

## 미반영 — 확정 (결정/큰 작업)

| # | 심각도 | 크기 | 위치 | 결함 | 제안 |
|---|---|---|---|---|---|
| 1 | high | heavy · 결정 | `src/routes/taxInvoices/issue.ts:692` | 발행취소(POST /:id/cancel)가 로컬 status 만 CANCELLED 로 바꾸고 바로빌/국세청에는 아무 요청도 하지 않는다(cancelIssue 호출처 0건). | 국세청 전송 후 상태는 취소를 막고 수정발행(계약해제 4)으로 유도하거나, 전송 전이면 바로빌 발행취소 API를 호출해 성공 시에만 로컬 CANCELLED 로 전환. |
| 3 | high | light | `src/routes/scan.ts:228` | The scan-to-ship action (CARD:ship) only sets cards.shipped_at. It skips everything the other card ship paths do: the status check, the post-processing check, the SHIPPED order transition, deductStockLinesOnShip, ensureShipmentForOrder and applyShipBillingDates. | Have CARD:ship call the same helper as /cards/:id/ship, or extract the ship logic from POST /cards/:id/ship into a shared function and call it here. |
| 5 | high | light | `src/routes/inventory.ts:707` | 입고 검수 결정(CANCELLED)은 입고 건을 법인 필터 없이 읽고, 재고 역분개는 세션 법인(cancelEntityId)으로 한다. 목록(/receipts/pending-review)에도 법인 필터가 없다. | curReceipt 조회에 entity_id 를 넣어 entityFilter 를 걸고, 역분개·원장의 법인은 세션 값이 아니라 receipt.entity_id 로 쓴다. pending-review·inspection-counts 에도 entityFilter 를 추가한다. |
| 6 | high | light | `src/routes/leaves.ts:337` | 월차 적립이 입사 이후 누적 개월 수(calcMonthlyAccrualUpTo)를 달력연도 행(year=currentYear)에 그대로 쓴다. 해가 바뀌면 새 연도 행이 0에서 시작해 전년도 적립분 위에 누적값 전체를 다시 적립한다. | currentAccrued를 해당 직원 MONTHLY 전 연도 accrued 합으로 읽고, 새 연도 행에는 delta만 넣는다(또는 월차 행 year를 입사연도로 고정). |
| 8 | high | heavy · 결정 | `src/routes/ledger/ar-helpers.ts:117` | 주문 상세의 「수금완료」(billing_status=PAID)로 바꾸면 그 주문의 청구액이 모든 미수 파생(deriveClientBalance·Bulk·deriveArSplit·reports·cashflowEngine §4b)과 재무제표 매출에서 빠지는데, 입금(payments)은 그대로 차감돼 미수금이 과소 표시되고 가짜 선수금이 생긴다. | 청구액 집계를 전부 billing_status IN ('BILLED','PAID')로 바꾸거나, 미수가 파생인 이상 수금완료 상태 자체를 폐기한다. |
| 11 | medium | light · 결정 | `src/routes/orders/core.ts:636` | DELETE /orders/:id 소프트 삭제가 SHIPPED·BILLED/PAID 주문을 MANAGER 권한으로 CANCELLED 처리하면서 재고까지 환원해, /unship(BILLED 차단)·/cancel(SHIPPED 차단)의 가드를 통째로 우회한다. | 소프트 삭제 전에 billing_status IN('BILLED','PAID') 차단 + SHIPPED 는 /unship 먼저 하도록 400(또는 unship 과 같은 가드 재사용). |
| 12 | medium | light | `src/routes/orders/update.ts:117` | 출고 차감 잠금 가드가 원장 OUT 수량(salesBaseQtySql 로 base 환산된 값)과 payload 의 원시 quantity 를 비교해, 롤 판매 품목이 든 출고 주문은 배송지·비고만 고쳐도 저장이 막힌다. | 비교 기준을 같은 축으로 — 기존 order_items 를 selectShippableLines 와 같은 SQL 로 환산한 값과 payload 를 비교하거나, payload 수량도 salesBaseQty 규칙으로 환산. |
| 13 | medium | light | `src/routes/orders/update.ts:123` | 잠금 가드가 품목·수량만 비교하고 담당 법인(assigned_entity_id)을 안 보므로, 출고 후 라인 담당법인이 바뀌면 환원이 차감 행을 못 찾아 no-op 이 된다. | deducted 맵 키를 (item_id, entity_id)로 만들고 incoming 도 COALESCE(assigned, order.entity) 기준으로 비교. |
| 14 | medium | light | `src/routes/returns.ts:219` | 반품 재입고가 return_items.quantity(판매단위 원시값)를 그대로 더해, 출고 차감이 base 로 환산된 롤 품목은 재고가 pack_size 배 적게 돌아온다. | 조회 시 order_items/items 를 조인해 salesBaseQtySql 과 같은 규칙(또는 sales_unit 스냅샷)으로 base 환산 후 가산. |
| 15 | medium | heavy · 결정 | `src/routes/orders/core.ts:654` | RESTOCK 반품이 RESOLVED 된 주문을 출고취소(/unship)·소프트삭제하면 restoreStockLinesOnUnship 이 원 OUT 수량 전량을 다시 더해 재고가 이중 복원된다. | 환원량에서 해당 주문 RETURN IN 합계를 빼거나, 반품 재입고가 있는 주문은 출고취소·삭제를 차단(정책 선택). |
| 17 | medium | heavy | `src/routes/orders/update.ts:344` | PUT /orders/:id 가 return_items 삭제·카드 보존 경로의 order_items 삭제를 개별 .run() 으로 먼저 커밋한 뒤 재삽입을 따로 해, 재삽입 단계가 실패하면 주문 라인·RMA 라인이 유실된다. | 삭제와 재삽입을 한 batch 로 묶을 수 있게 재구성(부모 id 는 서브쿼리/사전 채번)하거나 최소한 return_items 삭제를 재삽입 batch 안으로 이동. |
| 18 | medium | light | `src/routes/taxInvoices/issue.ts:409` | POST /(단건·order_ids 묶음) 에 #581 법인 가드도, 「이미 계산서가 연결된 주문」 제외도 없다 — batch-create 는 entityFilter 가 있고 monthly-create 는 NOT IN 이 있는데 이 경로만 빠졌다. | 주문 조회에 entityFilter(c,'o') 추가 + tax_invoice_orders∩(status!='CANCELLED') 에 걸린 주문이 있으면 400 (batch-create 에도 같은 중복 가드). |
| 20 | medium | light | `src/routes/taxInvoices/manage.ts:268` | 재시도(FAILED/NTS_FAILED→DRAFT)가 같은 invoice_number 를 mgtKey 로 다시 쓰므로, NETWORK_ERROR(응답만 유실)로 FAILED 가 된 건은 재발행이 바로빌 중복 관리번호로 거부돼 영구 FAILED 로 남는다. | retry/재선점 전에 provider.getStatus(mgtKey) 로 이미 등록됐는지 확인해 있으면 SENT 로 복구, 없을 때만 DRAFT 로 되돌린다. |
| 21 | medium | light | `src/services/barobillCard.ts:49` | 일별/월별 카드·계좌 내역 조회는 assertBarobillQueryOk(응답 전체가 순수 음수일 때만 throw)만 쓰는데, memory 기록상 -24005 는 페이지 구조 XML 안에 담겨 와 빈 배열로 삼켜진다 — 청주 5주 미수집의 구조가 코드에 그대로 남아 있다. | Paged 응답에서 <CurrentPage>-\d+ (또는 임의 요소의 순수 음수값) 를 검사해 throw 하는 가드를 카드·계좌 4함수에 같이 적용(WSDL 로 오류 위치 확인 선행). |
| 23 | medium | light | `src/services/barobillTax.ts:182` | 상태조회가 StateCode·NTSConfirmNum 요소를 읽는데 바로빌 TaxInvoiceState 는 BarobillState/NTSSendState 계열 필드라(팝빌 코드 체계 잔재로 보임) stateCode 가 항상 0 → 상태가 영영 갱신되지 않을 가능성이 높다(WSDL 미대조). | TI.asmx WSDL 의 GetTaxInvoiceState 응답 필드명을 확인해 매핑을 바로빌 코드로 교체하고, 모르는 응답이면 200 대신 오류로 표시. |
| 24 | medium | light · 결정 | `src/routes/messagesAd.ts:10` | 헤더는 「(광고) 표기 + 전송자 명칭」을 서버가 보장한다고 적지만 실제로는 withAdPrefix 가 '(광고) ' 만 붙이고 전송자 명칭·연락처는 강제하지 않는다. | withAdPrefix 를 '(광고)<법인명>' + 본문 끝 연락처로 확장(법인 설정값 사용)하거나, 헤더 주석을 실제 보장 범위로 정정. |
| 25 | medium | light · 결정 | `src/routes/printEvents.ts:362` | autoCheckCardItem turns any card that is not PRINT_DONE, HOLD included, into PRINT_DONE, so an automatic print event walks past a hold that a person placed (order cancellation or a defect). | Skip the transition when card.status is HOLD and only mark print_completed on the card_items; decide whether a hold should block the automatic transition. |
| 26 | medium | light | `src/routes/cards/lifecycle.ts:1339` | Moving a card back from PRINT_DONE (/:id/revert to PRINT_PENDING, or print-toggle uncheck to PRINTING at line 1237) does not undo order_items.shipment_ready=1, which was set when the card reached PRINT_DONE. That flag is a one-way cache. | In both revert paths, set shipment_ready=0 on the card's order_item lines when no other card holding that line is still PRINT_DONE. |
| 31 | medium | light | `src/routes/purchaseOrders/po-receive.ts:259` | PO 헤더 상태(willAllReceived)는 수량 기준으로만 판정하는데, 같은 batch 의 line_status 는 예상수량 라인(qty_is_estimate)을 롤 수로 닫는다. 그래서 헤더와 라인 판정이 갈린다. | willAllReceived 와 취소 롤백의 allReceived 판정에 line_status 와 같은 분기(qty_is_estimate=1 AND order_packs>0 이면 received_packs>=order_packs)를 쓴다. |
| 32 | medium | light · 결정 | `src/routes/inventory.ts:862` | 입고 취소 롤백이 PO 의 현재 상태를 보지 않고 status 를 무조건 다시 계산해 덮는다. 이미 CANCELLED 인 발주가 CONFIRMED/PARTIAL_RECEIVED 로 되살아난다. | prevStatus 가 CANCELLED 면 상태는 유지하고 라인 수량만 되돌린다(또는 취소 자체를 400 으로 막는다). 어느 쪽이 맞는지는 정책 판단이 필요하다. |
| 33 | medium | light | `src/routes/inventory.ts:729` | 입고 취소 역분개는 차감할 창고를 '지금의 품목 기본창고'로 다시 계산한다. 입고 당시 창고는 원장 PURCHASE 행에 남아 있는데 그것을 쓰지 않는다. UPDATE 는 MAX(0) 이고 행이 없으면 0행인데, 원장 OUT 은 전량으로 기록된다. | autoDeductRestore.zoneOfDeduction 처럼 reference_type='PURCHASE' AND reference_id=receipt_id 원장 행의 storage_zone_id 로 역분개한다. 원장 quantity 와 balance_after 는 실제 반영량과 서브쿼리로 맞춘다. |
| 34 | medium | light | `src/routes/purchaseOrders/core.ts:503` | 발주 수정(PUT)이 헤더 UPDATE, 라인 DELETE, 라인 INSERT(80 청크 batch)를 각각 따로 커밋한다. | 헤더 UPDATE, DELETE, 전체 라인 INSERT 를 하나의 db.batch 로 묶는다(바인드 한도는 문장당이라 문장 수는 문제가 아니다). |
| 35 | medium | heavy · 결정 | `src/routes/leaves.ts:396` | 연차 부여는 매년 1/1 달력연도 행에 새로 쓰는데, 만료일은 '직전 입사기념일+1년'이다. 그래서 1월에 부여한 연차가 몇 달 안에 만료되고, 입사기념일에는 같은 해 행이 이미 차 있어 새로 부여되지 않는다. | 회계연도 기준과 입사일 기준 중 하나로 정한다. 입사일 기준이면 행 키를 기념일 주기(부여연도)로 바꾸고, 회계연도 기준이면 만료일을 연말로 바꾼다. |
| 40 | medium | light · 결정 | `src/routes/payroll/shared.ts:530` | lookupIncomeTax는 그 연도 간이세액표 행이 없거나 구간 밖이면, 2~3배 과대로 알려진 근사 산식 calcOfficialMonthlyTax로 조용히 대체한다. 이를 알려 주는 applied_tax_row_id=null은 어느 화면·응답에도 쓰이지 않는다. | 표가 없는 연도면 직전 연도 표로 폴백하거나 저장을 거부하고, 폴백 사용 여부를 응답·화면에 표시한다(정책 선택). |
| 42 | medium | light | `LogWatcher/EventQueue.cs:43` | DequeueAll 이 큐를 비우고 빈 파일을 먼저 저장한 뒤에 재전송하므로, 재전송 스윕 도중 프로세스가 죽거나 PC 가 꺼지면 아직 안 보낸 큐 이벤트가 전부 사라진다. | 스냅샷만 떠서 보내고, 전송이 끝난 이벤트만 제거·저장하거나(peek→remove-on-success) 건마다 남은 목록을 저장한다. |
| 43 | medium | light | `IllustratorAutomat/ProcessOrderItem.jsx:101` | app.open 이후 main() 안에서 예외가 나면 바깥 catch가 로그만 쓰고 원본 문서를 닫지 않는다. 그래서 숨김·임시 레이어·아트보드 변경이 적용된 채로 문서가 일러에 남는다. | main 본문을 try/finally로 감싸 doc가 있으면 close(DONOTSAVECHANGES)한다. SheetLayout·ExtractGroups·PackGroups·AnalyzeStructure의 catch 경로에도 같은 정리를 넣는다. |
| 44 | medium | light | `src/routes/prices.ts:102` | The price suggestion's reverse calculation from amount to a per-㎡ price hardcodes a 100cm minimum billing side and reads today's items.pricing_method. It ignores the per-item/line min_billing_side_cm (UV boards = 0, actual-area billing) and the line snapshot oi.pricing_method/min_billing_side_cm added in migration 0600. | Use COALESCE(oi.pricing_method, i.pricing_method) and COALESCE(oi.min_billing_side_cm, i.min_billing_side_cm, 100) inside the MAX(...) so it matches billingSide()/resolveLineAxis. |
| 46 | medium | light · 결정 | `src/routes/clients.ts:702` | When a bulk client import matches an existing client, the UPDATE overwrites every column with defaults if the file lacks it: is_active=1, delivery_method='방문수령', invoice_method='PER_ORDER', and phone/address etc. set to NULL. | In the UPDATE, change only the columns present in the input, e.g. COALESCE(?, col) with undefined → null bound; decide whether a blank value means 'keep' or 'clear'. |
| 47 | medium | light | `src/routes/priceList.ts:251` | GET /api/price-list/calculate uses sales_price || base_price as its base, which diverges from the 2026-09-03 decision to use base_price as the customer-facing price (priceSheets.computeAppliedPrice). The order form (itemRow.js:319) then calls it without await and overwrites the unit price with the late response. | Change basePrice to item.base_price || 0 (same as priceSheets) and have itemRow.js drop the response if the price field has changed since the request. |
| 50 | medium | light | `scripts/check-fn-refs.cjs:216` | check:fn 이 레이아웃(shell.js) 정의를 모든 페이지 번들에 합쳐서 보기 때문에, renderPage 를 안 쓰는 독립 페이지(invoice·quotation 등)가 shell 전용 함수를 부르는 경우를 못 잡는다. | 페이지 .ts 가 renderPage/appLayout 을 import 하는지로 레이아웃 포함 여부를 가르고, 안 하면 layoutDefs 를 빼고 검사한다(자가시험에 독립 페이지 케이스 추가). |
| 54 | medium | light · 결정 | `src/routes/portal.ts:536` | 포털 재주문 요청(portal_reorder_requests)은 INSERT만 되고, 내부 화면·알림·API 어디에서도 읽지 않습니다. 고객 요청이 조용히 사라집니다. | 최소한 INSERT 직후 notifyRoles(담당·MANAGER)를 호출하거나, 수신함을 만들 때까지 포털의 재주문 버튼을 숨긴다. |
| 55 | medium | heavy | `src/routes/portal.ts:774` | 고객에게 보내는 원장(verify-document ledger)의 잔액 산식이 정본(deriveClientBalance, 청구그룹 기준)과 다릅니다. 기간 이월잔액 없이 0에서 시작하고, 미청구·DRAFT 주문의 final_amount까지 차변에 넣으며, 날짜 축도 created_at입니다. | ar-ledger.ts의 opening_balance(기간 이전 합)와 order_billing_groups BILLED 기준을 재사용하고, DRAFT와 미청구를 빼며, 날짜는 청구일·업무일자를 쓴다. |
| 56 | medium | light | `src/routes/migration.ts:728` | 이관 대사 /verify/balances가 폐기된 산식(orders.billed_amount + clients.opening_balance − payments − adjustments, 법인 필터 없음)으로 system_balance와 go_no_go를 판정합니다. recalculate-all-balances를 폐기한 이유(②「산식이 파생 정본과 다르다」)와 같은 산식입니다. | system_balance를 deriveClientBalance(일괄판) 결과로 바꾸고, 대상 법인 스코프를 명시한다. |
| 57 | medium | heavy · 결정 | `src/routes/paymentRequests.ts:288` | 지출결의서 승인이 cash_schedule에 source_type=request_type('PURCHASE' 등), source_id=결의서 id로 넣는데, 같은 source_type='PURCHASE'의 source_id는 다른 모든 곳에서 발주 id로 해석돼 id 공간이 충돌한다. | 결의서 행은 전용 source_type('PAYMENT_REQUEST')으로 넣고, 엔진·pay·기존 행 데이터를 함께 이전한다. |
| 58 | medium | light · 결정 | `src/routes/financialReports.ts:349` | balance-snapshot은 매출채권·매입채무·차입금·재고를 전사 기준(entity 필터 없음)으로 세면서 현금만 세션 법인으로 걸러, 법인을 하나 고르면 순자산이 서로 다른 범위의 값을 섞어 계산한다. | 전사 스냅샷이면 efBank를 제거하고, 법인별이면 나머지 쿼리에도 entity 필터를 건다. |
| 59 | medium | light | `src/routes/fixedAssets.ts:204` | 감가상각 실행은 요청한 기간과 상관없이 자산별 MAX(period) 기록을 기준으로 삼아, 빠진 달을 나중에 소급 실행하면 누계와 장부가가 어긋난다. | 요청 period가 그 자산의 최신 기록 period 이하이면 거부하거나, 소급분은 이후 기록을 재계산하는 경로로만 받는다. |
| 60 | medium | light | `src/utils/cashflowEngine.ts:216` | auto-generate가 물질화한 입금예정(cash_schedule ORDER 행)이 주문 취소나 회계반영 취소 때 정리되지 않고(orders 라우트 어디에도 cash_schedule 정리가 없다. 발주 쪽은 core.ts:797에서 정리한다), 엔진도 주문 상태를 조인하지 않아 가짜 입금예정이 남는다. | 엔진의 ORDER 행 쿼리에 order_billing_groups를 조인해 billing_status IN ('BILLED','PAID')이고 주문이 CANCELLED가 아닌 행만 남긴다(취소 경로에 정리 코드를 추가하는 것보다 파생 쪽이 낫다). |
| 61 | medium | light · 결정 | `.github/workflows/backup.yml:86` | The 90-day cleanup calls `wrangler r2 object list`, which does not exist in wrangler 4. `2>/dev/null` plus the grep pipeline swallow the error, so nothing is ever deleted and the step still prints '✅ Cleanup complete'. | Use an R2 lifecycle rule on the `daily/` prefix (90-day expiry) instead of the script, or list objects through the S3 API. Either way, stop ignoring errors with 2>/dev/null. |
| 64 | medium | light | `scripts/jsx-ternary-audit.cjs:73` | The audit only joins the next line when a line ends with `?` or `:`. It misses the leading-operator layout (`cond\n ? A\n : c2 ? B : C`) that the JSX codebase uses widely. CLAUDE.md says this gate has a two-way self-test, but the script has none. | Join logical lines when the next line starts with ?/: as well, or parse the file into an AST and inspect ConditionalExpression.alternate. Add a `--selftest` (the three-line form must be caught; a parenthesized one must not). |
| 65 | medium | light · 결정 | `.claude/skills/ship/SKILL.md:3` | /ship은 '이거 처리해줘'(작업 나열)만으로 트리거되고 'prod까지 완전 자동'이라고 적혀 있습니다. 이는 '작업 나열은 배포 요청이 아니다'(메모리 feedback-deploy-needs-explicit-request)와 CLAUDE.md의 'Workflow는 사용자 opt-in 필수'에 모두 어긋납니다. | 트리거에서 '이거 처리해줘'를 빼거나, Phase 3 앞에 '배포가 명시되지 않았으면 커밋·push까지만 하고 멈춘다'를 추가합니다. Workflow 사용도 opt-in 조건으로 명시합니다. |
| 68 | medium | light · 결정 | `~/.claude/skills/synced/…/mes-ui-consistency/SKILL.md:24` | 계정 동기화 스킬 anthropic-skills:mes-ui-consistency가 'MANDATORY TRIGGERS'로 모든 UI 작업에 걸리는데, 폐기된 파랑 blue-600(#2563eb)·알약 뱃지·text-3xl KPI를 지시합니다. 저장소 스킬 mes-ui-consistency(감청 --c-primary·Pretendard·'파랑 복귀 금지')와 정면으로 모순됩니다. | claude.ai 계정 쪽 동기화 스킬을 삭제하거나, 저장소 스킬을 가리키는 스텁으로 바꿉니다(저장소 밖이라 사용자가 처리해야 함). |
| 69 | low | light | `src/routes/orders/lifecycle.ts:481` | PATCH /orders/:id/cancel 은 재고 환원(restoreStockLinesOnUnship)을 부르지 않아, 주문이 SHIPPED 가 아닌데 OUT 행이 이미 있는 경우 취소 후 차감이 영구히 남는다. | cancel batch 앞에서 restoreStockLinesOnUnship + restorePpDeductionsByOrder 호출(OUT 없으면 no-op). |
| 70 | low | light · 결정 | `src/routes/shipments.ts:1782` | 출고 상태를 PREPARING 으로 되돌리면 주문을 PRINT_DONE 으로 내리지만 재고 환원·카드 shipped_at 리셋을 하지 않는다(CANCELLED 분기와 비대칭). | PREPARING 복귀를 출고 되돌림으로 볼지 결정 후, 보면 restoreStockLinesOnUnship·restorePpDeductions·카드 shipped_at 리셋을 CANCELLED 분기와 같이 수행. |
| 71 | low | light | `src/routes/taxInvoices/issue.ts:710` | 취소 시 계산서 CANCELLED UPDATE·payments 링크 해제·청구그룹 초기화가 각각 별도 실행이고, 그룹 초기화 실패는 console.warn 으로 삼킨 채 success:true 를 돌려준다. | CANCELLED UPDATE·payments·그룹 문장을 하나의 db.batch 로 묶고 catch 에서 삼키지 말 것. |
| 73 | low | light | `src/routes/cards/lifecycle.ts:666` | The single-card PATCH /:id/status has no transition table, so the backward move PRINT_DONE→PRINTING that bulk/status blocks under #282 goes through here, including for shipped cards. | Apply the same VALID_TRANSITIONS table as bulk/status here, and reject changes to shipped cards. |
| 74 | low | heavy · 결정 | `src/routes/printEvents.ts:1500` | POST /print-events/link only back-fills card_id on past unmatched events. It never marks those events' card_items print_completed or moves the card to PRINT_DONE, and it does not re-run autoDeductInventory, which had skipped them with 'card_id is null'. | For back-filled OK/PRINT events, call autoCheckCardItem and autoDeductInventory. This needs a decision on how to guard against double-processing and on the tile rules. |
| 75 | low | light | `.claude/settings.json:55` | 훅 진입 명령이 CLAUDE_PROJECT_DIR부터 .claude/hooks를 찾고, 훅의 ROOT는 그 파일 위치로 고정된다. 그래서 cwd가 다른 worktree여도 커밋 tsc·dirty 게이트·편집 훅 check:fn·check:dom이 메인 체크아웃 트리를 검사한다. | 훅이 ROOT 대신 입력의 inp.cwd에서 `git rev-parse --show-toplevel`로 검사 루트를 정하게 하거나, 진입 명령에서 cwd를 먼저 탐색하게 한다. |
| 77 | low | heavy · 결정 | `src/routes/purchaseOrders/core.ts:676` | PARTIAL_RECEIVED→CANCELLED(잔량 취소)를 허용하는데, AP 파생(supplierPayable·accounts-payable)은 status NOT IN ('DRAFT','CANCELLED') 로 발주 전체 final_amount 를 뺀다. 이미 입고된 분량의 채무까지 사라진다. | 정책 선택이 필요하다. ①잔량 취소 시 final_amount 를 입고분으로 재계산하고 상태를 RECEIVED(또는 별도 상태)로 둔다. ②AP 식을 CANCELLED 여도 입고분만큼은 센다로 바꾼다. |
| 79 | low | light | `src/routes/leaves.ts:614` | 휴가 승인·승인취소가 상태를 확인한 뒤 batch를 실행하는데, batch 안 UPDATE에 AND status='PENDING'/'APPROVED' 가드가 없다. 동시 두 번 호출하면 leave_balances.used 차감이나 복원이 두 번 일어난다. | 차감·복원 문장을 WHERE EXISTS(SELECT 1 FROM leave_requests WHERE id=? AND status='PENDING')로 조건부로 만들고, 상태 UPDATE를 batch 첫 문장에 가드와 함께 둔다. |
| 80 | low | light | `caps-worker/src/index.js:51` | runSync 가 모든 오류를 삼키므로 HTTP 수동 트리거는 실패해도 200 'Sync completed' 를 돌려준다. MES 의 수동 요청은 GET /sync/pending 시점에 이미 소비(''로 UPDATE, caps.ts:473)돼서, 동기화가 실패하면 기간을 지정한 재동기화 요청이 흔적 없이 사라진다. | runSync 가 실패 시 throw(또는 결과를 반환)하게 해서 HTTP 트리거는 500 을 돌려주고, pending 은 ack 방식으로 성공 후에 지우거나 실패 시 재등록한다. |
| 81 | low | light | `IllustratorAutomat/Program.cs:3298` | 스크립트 폴더의 전역 ia_error.log는 실행 전에 지우는 곳이 없다. 그래서 JSX가 로그 없이 실패하면 이전 잡의 오류 문구가 이번 실패 원인으로 보고된다(1424·2275 폴백 경로도 같다). | RunJsxScript 직전에 scriptDir의 ia_error.log를 삭제한다. ProcessOrderItem 조기 return 경로에 오류 로그 쓰기(또는 _ia_status 반환)를 넣는다. |
| 82 | low | light · 결정 | `src/routes/aiInsights.ts:83` | The average collection days in the credit-risk score joins payments × orders on client_id only (a Cartesian product) and averages payment date minus order date over every pair, so the value is meaningless. | Define collection days by matching invoice to payment (FIFO, like ar-helpers oldest_unpaid), or remove this component; decide the metric definition. |
| 83 | low | heavy · 결정 | `src/routes/aiInsights.ts:93` | 'Overdue count' counts every order billed more than 30 days ago, including fully paid ones. calculate-all (which stores the grade) and GET /credit-risk/:id also use different formulas: calculate-all has no collection-days or trading-period term. | Judge overdue from the unpaid balance (FIFO absorption) and move both paths onto a shared scoring function. |
| 84 | low | light · 결정 | `src/routes/approvals.ts:414` | The post-approval step on final approval (credit_status APPROVED, then card generation) runs after the approval batch, and handlePostApproval swallows every exception with console.error, so the response is still success. | Return the failure in the response or record it in activity_logs; card generation should be idempotent and re-runnable from the order screen. |
| 85 | low | light · 결정 | `src/routes/portal.ts:194` | /balance?t= 임시 토큰 모드는 portal_access_tokens 존재 여부만 확인합니다. 그래서 verify-document가 요구하는 사업자번호(BRN) 확인(#314)을 같은 토큰으로 우회할 수 있습니다. | 임시 토큰에 용도(metadata.type)를 두고 /balance 허용 토큰을 구분하거나, balance 모드에도 BRN 확인을 요구할지 정한다. |
| 86 | low | light · 결정 | `src/routes/permissions.ts:112` | HARD_ADMIN_ONLY_PAGES에는 '/permissions'만 있습니다. 코드에서 ADMIN 전용으로 막힌 /bank·/users·/settings·/migration·/inspections는 권한 매트릭스에서 부여할 수 있고, 0453은 실제로 ACCOUNTANT에게 /bank 열람·편집을 부여해 두었습니다. | ACCOUNTANT에게 /bank를 실제로 열지, 0453의 부여를 회수할지 정한다. ADMIN 전용 페이지 목록은 index.tsx의 requireAdminPage 사용처와 맞추고, PATCH /api/permissions에서도 거부한다. |
| 87 | low | light · 결정 | `src/routes/migration.ts:598` | /migration 「기초잔액」 적재는 clients.opening_balance를 UPDATE하고 imported N을 보고합니다. 하지만 AR 정본(deriveClientBalance·ar-ledger)은 이 컬럼을 읽지 않아 적재 결과가 어디에도 반영되지 않습니다. | 기초잔액을 adjustments(이월 전표)로 적재할지, 이 기능을 막고 410으로 사유를 알릴지 정한다. |
| 88 | low | heavy · 결정 | `src/routes/vatReports.ts:49` | 부가세 신고서의 매입세액은 hometax_invoices만 읽는데, 팝빌 제거 후 이 테이블의 수집 경로가 죽어 있어(hometaxInvoices.ts:43 getProvider가 null, barobillTax 수집은 빈 stub) 새 분기의 매입세액이 0으로 나오고 경고도 없다. | 매입 원천(바로빌 수집, purchase_invoices 등)을 정한다. 그 전까지는 hometax 최신 적재일이 기간을 못 덮으면 응답에 경고 플래그를 싣는다. |
| 89 | low | light · 결정 | `.claude/skills/auto-improve/SKILL.md:119` | 자동 수정(인덱스 추가 마이그레이션 포함)을 '즉시 수정'하라고 하면서 worktree나 브랜치 격리 지시가 없고, 커밋은 사용자 확인 뒤로 미룹니다. CLAUDE.md의 '미완성 dirty WIP 금지·메인 체크아웃 직접 코드작업 지양'과 모순됩니다. | 자동 수정은 `new-session.ps1` worktree나 브랜치에서 하고 즉시 브랜치에 커밋하도록 명시합니다. 마이그레이션은 자동 수정 목록에서 뺄지 결정이 필요합니다. |

## low 미검증 (62건 — 반박 검증을 안 거쳤다, 참고용)

| 트랙 | 위치 | 결함 |
|---|---|---|
| orders | `src/scripts/orderForm/itemRow.js:319` | 품목 선택 시 /api/prices 제안과 구 /api/price-list/calculate 를 await 없이 동시에 던지고, 후자는 사용자 입력·제안 기준값을 확인하지 않고 단가칸을 덮는다. |
| orders | `src/routes/claims.ts:117` | 클레임·반품 환불 상한이 건별로만 주문 final_amount 를 보므로, 같은 주문에 여러 건을 해결하면 누적 AR 감액이 주문 금액을 넘는다; 클레임 생성 시 client_id 와 order_id 의 일치도 검증하지 않는다. |
| tax-barobill-msg | `src/routes/taxInvoices/issue.ts:263` | 직접발행에서 계산서 헤더·BILLED 청구그룹 batch 뒤의 품목/연결 batch 가 실패하면 보상이 없어, 품목 없는 DRAFT 계산서와 이미 BILLED 인 백업주문이 남는다. |
| tax-barobill-msg | `src/routes/kakao.ts:1081` | /api/kakao/send-sms-bulk 은 messages /send-bulk 의 광고 금지어 차단을 거치지 않는 형제 대량발송 경로다(화면 호출처 없음 — API 직접 호출만). |
| tax-barobill-msg | `src/routes/taxInvoices/helpers.ts:285` | 세금계산서 발행 후 알림톡은 실제 발송 없이 kakao_send_logs 에 status='PENDING' 행만 넣는다(TODO) — 이 행을 처리하는 소비자가 없으면 발송 이력에 영구 대기로 남는다. |
| production-ia-web | `src/routes/printEvents.ts:1499` | The /link back-fill UPDATE (and the similar one in workbench.ts:1128) matches by file name only, with no entity condition, so another legal entity's unmatched print events with the same file name get attached to this card and have their entity_id rewritten. |
| production-ia-web | `src/routes/rip.ts:1509` | POST /rip/complete/:cardId puts a card into PRINT_DONE with no status guard, no card_items.print_completed, no pp_status or print_done_at, and no order sync or shipment_ready. This is the same kind of divergent PRINT_DONE path that was fixed in printEvents on 2026-09-14. No caller turned up in the repo, but the endpoint is still reachable with a JWT. |
| migrations-schema | `wrangler.jsonc:10` | wrangler.jsonc 주석에는 JWT_SECRET이 없으면 auth.ts와 middleware/auth.ts가 개발용 기본값으로 대체해 로컬이 계속 동작한다고 적혀 있습니다. 하지만 실제 코드에는 대체값이 없어서 500을 반환합니다(middleware/auth.ts:45-47, cron.ts:36). |
| migrations-schema | `migrations/0617_insurance_effective_period_and_exempt_note.sql:46` | insurance_rates 표를 다시 만들면서(DROP 후 RENAME) 기존 인덱스 idx_insurance_rates_year(0111)가 같이 사라졌고, 새로 만들지 않았습니다. 그래서 prod 스키마와 baseline_schema.sql이 인덱스 1개만큼 어긋납니다. |
| meta-docs-hooks | `.claude/hooks/_danger-patterns.cjs:19` | `/\bgit\s+branch\s+-D\b/i`가 i 플래그라서, 병합된 브랜치만 지우는 안전한 `git branch -d`까지 하드 차단한다(실측 true). |
| meta-docs-hooks | `.claude/hooks/precompact.cjs:53` | 압축 스냅샷 마커 `.claude/.precompact-state.json`이 체크아웃당 하나라서, 같은 체크아웃의 다른 세션이 다음 프롬프트에서 그것을 소비하고 남의 스냅샷을 주입받는다. |
| meta-docs-hooks | `memory/session-context.md:1` | CLAUDE.md와 stop/userpromptsubmit 훅이 말하는 `memory/session-context.md`가 두 벌이다. 저장소 추적본(09-17, 6.4KB)과 auto-memory 디렉터리본(09-24, 3.7KB)이 따로 있다. |
| meta-docs-hooks | `C:/Users/user/.claude/projects/C--Users-user-dongsan-mes/memory/MEMORY.md:1` | MEMORY.md 링크 193개 중 `[★Bash 스크립트 함정3](memory/feedback-bash-tool-script-traps.md)`의 대상 파일이 memory 디렉터리에 없다. |
| meta-docs-hooks | `.claude/skills/deploy-verify/SKILL.md:17` | journey:gate를 「J0~J6(25단계) ≈2.5분」으로 적었는데, CLAUDE.md·journey-loop 스킬은 J0~J7 40단계 ≈4.5분이다. |
| purchase-inventory | `src/routes/purchaseInvoices.ts:176` | 매입확정의 원장 단가 정정이 base 단가를 packFactor(품목 마스터)로 나눠 구한다. 입고는 라인 계수 스냅샷(unit_factor, 0620)으로 base 를 쌓았으므로 축이 어긋날 수 있다. |
| purchase-inventory | `src/routes/inventoryCount.ts:978` | 실사 승인은 재고를 counted 절대값으로 SET 하는데, 원장 ADJUST 수량은 실사 작성 시점 스냅샷(system_quantity) 기준 차이로 기록한다. |
| purchase-inventory | `src/routes/purchaseOrders/po-special.ts:149` | 발주 복사·재발주(와 빠른발주·템플릿)가 order_packs·qty_is_estimate 를 옮기지 않는다. unit_factor 는 backfillPoLineFactors 가 채우지만 이 두 칸은 복구 경로가 없다. |
| purchase-inventory | `src/routes/purchaseOrders/po-receive.ts:270` | #420 락 주석은 '직전 status 검사와 claim 사이엔 await 가 없다'고 적혀 있지만, 실제로는 채번·구역 판정·품목 조회 await 가 여러 번 있다. 라인 잔량과 willAllReceived 도 락 이전에 읽은 값이다. |
| payroll-hr | `src/routes/hr.ts:161` | GET /api/hr/employees/:id는 e.*를 그대로 반환해 resident_number(암호문, 또는 아직 암호화되지 않은 레거시 평문)와 계좌번호를 마스킹 없이 /hr 페이지 권한 보유자 전원에게 준다. 형제 /detail(:972)은 ADMIN이 아니면 마스킹한다. |
| payroll-hr | `src/routes/payroll/core.ts:966` | 육아수당은 /save에서 total_salary에 들어가지만 총액 컬럼이 없어 nontax_childcare만 저장된다. sync-attendance(:966)와 apply-unused-allowance는 total_salary를 다시 만들 때 육아수당을 빼면서 nontax_childcare는 과세에서 또 뺀다. |
| payroll-hr | `src/routes/insuranceReports.ts:196` | 신고서 생성이 헤더 INSERT 뒤에 직원별 상세 INSERT를 개별 .run()으로 순차 실행한다. 중간에 실패하면 헤더만 있고 상세가 일부만 있는 신고서가 남고, 같은 월 중복 검사(:146) 때문에 다시 생성할 수도 없다. |
| payroll-hr | `src/scripts/hrDetail.js:420` | 외국인 국민연금 경고는 주민번호 7번째 자리로 판정하는데, 비ADMIN에게는 서버가 'YYMMDD-*******'로 마스킹해 주므로 자릿수가 6이 되어 경고가 조용히 뜨지 않는다. |
| logwatcher-edge | `LogWatcher/Parsers/FlexiPrintExpParser.cs:198` | 날짜가 바뀔 때 전날 파일의 남은 꼬리를 읽기 전에 _cur=null 로 초기화하므로, 자정 직전에 끝난 작업이나 자정을 넘긴 작업의 PrintExp 완료·취소 줄이 버려진다(TransferPressParser.cs:145 도 같은 패턴). |
| logwatcher-edge | `LogWatcher/EventQueue.cs:76` | 큐 파일을 File.WriteAllText 로 원자적이지 않게 덮어쓰고, 읽기 실패는 빈 큐로 처리한 뒤 다음 Save 에서 덮어쓴다. 그래서 쓰는 도중 전원이 나가면 큐 전체가 조용히 초기화된다. 1000건을 넘으면 오래된 것부터 버리는 것도 콘솔 출력뿐이다. |
| logwatcher-edge | `LogWatcher/Parsers/TextLogParser.cs:142` | auto 인코딩을 청크마다 다시 판정하는데 BOM 은 버퍼 맨 앞에서만 보고, 첫 실행은 파일 끝부터 읽으므로 UTF-16 로그는 BOM 을 영영 못 본다. cp949 는 1% 허용치 안에서 UTF-8 로 오판하고, GetByteCount 로 위치를 계산해서 위치가 어긋난다. 현재 배포 설정에는 text_log 가 없다. |
| logwatcher-edge | `caps-worker/src/dbAdapter.js:57` | 조회가 tuser 와 INNER JOIN 하고 retire_date 가 빈 사람만 남기므로, 퇴사 처리가 먼저 되면 그 사람의 마지막 근무일 퇴근·잔업 갱신이나 갭 복구·수동 재동기화 재전송에서 빠진다. |
| ia-automat | `IllustratorAutomat/Program.cs:3238` | 주문 라인 가공이 FindIllustratorPath()가 null이면 콘솔 한 줄만 찍고 return한다. 경로는 COM 실행에 쓰이지도 않는데, 이 검사 하나로 라인이 서버 오류 보고 없이 조용히 건너뛰어진다. |
| ia-automat | `IllustratorAutomat/ProcessOrderItem.jsx:891` | 에이전트 축 EPS가 embedAllFonts=true로 고정돼 있다. 텍스트는 :117과 :791에서 전부 아웃라인되므로 이 값은 불필요하다. A0 0.9.0과 재단 0.46.0에서 고친 결정이 에이전트 축에는 적용되지 않았다. |
| ia-automat | `IllustratorAutomat/ExtractGroups.jsx:214` | ExtractGroups와 PackGroups의 빈 catch 사유가 '_ia_status 가 결과를 나른다'라고 적혀 있다. 그런데 두 스크립트 모두 _ia_status를 정의하지도 반환하지도 않는다. empty-catch 게이트가 거짓 사유를 통과시켰다. |
| crm-reports-misc | `src/routes/approvals.ts:397` | The approval step UPDATE has no AND status='PENDING' guard and does not check the changed-row count, so two concurrent approvals (double click, or two approvers with the same role) both succeed and handlePostApproval runs twice. |
| crm-reports-misc | `src/routes/tasks.ts:171` | /claim selects candidates, flips them with UPDATE ... WHERE status='PENDING', then re-SELECTs and returns every id regardless of who won the UPDATE, so two agents can claim the same task. |
| crm-reports-misc | `src/utils/entitySettings.ts:105` | getEntityBarobillSenderId falls back to 'DONGSAN' for entities 2 and 3 as well (the comment says this is for entity-1 compatibility only). That is the known silent-failure path where Barobill returns -24005 and collection comes back as an empty result. |
| crm-reports-misc | `src/routes/forecast.ts:74` | The 3-month moving average for next month includes the current month's partial data, and months with no orders drop out of the GROUP BY, so the window is not a real 3 months. |
| crm-reports-misc | `src/routes/clients.ts:120` | The client-list has_balance=1 filter is three correlated subqueries in the WHERE clause, run for every client (about 2,890, a table that grows) and repeated in the count query. audit:subquery only classifies SELECT-clause subqueries, so this spot is outside the gate. |
| crm-reports-misc | `src/routes/clients.ts:824` | The comment says auto-generated client codes are 'concurrency-safe via getNextSeqNumber', but there is no withSeqRetry. approval_requests.request_number (approvals.ts:209, UNIQUE) likewise imports withSeqRetry without using it. |
| crm-reports-misc | `src/routes/forecast.ts:208` | The capacity analysis hourly distribution and weekly trend group print_events.created_at (UTC) as-is, so the hours are shifted by 9 (the day buckets in the same file use printEventKstDay). |
| frontend-shell | `src/scripts/layout/shell.js:1849` | spaNavigate 에는 진행 중인 전환을 무효로 만드는 토큰이 없어서, 늦게 도착한 이전 전환의 응답이 나중 전환을 덮어쓴다. |
| frontend-shell | `src/scripts/layout/shell.js:1966` | 사이드바 클릭 핸들러와 popstate 에는 navigateTo·본문 링크 핸들러에 있는 '같은 pathname 재진입 금지' 가드가 없어서 같은 페이지 스크립트가 다시 실행된다. |
| auth-security | `src/routes/users.ts:418` | 사용품목 배정 PUT이 80행씩 끊는데 행당 바인드가 2개라 문장당 160바인드로 D1 한도(~100)를 넘습니다. 게다가 DELETE를 먼저 하고 INSERT를 따로 실행하는 비원자 구조입니다. audit:bind-limit은 IN 절만 보므로 VALUES 형태는 놓칩니다. |
| auth-security | `src/routes/cron.ts:323` | cron의 barobill-sync와 daily-maintenance는 하위 self-fetch가 401·500이어도 항상 success:true·200을 반환합니다. 워커(workers/barobill-cron)는 앞 1,000자를 로그로만 남깁니다. |
| auth-security | `src/routes/migration.ts:442` | 이관 주문 적재가 billing_status='BILLED'와 billed_amount를 orders에만 쓰고 order_billing_groups 행을 만들지 않습니다. 그래서 청구그룹 기준 AR 정본에서 빠집니다. |
| auth-security | `src/routes/auth.ts:9` | 로그인 핸들러 주석이 「index.tsx(`/api/auth/login`, 분당 5회)」라고 적혀 있지만, 실제로는 IP당 30회에 계정당 5회(perAccount)입니다. |
| money-ledger | `src/routes/cashFlow.ts:350` | 상환 스케줄을 재생성할 때 SCHEDULED만 지우고 PARTIAL·OVERDUE 회차는 남긴 채 PAID 수+1 회차부터 다시 만들어, 남은 회차와 같은 달의 회차가 중복 생성된다. |
| money-ledger | `src/routes/cardExpenses.ts:913` | 카드 월 리포트·stats·summary가 취소 건을 빼기만 하고(approval_type != 'CANCEL') 차감하지 않아, 상계에 실패한 취소(is_offset=0)만큼 합계가 과대로 나온다. 정본 cardNetAmountSql이 경고한 「둘 중 하나만 걸면 틀린다」 그대로다. |
| money-ledger | `src/routes/bank.ts:246` | 반복지출 후보 탐지(recurring-candidates)와 차입금 상환 대사용 출금 조회(cashflowEngine.ts:627)가 대표자 개인통장(is_personal=1) 출금을 거르지 않는다. |
| money-ledger | `src/routes/cashFlow.ts:449` | 부분상환 금액을 원금에 먼저 충당(min(지급액, 원금))해 차입금 잔액을 줄이는데, 통상 관행(이자 먼저 충당)과 반대라 부분상환 때 잔액이 과소 계상된다. |
| money-ledger | `src/routes/bank.ts:2544` | 고정비 실적(recurring_expense_actuals)이 (고정비, 월) 단위 1행이라, 같은 달에 거래 두 건을 같은 고정비로 확정하면 나중 금액이 앞 금액을 덮고, 한 건만 적용 취소해도 그 달 실적 행 전체가 지워진다. |
| money-ledger | `src/routes/vatReports.ts:120` | 신고 이력 저장이 ON CONFLICT로 금액을 무조건 덮어써, 이미 SUBMITTED로 처리된 분기의 저장 수치도 나중 재저장으로 바뀐다. |
| gates | `scripts/jsx-syntax-audit.cjs:100` | vm.Script parses at the latest ECMAScript level, so ES3-incompatible syntax such as `let`, arrow functions or template literals in a host .jsx passes this gate, even though ExtendScript fails to load the whole file. The self-test explicitly treats this as a pass. |
| gates | `scripts/ia-deploy.cjs:270` | When the Z: (NAS) drive is not mapped, the axis 2/3 runtime is unreachable and excluded from the check. With no other changes, ia:deploy prints '배포할 변경이 없습니다 — repo와 런타임이 이미 일치합니다' and exits 0. audit:ia-jsx likewise excludes that axis and passes. |
| gates | `scripts/ia-deploy.cjs:125` | runGates silently drops any GATES entry missing from package.json. If a gate script is renamed or removed, ia:deploy loses that gate without a warning. |
| gates | `scripts/local-e2e.cjs:29` | journey:gate follows JOURNEY_BASE_URL, which can point at :3001 when another session holds :3000, but the four local-e2e gates that run right after it look only at SMOKE_URL, which defaults to localhost:3000. They can end up testing a different server or an older bundle. |
| gates | `scripts/jwt-decode-audit.cjs:25` | The detection regex only catches `atob(...)` and the JWT fragment access on the same line. Splitting the token on one line and calling atob on a later line passes. |
| gates | `scripts/migration-number-audit.cjs:34` | Among DDL collisions between two migrations with the same number, only CREATE TABLE and ADD COLUMN are compared. Creating the same-named INDEX, TRIGGER or VIEW without IF NOT EXISTS, which also stops `migrations apply`, is not caught. |
| gates | `.claude/hooks/pretooluse-bash.cjs:85` | The commit hook matches file extensions against `git status --porcelain` output, but porcelain shows a new untracked directory as just 'dir/'. Files inside a new directory therefore bypass the empty-catch and check:fn commit gates. |
| meta-skills | `.claude/skills/ia-automat/SKILL.md:29` | '축3 갱신 후에는 PC별 install-a0-panel.ps1 재실행(축4)'이라고 지시하지만, CLAUDE.md 기준으로 2026-08-26부터 축4는 ping→mesPanel_syncShell로 스스로 따라오고 PC 방문은 불필요합니다(install은 최초 설치 전용). |
| meta-skills | `.claude/skills/review-checklist/SKILL.md:64` | 마이그레이션 검사가 '번호 순차성 보장(건너뛰기/중복 없음)'과 'IF NOT EXISTS 사용'을 요구합니다. CLAUDE.md는 번호 중복이 대개 무해하고 이미 적용된 파일을 재번호하면 재실행된다고 경고하며, SQLite ALTER ADD COLUMN에는 IF NOT EXISTS 문법이 없습니다. |
| meta-skills | `.claude/skills/migration-check/SKILL.md:14` | migrations/*.sql 생성 때 훅이 실행을 권하는 스킬인데, CLAUDE.md의 핵심 함정 두 가지를 검사하지 않습니다. 하나는 prod 행 id를 하드코딩한 데이터 마이그레이션의 WHERE EXISTS 가드(없으면 db:bootstrap:ci와 CI 전체가 깨짐), 다른 하나는 같은 번호·같은 테이블 DDL 충돌(audit:migration-number)입니다. |
| meta-skills | `.claude/skills/ship/SKILL.md:42` | Phase 2가 ship:gate를 'verify → entity-audit → canary:write'로 설명하지만, 실제 package.json의 ship:gate는 check:fn·jwt-decode·bind-limit·test:calc·journey:gate(≈4.5분)·test:local-e2e(로컬 서버 필요)까지 9단계입니다. |
| meta-skills | `.claude/skills/deploy-verify/SKILL.md:17` | journey:gate를 'J0~J6(25단계)·≈2.5분'으로 적었는데, CLAUDE.md와 journey-loop 기준 현재는 J0~J7 40단계·≈4.5분입니다. Phase 6 보고 양식은 스킬 스스로 localhost 대상이라고 경고한 `npm run smoke`를 API 스모크 출처로 적고 있습니다. |
| meta-skills | `.claude/skills/security-audit/SKILL.md:78` | XSS 오탐 차단 규칙이 전역 escapeHtml 정의 위치를 `layout.ts:1185`로 적었는데, layout.ts는 분할됐고 실제 정의는 src/scripts/layout/shell.js:111입니다. |
| meta-skills | `.claude/references/decisions-code.md:48` | 결정 M은 '/deploy-verify가 배포 직전 deploy-snapshot.sh를 실행해 .claude/deployments/*.json을 남긴다'를 롤백 근거로 적었는데, deploy-verify 스킬에는 그 단계가 없고 .claude/deployments/ 폴더도 없습니다. |

## 반박된 9건

- `src/routes/returns.ts:149` — 반품 상태를 RESOLVED 로 먼저 커밋한 뒤 AR 조정·재입고를 별도로 실행해, 재입고 단계가 실패(전체법인 모드 400 포함)하면 RESOLVED 로 굳어 재시도 경로가 없다. → 반박: 코드 구조는 발견 내용과 같습니다. 상태 UPDATE(:149)와 AR batch(:155)가 먼저 커밋되고, 재입고는 그 뒤에 별도 처리됩니다(:185의 400, :207의 batch). 하지만 제시된 재현 경로 두 가지 모두 실제로 일어날 근거가 없습니다. (1) 전체 법인 모드에서 나는 400: stock_entity_id는 COALESCE(oi.as
- `src/utils/entitySettings.ts:105` — senderId 폴백이 법인과 무관하게 하드코딩 'DONGSAN' 이라, entity 1 이 아닌 법인에서 설정이 빠지면 타 법인 ID 로 조회·발송이 나간다(kakao.ts:101·fax.ts:32 사본도 동일). → 반박: 지금 재현되는 결함이 아닙니다. 설정이 빠졌을 때만 문제가 되는 잠재 위험이고, 운영상 이미 알고 정리한 사항입니다. (1) 'DONGSAN' 은 첫 번째 폴백이 아닙니다. 순서는 entity_settings(법인별) → 전역 settings → 'DONGSAN' 입니다(entitySettings.ts:92-105). 하드코딩 값은 전역 설정까지 비어 있어
- `LogWatcher/Core/WatcherManager.cs:103` — 재전송 스윕이 첫 네트워크 실패에서 멈추지 않고 큐 전체(최대 1000건)를 건당 10초 타임아웃으로 순차 시도하므로, 서버 장애 중에는 폴링 루프가 몇 시간씩 멈춘다. → 반박: It's true that the sweep has no early exit. WatcherManager.cs:103-106 tries every queued event in turn, the queue holds up to 1000 (EventQueue.cs:17), and each request times out after 10s (MesApiClien
- `LogWatcher/Parsers/SqliteDbParser.cs:154` — EPSON 파서가 반환된 최대 JobID 로 _lastId 를 올리므로, 이 번호보다 작은 JobID 가 나중에 완료(12)되면 쿼리(JobID > @last_id)에 다시는 안 걸린다. 재확인은 취소(2) 감시 목록만 한다. → 반박: This watermark behaviour is a documented design choice, not an oversight. It rests on a stated premise: Epson Edge Print runs jobs as a serial queue. USAGE.md:261 and the _comment3 note in equipment.j
- `LogWatcher/PrintLogParser.cs:186` — TNS Print.log 파서는 필드를 상태 마커에서 거꾸로 읽는데, 매 폴링마다 위치를 파일 끝까지 올린다. 그래서 폴링 경계에 걸친 레코드는 앞쪽 필드가 이전 청크에 남아 추출이 실패하고, 로그 한 줄 없이 버려진다. → 반박: The code mechanism is real, but there is no evidence that the failure actually happens. PrintLogParser.cs:186 does move the position to fileLength, and :274 does return null with no warning when fewer
- `LogWatcher/Parsers/FlexiHtmlParser.cs:530` — RIPLOG 인코딩을 처음 만난 비ASCII 청크 하나로 영구 확정하는데, U+FFFD 가 2자 이하이면 UTF-8 로 고정된다. 그래서 cp949 PC 에서 첫 한글이 한 글자뿐이면(예: '(주)') 이후 전부 UTF-8 로 잘못 읽힌다. → 반박: 이 시나리오는 실제 입력 구조에서 나올 수 없습니다. `_lastPosition` 은 완결된 `</TABLE>` 끝까지만 전진하므로(FlexiHtmlParser.cs:186-189) 판정에 쓰이는 청크는 항상 블록 경계에서 시작합니다. 블록 안에서는 각 행의 라벨 칸이 값 칸보다 앞에 오고, 그 라벨이 한글입니다("파일:", "파일 크기:", "출력 ICC
- `IllustratorAutomat/designer/mes-cut-host.jsx:3329` — 굳히기 PDFSaveOptions가 viewAfterSaving과 마크·도련만 명시한다. 래스터 다운샘플·압축(colorDownsampling/colorCompression 등)은 명시하지 않아 PC의 마지막 PDF 프리셋을 그대로 물려받을 수 있다. → 반박: 코드 사실은 맞습니다. mesCut_pdfNoMarks(mes-cut-host.jsx:112-120)와 두 굳히기 경로(:3120-3126, :3329-3340)는 viewAfterSaving·마크·도련만 명시하고, 다운샘플·압축은 명시하지 않습니다. 하지만 이것이 재현 가능한 결함이라는 근거는 없습니다.  1. 실측된 상속은 두 속성뿐입니다. PC 프리셋
- `src/routes/hrSelf.ts:17` — 직원 셀프 인증이 사원번호와 생년월일 6자리뿐입니다(생년월일은 사실상 공개 정보). 그런데 이 토큰으로 급여명세서·근로계약서(주소·연락처·서명) 열람과 근로계약 전자서명(PATCH sign)까지 할 수 있습니다. 레이트리밋도 isolate별 메모리 Map이라 우회됩니다. → 반박: 코드에 적힌 사실은 맞습니다. 셀프 인증은 사원번호와 생년월일 6자리뿐이고(hrSelf.ts:17-60), 그 토큰으로 급여명세서 열람(:217)과 근로계약서 서명(:323)이 됩니다. 다만 이것은 사용자가 이미 확정한 설계입니다. memory/design-payroll-self-service.md 설계결정 2번에 「인증 강화 안 함 — 사원번호+생년월일 
- `src/routes/bank.ts:2081` — 통장 거래를 CREATED 모드로 적용하는 과정이 세 번의 따로 된 쓰기(①APPLIED 클레임 ②payments·purchase_payments INSERT batch ③matched_*_id UPDATE)라, ③이 실패하면 원장 행이 통장과 연결되지 않은 채 남는다. → 반박: 리뷰가 짚은 코드 구조는 맞습니다. 입금 경로는 bank.ts:2083 클레임 → :2091 batch → :2093 UPDATE, 출금 경로는 :2038 → :2045 → :2053 순서로 쓰기가 따로 나뉘어 있습니다. 하지만 리뷰가 제시한 결과인 「다시 적용하면 입금이 새로 생겨 미수금이 이중 차감된다」는 재현되지 않습니다.  - **재적용은 연결부터 

## 2차 반영 (같은 날, `session/review-fixes2`)

결정 없이 고칠 수 있는 확정분 22건 + 리뷰 도중 새로 나온 2건.

| # | 위치 | 조치 |
|---|---|---|
| 3 | `scan.ts` · `cards/lifecycle.ts` | 스캔 출고가 웹 출고와 같은 본체(`shipCard`)를 탄다 — 상태·후가공 확인·주문 전이·재고 차감·출고 기록 |
| 5·33 | `inventory.ts` | 입고 검수 목록·카운트에 법인 필터, 취소 역분개는 입고 법인·원장 창고로 |
| 12·13 | `orders/update.ts` | 출고 잠금 가드를 원시↔원시·(품목×법인)으로 비교 |
| 14 | `returns.ts` | 반품 재입고를 출고 차감과 같은 base 환산으로 |
| 18 | `taxInvoices/issue.ts` | 단건·묶음 발행에 법인 필터 + 이미 발행된 주문 400 |
| 26 | `cards/lifecycle.ts` | 출력 되돌리기 2경로에서 `shipment_ready` 짝 되돌림 |
| 31 | `po-receive.ts` · `inventory.ts` | PO 헤더 완료 판정을 라인과 같은 축(예상수량=롤 수)으로 |
| 34 | `purchaseOrders/core.ts` | 발주 수정 헤더·삭제·재삽입 한 batch |
| 44 | `prices.ts` | 단가 제안 역산을 라인 스냅샷 축·최소청구 변으로 |
| 47 | `priceList.ts` · `itemRow.js` | 기준가 base_price 통일, 늦게 온 응답이 입력을 덮지 않음 |
| 50 | `check-fn-refs.cjs` | 독립 HTML 페이지에는 레이아웃을 붙이지 않음(자가시험 8건·양방향) |
| 56 | `migration.ts` | 이관 대사를 AR 정본(`deriveClientBalancesBulk`)으로 |
| 59 | `fixedAssets.ts` | 뒤 기간 기록이 있는 자산은 소급 상각 건너뜀 + 응답에 건수 |
| 60 | `cashflowEngine.ts` | 취소·청구해제된 주문의 입금예정 행을 파생 필터로 제외 |
| 64 | `jsx-ternary-audit.cjs` | 줄 앞 연산자 형태 탐지 + 자가시험(양방향)·`audit:jsx-ternary` 에 배선 |
| 69 | `orders/lifecycle.ts` | 주문 취소 시 출고 차감 환원(없으면 no-op) |
| 71 | `taxInvoices/issue.ts` | 계산서 취소·입금 링크·청구그룹 한 batch, 실패를 삼키지 않음 |
| 73 | `cards/lifecycle.ts` | 단건 상태변경: 출고 카드 변경·완료→출력중 역행 차단 |
| 79 | `leaves.ts` | 승인·승인취소 차감/복원에 상태 가드(동시 호출 이중 처리 방지) |
| 신규 | `shared/salesQtyLabel.js` | #50 개선 게이트가 잡음 — 거래명세서·견적서가 shell 전용 `salesQtyLabel` 을 못 불러 **판매단위 표기가 늘 원시수량**이었다 |
| 신규 | `scripts/end-session.ps1` | 세션 종료가 다른 세션 dev 서버까지 끄던 것 → 그 worktree 서버만 |

**미반영(이유)**: #6 월차 → #35 연차 기준 결정과 묶임(잔여 조회가 연도 단위라 단독 수정 시 표시가 바뀐다) · #20·#21·#23 바로빌 → WSDL 대조 선행 · #42 LogWatcher·#43·#81 IA·#80 caps-worker → 웹과 분리된 배포 축(PC 방문·`ia:deploy`) · #75 훅 cwd → 전 세션 훅 동작이 바뀌어 별도 검토.

## 결정 1차 (2026-09-26, 사용자 결정 → 반영)

| # | 결정 | 반영 |
|---|---|---|
| 1 | 전송된 계산서는 취소 불가, 이카운트처럼 취소발행·수정발행으로 | 취소 API = 로컬 발행(`ISSUED`)만 · `SENT`/`NTS_SUCCESS` 는 400(`need_modify`) · 화면에 「취소발행(4 계약의 해제, 전액 마이너스)」 버튼 · 중복발행 가드는 **순액>0** 기준(상쇄 후 재발행 허용). 판매(청구·미수)는 계산서와 별개 — 되돌리려면 회계반영 취소·반품 |
| 8 | 수금완료(PAID) 폐기 | API 400 · 버튼 제거 · 헬퍼 분기 삭제(prod PAID 0건) |
| 88 | 부가세 신고는 세무사 — 경고만 | 신고서 응답 `warnings` + 화면 경고(매입 미수집·MES 매출 없음) |
| 35·6 | 연차 = 회계연도 | 연차 만료 12/31 · 사용촉진 기준일 12/31(1차 7/1~10, 2차 10/31) · 월차 누적 이중적립 수정 + 전년 잔여를 새 연도 `carried_over` 로 이월 |

검증: 격리 DB 복사본 시뮬레이션 — 월차(2025-11 입사) 2026행 적립 9+이월 1=잔여 10·재실행 0건 · 연차 만료 2026-12-31 · PAID 400 · 부가세 경고 2줄 · local-e2e 4/4.
남은 후속: 회계연도 기준의 **입사 이듬해 비례연차**(15×전년 재직일수/365)는 미구현 — 다음 결정 묶음에서 확인.

## 결정 2차 (2026-09-26)

| # | 결정 | 반영 |
|---|---|---|
| 77 | 부분입고 발주는 취소 불가 · 입고완료로 마감하면 **입고분 금액으로 재계산** | `PARTIAL_RECEIVED→CANCELLED` 제거 + 입고 수량 있으면 취소 400 · `PARTIAL_RECEIVED→RECEIVED` 시 total/vat/final = 입고분(할인 유지)·미지급 예정 금액 동기(한 batch). ★prod `CANCELLED`+입고 28건(4,728만)은 8/25 **중복해소**로 의도된 전체 무효 — AP 제외가 맞다(리뷰 제안 ②는 이중계상) |
| 40 | 세액표 없는 연도 = 직전 연도 표 + 경고 | `lookupIncomeTax` 폴백: 그 연도 표가 통째로 없으면 가장 최근 과거 연도 표 → 범위 밖·표 전무일 때만 근사식 · 급여 화면 경고(`prTaxTableWarn`). 현재 표 = 2026 뿐 |
| 11·15 | 출고·회계반영 주문은 삭제 불가(순서대로) · 출고취소는 반품분 빼고 환원 | DELETE 가드(BILLED/PAID·SHIPPED·출고카드) · `restoreStockLinesOnUnship` 이 RETURN IN 합을 뺀다 · `test:symmetry` 를 새 정책으로(삭제 400 → 출고취소 원복 → 삭제 200 → 이중환원 없음) |
| 57 | 지출결의서 기능 **보류** | 변경 없음(사용 0건) |

## 결정 3차 (2026-09-26)

| # | 결정 | 반영 |
|---|---|---|
| 86 | 같은 화면 경로 하나로 · 경리=통장(조회+매칭·분류·수집) · 사용자·설정 등은 ADMIN | `/bank` → `/cash-schedule` 302 · 허브 [실적] 탭 ADMIN·ACCOUNTANT · 사이드바 자금관리에 경리 · bank API 30개에 ACCOUNTANT(계좌 등록·수정·삭제·바로빌 관리 URL 4개는 ADMIN) · 권한 화면은 ADMIN 전용 11페이지를 목록에서 빼고 PATCH 도 400. 개인통장은 경리에게도 보임(결정) |
| 85 | 포털 잔액 링크도 사업자번호 확인 | `/balance?t=` 에 `x-portal-brn` 대조(없음 401·불일치 403, `need_brn`) · 포털 화면 입력 폼(탭 세션 동안 기억) |
| 54 | 재주문 요청 = 추후 설계 | 변경 없음 |
| 46 | 거래처 가져오기: 파일에 있는 칸은 파일이 정본(빈 칸=지움), 없는 칸은 유지 | 프론트는 머리행에 있는 열만 전송 · 서버 UPDATE 는 받은 칸만 · 기본값은 신규 등록에만 |

함께: `test:auth-boundary` ③ 을 DB-정본 원칙으로 갱신(1차 #7 switch-entity 수정 이후 전제가 낡았다 — STAFF 클레임+DB ADMIN 은 이제 200·DB 역할로 발급이 정답, 없는 계정 401 추가).

## 결정 4차 (2026-09-26)

| # | 결정 | 반영 |
|---|---|---|
| 74 | 미매칭 출력 기록을 카드에 연결하면 **출력완료 표시만**(자동차감 소급 안 함) | `/print-events/link` 소급 후 OK·비RIP·타일 완료 이벤트가 있으면 `autoCheckCardItem`(응답 `marked_printed`). prod 최근 60일 미매칭 9,660/12,670 |
| 25 | 보류 카드는 장비 신호로 안 바뀐다 | `autoCheckCardItem` 이 HOLD 카드면 품목 기록만 남기고 상태 유지 |
| 70 | 출고된 건을 준비중으로 되돌리기 막기 | `PATCH /shipments/:id/status` PREPARING ← SHIPPED/IN_TRANSIT/DELIVERED 400(출고취소 안내) |
| 58 | 재무 스냅샷 전 항목 = 선택 법인(전체 모드면 전사) | AR `deriveArSplit(c)` · AP 3테이블·재고·차입금에 entity 필터. 격리 DB 실측: 법인0 재고 = 법인1+법인2 |

## 결정 5차 (2026-09-26)

| # | 결정 | 반영 |
|---|---|---|
| (35 후속) | 비례연차 부여 | `/accrual/yearly`: 근속 1년 미만이고 입사연도 = 전년이면 15 × 재직일수/365(소수 1자리). 로그 사유에 산식. 격리 DB: 2025-11-10 입사 → 2.1일 |
| 61 | R2 수명주기 90일 | **prod R2 규칙 추가** `expire-daily-90d`(prefix `daily/`) · 고장 난 정리 단계 제거(에러 삼키고 완료 출력) · monthly/ 영구 |
| 24 | 광고 문자 전송자 명칭 자동 | `withAdPrefix(body, sender)` = 「(광고)법인명」 · 제목도 · 법인명 = 발송 법인 `entities.name` · 수신거부 링크는 기존대로 |
| 82·83 | 신용위험 점수 보류 | `/api/ai/credit-risk/*` 410(화면 소비자 0, calculate-all 이 틀린 등급을 써 넣던 경로 차단) · 위험 판단 = 여신한도 |

## 결정 6차 (2026-09-26) — 결정 항목 마감

| # | 결정 | 반영 |
|---|---|---|
| 84 | 결재 후속 처리 실패를 알리고 기록 | `handlePostApproval` 이 실패 사유 반환 → 응답 `post_process_failed`+`warning` · 활동 로그 `APPROVAL_POST_FAILED` · 화면 경고 토스트(승인은 유지) |
| 87 | 이관 「기초잔액」 막기 | `/api/migration/opening-balances` 410(이월은 원장 조정 전표) · 이관 화면 버튼 제거 |
| 65 | /ship 은 「배포」가 명시될 때만 | 트리거에서 「이거 처리해줘」 제외, 작업 나열이면 커밋·push 까지 · Workflow 는 opt-in |
| 89 | auto-improve 자동 수정 = worktree · 마이그는 제안만 | SKILL.md 절차·허용 목록 수정 |
| 68 | 계정 동기화 스킬(파랑 디자인) | **사용자 작업** — claude.ai 스킬 설정에서 `mes-ui-consistency` 동기화본 삭제(저장소 밖) |

**결정 대기 0건.** 남은 것 = 확인 선행 3건(바로빌 WSDL #20·21·23) · 웹 밖 배포 축 4건(LogWatcher #42 · IA #43·81 · caps-worker #80) · 훅 cwd #75 · 보류 3건(지출결의·재주문·신용점수).

## 바로빌 WSDL 대조 (2026-09-26) — #20·#21·#23

WSDL(`ws.baroservice.com/{TI,CARD,BANKACCOUNT}.asmx?WSDL`)을 받아 대조했다.

| # | 확인 | 반영 |
|---|---|---|
| 23 | `GetTaxInvoiceState` 응답 = `TaxInvoiceState{BarobillState, NTSSendState, NTSSendKey, NTSSendResult, NTSSendDT, NTSResultDT}` — 코드는 팝빌식 `StateCode`·`NTSConfirmNum` 을 읽어 **상태가 영영 갱신되지 않았다** | 필드명 교정 · 상태 갱신은 `NTSSendState` 4=성공·5=실패·2/3=전송중, **그 외는 변경 안 함**(코드표 원문 미확보 — ⚠️첫 실발행 때 rawResponse 로 재확인) |
| 21 | 페이지형 응답(`Paged*`)은 `CurrentPage:int` — 오류는 여기에 음수 | `assertBarobillQueryOk` 가 `<CurrentPage>-N` 도 throw → 카드·계좌 조회 4함수 공통. 호출부는 날짜·카드 단위 catch 로 `syncErrors` 에 모아 보여 준다(빈 배열로 삼키지 않음) |
| 20 | 재시도 = 같은 invoice_number 를 mgtKey 로 재사용 | 재시도 전 `getStatus` — 바로빌에 이미 있으면 FAILED→SENT 복구, NTS_FAILED 는 수정발행 안내 400, 조회 실패 시 종전대로 DRAFT |
