# Area 4 데이터 정합성 점검 결과 (2026-09-02)

## Area 4 결과 (대상: prod remote `webapp-production`, SELECT/PRAGMA 전용, wrangler 호출 25회)

기준 규모: orders 10,074(전량 SHIPPED) · order_items 23,162 · purchase_orders 922 · purchase_order_items 2,923 · payments 3,816 · bank_transactions 6,608 · inventory 384 · inventory_transactions 104 · print_events 9,729 · **cards 0 · card_items 0 · shipments 0** · clients 2,880(비활성 7) · employees 111(재직 47) · payroll 57 · entities 1·2·3·4·99.

### 조치 필요 (심각도순)

- **하나은행 마이너스통장 3중 등록 잔재 — 비활성 계좌 #8·#9 에 거래 3건 잔존, 대출결산이자 1,938,893 원이 계좌 3곳(#7·#8·#9)에 각각 APPLIED(분류 66)** — MEDIUM — 3건 — bank_transactions 2263(#8), 2285·2286(#9); 정본은 #7 의 2424·2425 — bank_accounts 7·8·9 는 모두 `602***904`(14자리 동일) 이고 8·9 는 is_active=0. 잔액 축은 `ba.is_active=1` 필터(`src/utils/bankBalance.ts:30`·`src/routes/financialReports.ts:357`·`src/routes/bank.ts:94`)로 제외되지만, 계정분류(matched_category_id) 기준 비용 집계가 bank_accounts.is_active 를 거르지 않으면 이자비용 **+3,877,786** 과다(2263+2286) · 2285 는 IGNORED 라 무영향. 원인 추정: 2026-07-13 01:20~01:39 같은 계좌를 3회 등록(계좌번호 정규화 전례 = memory `barobill-charge-balance` "#7 silent skip") 후 #8·#9 를 비활성화만 하고 거래를 지우지 않음. 부수: #1 도 #2(`353***704`)와 동일 계좌 중복 등록이나 거래 0건이라 무해.
- **발주 라인 83건(발주 14건)이 line_status=RECEIVED 인데 received_quantity=0·accepted 0·received_at NULL** — LOW — 83건 — purchase_order_items 3912·3911·3910 (E1-PO-962-20260513 · E1-PO-SK-260730 등, 2026-05-13~07-30, 전부 E1, 81건 item 연결·price_status CONFIRMED) — 전부 notes `[0824 원장분해]` = 2026-08-24 매입 껍데기 분해 스크립트 산출물. 입고 이력(inventory_receipt_items) 없음 → 발주 상세 입고율 0%·재입고 시 `po-receive.ts:98 remaining=quantity−received` 가 전량 남은 것으로 계산. 계산 경로 영향은 없음을 확인: 부족자재·주간발주는 `po.status IN (DRAFT,CONFIRMED,PARTIAL_RECEIVED)` 로 RECEIVED 제외(`src/utils/materialShortageCheck.ts:95`·`src/routes/weeklyPurchase.ts:63`), 매입확정 대기는 price_status=PENDING 조건(`src/routes/purchaseInvoices.ts:59`), 소모량 API 는 quantity 사용.
- **발주 라인 5건 received_quantity·accepted_quantity 에 금액값 대입** — LOW — 5건 — 3093·3095(item 1584 ACC-041-GA-PL, received 6,498,500·3,498,500), 3108·3111·3113(item NULL, 600,000·180,000·180,000) — 이관 시 적요 「1 X 6,498,500」 파싱이 금액을 입고수량에 넣음(E1-PO-RCH-0107·E1-PO-JHT-*). inventory_receipt_items 0건·inventory 행 없음이라 재고 무영향, 입고율 표시만 왜곡. 같은 발주의 3859 는 quantity −1(장비 원장 역분개)로 정상.
- **print_file_map 15건 전부 존재하지 않는 주문번호·카드 참조(dangling)** — LOW — 15건(=전량) — id 15(E1-20260813-001)·14·13(E1-20260810-001)·1·2(card_id 99·100 도 부재) — 8월 테스트/삭제 주문(adoption diagnosis: cards seq 601·8월 주문 510건 삭제) 뒤 남은 비FK 참조 = #454 클래스(`print_file_map.order_item_id` 기등재). 영향: 같은 주문번호가 재생성되면 UNIQUE(order_number,file_seq) 충돌·`printEvents resolveCard` 가 옛 행에 매칭. 자동수정 금지(파괴적 삭제 = issue-only).
- **중복 인덱스 5쌍 + 부분중복 2쌍** — LOW — 7쌍 — `idx_cards_entity_number`≡`idx_cards_entity_card_number`(UNIQUE) · `idx_orders_entity_number`≡`idx_orders_entity_order_number`(UNIQUE) · `idx_po_items_po_id`≡`idx_poi_po` · `idx_tax_invoices_order_id`≡`idx_ti_order` · `idx_auto_deductions_print_event`≡`..._unique` · bank_transactions `idx_bank_tx_matched_payment`/`idx_bt_matched_payment_uniq`(partial) · `idx_bt_matched_pp`/`idx_bt_matched_pp_uniq`(partial) — 쓰기 비용 증가 + 통계 부재 시 플래너 선택지 증가(memory `feedback-d1-planner-no-stats`). 자동수정 가능: 비UNIQUE 쪽 DROP INDEX 마이그(UNIQUE 쪽이 같은 컬럼 순서를 커버).
- **선명(E2) 이관 주문 91건 delivery_date = order_date − 1일** — LOW — 91건 — orders 1072(E2-20260626-008)·1063·1056, 2026-01-02~06-26, E2 전용(E1·E3 0건) — 납기가 주문일보다 앞설 수 없으므로 이관 시 납기일 KST→UTC 하루 밀림 추정. 영향: 리드타임·납기 표시.
- **기초잔액 발주 3건 total_amount=0·vat 0 인데 final_amount>0** — LOW — 3건 — purchase_orders 521(313,500)·522(23,701)·575(9,629,400), E1-PO-OPEN-* — AP 잔액은 final_amount 기준(`src/utils/supplierPayable.ts:24`)이라 무영향, 발주 목록 합계(total) 축만 불일치.
- **주문 10185 `ICM-AR-E2-RECON` status=SHIPPED 인데 shipped_at·delivery_date NULL·order_status_history 0건** — LOW — 1건 — 2026-08-10 관계사 미러 매출채권 대사조정용 수기 생성(entity 2, 382,831). status↔타임스탬프 가정 위반 유일 건(이관분 8,653건은 0520 백필로 해소됨).
- **payments 음수 1건** — LOW — 1건 — payments 2731(client 661, 2026-05-29, −3,740,000, 「동산 이카운트 이관 수금 · 대한민국전몰군…」) — 이관 반제로 추정. 수금 목록 합계·건당 평균에 음수 포함.
- **활성 사용자 2명이 employees 미연결** — LOW — 2건 — users 4·13(DESIGNER, entity 1) — 급여명세 셀프교부·휴가 셀프서비스 대상에서 빠짐. 재직 47명 중 35명이 user 미보유는 정상(현장직).

### 기지 사항 (재보고 아님)

- **cards 0 · card_items 0 · shipments 0** → print_events 9,729건(최근 30일 7,389건 = OK 6,640·CANCEL 690·ERROR 59) 전량 card_id·card_number·order_number NULL, 30일 내 카드 매칭 0건 — `docs/analysis/2026-08-31-adoption-diagnosis.md` L2261~2290(이관 주문 API 우회 → 카드 미생성 → 매칭률 0%). 자동차감 0건(inventory_auto_deductions·pp_material_deductions 0행)도 동일 원인.
- **재고 음수 28행(전부 entity 2 선명, 합 −3,675)** — inventory 100(item 207 −983)·81(174 −520)·216(288 −375) 등, 15행은 2026-08-11 12:23:25(§08-11 이카운트 재고수불부 e2 적재), 13행은 08-19 14:40:38 배치 — 확인한 6/6 이 `scripts/stock-ledger-baseline.json` 에 등재(207 −983·174 −520·288 −375·298 −300·181 −202; 223 은 기준선 −356 vs 현재 −240 이라 `audit:stock-ledger` 가 잡을 대상). inventory_transactions 104행(STOCK_COUNT 103·ADJUSTMENT 1)뿐이라 잔고↔원장 격차는 기준선(59,248/197품목) 사안.
- **대손 4곳 is_active=0 미수 268,500,615** — clients 3852(178,505,080)·3853(54,951,410)·717(21,224,250)·3854(13,819,875), E1-OPEN 전표 BILLED·수금 0 — memory `design-ar-overdue-fifo` "의도된 비노출·상각 미실행". 3856·3857 은 adjustments 로 0 처리 완료, 3847 은 완납. 비활성 거래처 7곳 = 이 7곳이 전부.
- **이관 주문의 타임스탬프 공백** — 전 주문 confirmed_at NULL, 9,073건 delivery_date NULL, 발주 894건 RECEIVED 전량 confirmed_at NULL — memory `feedback-imported-orders-status-timestamp`(이관은 최종 상태만).
- **음수 라인은 설계** — order_items amount<0 141행(2025분 28행 −269.5M = E1-OPEN 기초잔액 마이너스, 2026분 113행 = E2 반품)·quantity≤0 92행 · purchase_order_items quantity≤0 28행(반품 상계·장비 원장 역분개, notes 명시) · purchase_invoices total<0 4건(SMI-0009 등, 반품 계산서).
- **품목 동명 51그룹(예: 조명용 후렉스 ×13, 포맥스포마트(국산) ×24)** → specification 포함 시 중복 0 = 폭/규격 변종(품목 신모델).
- **거래처 동명 7그룹(굿디자인광고·라인애드 등)** → 사업자번호 전부 상이(중복 BRN 0) = 별개 사업자.
- **통장 거래 동일(계좌·일자·금액·적요) 31그룹 218행** → balance_after 가 그룹마다 전부 상이(삼성화재 20,000×24 = 인별 보험료 등) = 실거래. content_key 중복 0. codef id 중복 2건은 위 #7/#8/#9 사안과 동일 건.
- **수금 중복 4그룹 5행** → 이관 수금(client 1810 부대별 19,800 ×3 등, notes 상이)·1668 138,600×2 는 통장에도 2건(잔액 상이) = 실거래.
- **E2E entity 99** — orders·payments·purchase_orders·inventory·print_events·bank·quotations·employees 전부 0건, E2E 거래처·품목 0.

### 이상 없음 (1줄 나열)
`pragma_foreign_key_check` 위반 0(선언 FK 전수) · 비FK 참조 dangling 0(cards·card_items·order_items·shipments·shipment_items·merged_into_id·consolidate_with·quotation_id·adjustments·tax_invoices·payments.tax_invoice_id·bank matched_client/payment/pp·loan_payments·returns·purchase_invoices·journal_lines·inventory·itx·auto_deductions) · entity_id NULL/0 = 0(24테이블) · 미등록 entity 0 · 부모↔자식 entity 불일치 0(shipments·tax_invoices·bank↔account·purchase_payments↔po·adjustments↔order·payroll↔employee) · 코드/번호 중복 0(client_code·order_number·item_code·po_number·quotation·tax_invoice·employee_code·card·shipment) · inventory (item,entity,zone) 중복 0(같은 item·entity 2행 4건은 zone NULL/3 수량 0) · orders total↔라인합 불일치 0·final 산식 0·billed>final 0·라인 없는 주문 0 · PO total↔라인합 0 · quotations.converted_count 0 · payroll net=total−deduction 0·직원/사용자/근태/급여 고아 0·재직↔퇴사일 모순 0 · print_events COMPLETED 무시각 0·card_number 불일치 0 · 카드↔주문 상태 불일치 0(카드 없음) · 마이너스통장 #7 마지막 거래 08-11 은 거래 간격(22~25일) 범위 내라 수집 정지로 판정 불가.

### 미실행 (이유)
- 코드↔스키마 정적 스캔(INSERT 컬럼 diff·CHECK literal·users(id) FK 바인딩·`date('now')` 업무일자) — 이번 회차는 prod DB 실측 우선, 호출 예산(25회) 소진.
- `npm run audit:stock-ledger`·`test:symmetry` 등 로컬 게이트 — 서버 기동 필요(READ-ONLY 제약).
- inventory_counts·auto_process_jobs·leave_* 등 부속 테이블 정합 — 범위 외.
