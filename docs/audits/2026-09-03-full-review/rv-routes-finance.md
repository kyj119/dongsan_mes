# 슬라이스 B 결과 — 검사 35파일 / 약 17,700줄

검사 범위: `src/routes/ledger/**`(7) · `bank.ts` · `accounting.ts` · `cashFlow.ts` · `cashSchedule.ts` · `cardExpenses.ts` · `taxInvoices/**`(4) · `vatReports.ts` · `financialReports.ts` · `insuranceReports.ts` · `forecast.ts` · `fixedAssets.ts` · `payroll/**`(4) · `leaves.ts` · `attendance.ts`(부분) · `caps.ts`(부분) · `reports.ts`(부분) · 공유 유틸(`supplierPayable` · `kstDate` · `intercompany` · `entityFilter` · `bankBalance` · `provisionMatrix` · `paymentSchedule` · `cashflowEngine` · `expenseEstimator` · `lib/payments` · `orders/helpers` 부분)

## 조치 필요 (심각도순, 15건)

- `src/routes/ledger/ar-ledger.ts:652` — HIGH — `/closing-summary` 의 총 미수금이 폐기된 `clients.balance` 캐시(`SUM(balance) WHERE balance > 0`)를 읽는다. prod 값은 전량 0(같은 파일 :184·`reports.ts:594`·`bank.ts:2893` 이 "prod 전체 0" 으로 명시). 실패 시나리오: 월말 마감 화면을 열면 총 미수금 "0원 / 0개 거래처" 로 표시된다(실제 8.8억). consumer 확인: `src/scripts/ledger.js:2160-2161`.

- `src/routes/taxInvoices/helpers.ts:399` — HIGH — `createSplitInvoices` 가 `totalAmount = supplyAmount + taxAmount` 로 계산해 **주문 에누리(`orders.discount_amount`)를 빼지 않는다**. 청구그룹은 `billed_amount = supply + tax − discount`(`orders/helpers.ts:122`)라 AR 과 계산서가 어긋난다. 실패 시나리오: 공급가 100만·VAT 10만·할인 10만 주문 → AR 100만인데 세금계산서는 110만으로 국세청 발행. caller 확인: `taxInvoices/issue.ts:370`·`:422`.

- `src/routes/taxInvoices/issue.ts:562` — HIGH — `POST /:id/modify` 가 `body.items` 가 없으면 원본의 `supply_amount`/`tax_amount`/`total_amount` 를 **양수 그대로 복사**한다. 프론트는 `modify_code`·`issue_date`·`notes` 만 보낸다(`src/scripts/taxInvoices.js:785-789`). 실패 시나리오: 환입(3)·계약해제(4)·이중발급(6) 수정계산서가 +금액으로 `issueTaxInvoice`(`helpers.ts:178-184`)를 통해 발행돼 매출·부가세가 두 배로 잡힌다. consumer 확인: `vatReports.ts:31-36`(MODIFY 포함 합산).

- `src/utils/expenseEstimator.ts:50,53,65,71` — HIGH — `substr(transaction_date,1,7)` 로 `'YYYY-MM'` 을 만들려 하지만 `card_transactions`·`bank_transactions` 의 `transaction_date` 는 **YYYYMMDD**(`cardExpenses.ts:996`·`bank.ts:642`)라 결과가 `'2026083'` 이다. 실패 시나리오: `BETWEEN '2026-08' AND '2026-09'` 가 문자열 비교상 절대 참이 안 돼 실적이 0건 → `estimate()` 가 항상 null → ESTIMATED 고정비가 무음으로 등록금액 폴백(추정 기능 전체 사망). caller 확인: `cashflowEngine.ts:153,169`.

- `src/utils/cashflowEngine.ts:395,419` — HIGH — CARD_EXPECTED 합산이 `approval_type='CANCEL'` 과 `is_offset` 을 무시하고 `t.a` 를 전부 +로 더한다(`card_transactions.ts:374-376` 조회에도 필터 없음). 실패 시나리오: 100만 승인 + 100만 취소가 같은 사이클에 있으면 카드대금 예정액이 0이 아니라 200만으로 잡혀 `/cash-schedule` 예측·달력·월별이 모두 과대. 대조: `cardExpenses.ts:758` 은 `is_offset=0` + `ELSE -amount`.

- `src/routes/payroll/year-end.ts:236-258` — HIGH — 같은 입력액을 **소득공제와 세액공제 양쪽에 이중 적용**한다. `insurance_deduction`·`medical_deduction`·`education_deduction`·`donation_deduction` 이 `totalDeductions`(:236-238, 과세표준 차감)에 들어가고 동시에 :248-251 에서 12~15% 세액공제 기준이 된다. `sum_national_pension` 도 소득공제(:229) + 12% 세액공제(:252) 양쪽. 실패 시나리오: 보험료 100만 입력 → 과세표준 100만 감소 + 세액 12만 공제 → 결정세액 과소·`refund_total` 과대.

- `src/routes/bank.ts:2660` — HIGH — `/auto-sync` 가 `parseFloat(item.Balance || '0')` 로 **잔액 미제공을 0으로 저장**한다. 같은 파일 `/sync-barobill:786-790` 은 #500 으로 null 구분이 적용돼 있는데 자동 경로만 안 고쳐졌다. 실패 시나리오: 바로빌이 Balance 를 안 주는 거래 1건이 그 계좌의 최신 거래가 되면 `LATEST_BALANCE_SUBQUERY` 가 0을 잔액으로 읽어 자금현황·재무 스냅샷 현금이 그 계좌 잔액만큼 사라진다. consumer 확인: `utils/bankBalance.ts:14-18`, `bank.ts:90`, `financialReports.ts:355`.

- `src/routes/fixedAssets.ts:256 vs :307` — HIGH — 이관 자산(`POST /` 에서 `current_book_value` 로 전기말 장부가를 넣는 경로, :92-93)은 `depreciation_records` 앵커가 없어 `accumulated = 0`(:254)인데 `newBookValue = acquisition_cost − newAccumulated`(:307)로 다시 쓴다. 실패 시나리오: 취득가 1억·이관 장부가 3천만 자산의 첫 `/depreciate` → 장부가가 9,900만으로 **되살아나고**, 정률법 기준액도 `openingBase = acquisition_cost`(:279, prevYearMap 미스)라 상각액이 과대.

- `src/routes/payroll/core.ts:679`(+`:506`) — HIGH — `/batch` 가 전체 모드(entityId=0)에서 `ef.clause` 가 빈 문자열이라 **전 법인 직원**을 돌면서(:538-543) `payroll.entity_id` 를 `getEntityId(c) || 1` 로 기록한다. 실패 시나리오: 전체 모드에서 일괄생성 1회 → 선명(2)·청주(3) 직원 급여가 전부 동산(1) 귀속 → `insuranceReports.ts:116`(`p.entity_id = ?`)이 그 법인 4대보험 신고서를 0건으로 만든다. 같은 함정: `ledger/ar-payments.ts:52`(입금), `leaves.ts:449`(`getEntityId(c)` 그대로 → `entity_id = 0`).

- `src/routes/ledger/ar-dunning.ts:346,408` — MEDIUM — `/send-email` 거래명세의 "현재 잔액" 이 `runningBalance = 0` 에서 기간(기본 최근 180일) 증감만 누적한다. 전기이월이 없다. 기간 필터도 `date(created_at)`(:302)라 화면 원장(`arOrderDateExpr`, `ar-ledger.ts:62`)과 대상 행이 다르다. 실패 시나리오: 거래처에게 실제 잔액이 아닌 기간 순증감이 "현재 잔액" 으로 발송된다. 대조: `ar-ledger.ts:172` 는 `opening_balance` 를 별도 계산.

- `src/routes/ledger/ar-dunning.ts:200-202` — MEDIUM — 독촉메일 미결제 주문 필터가 `id NOT IN (SELECT order_id FROM payments WHERE order_id IS NOT NULL)` 인데 `payments.order_id` 는 어떤 INSERT 경로에서도 채워지지 않는다(`lib/payments.ts:63-71` · `migration.ts:520` 둘 다 컬럼 미포함). 실패 시나리오: 서브쿼리가 항상 빈 집합 → 완납된 옛 BILLED 주문 10건이 "미결제" 로 고객 메일에 실린다.

- `src/routes/financialReports.ts:89,241` — MEDIUM — 손익계산서 카드 비용이 `is_offset=0` 만 걸고 **`approval_type='CANCEL'` 을 차감하지 않는다**. 상계 실패한 취소(±30일 밖·가맹점명 상이·부분취소)는 `is_offset=0` 으로 남아 +금액으로 합산된다. 실패 시나리오: 미상계 취소 100만 → 판관비가 200만 과대(취소분이 빠지지 않고 더해짐). 대조: `cardExpenses.ts:895,904` 는 `approval_type != 'CANCEL'` 명시.

- `src/routes/accounting.ts:66-70` vs `:245-251` / `src/routes/cashFlow.ts:562` — MEDIUM — 같은 카드 지출을 세 곳이 다르게 센다. `/summary` 는 `is_offset`·`corporate_cards.is_active` 무필터, `/timeline` 은 활성카드만, `cashFlow /projection` 은 취소를 `ELSE 0`(차감 안 함), `cashFlow /calendar:714` 는 `ELSE -amount`. 실패 시나리오: 회계허브 상단 KPI 와 타임라인 탭의 "지출(카드)" 가 가승인·비활성카드 금액만큼 다른 값으로 동시에 표시된다.

- `src/routes/insuranceReports.ts:187` (+`:73` 반환) — MEDIUM — `employees.resident_number` 는 `aes:` 암호문(`hr.ts:423,573` 에서 `encryptPII`)인데 그대로 `insurance_report_details.rrn` 에 복사하고, `GET /:id` 도 복호화 없이 반환한다. 실패 시나리오: 4대보험 신고서 상세의 주민번호 열에 `aes:...` 문자열이 그대로 표시돼 신고서를 쓸 수 없고, 암호문이 관리 계약 없는 두 번째 테이블로 복제된다. 대조: `payroll/year-end.ts:75` 는 `decryptPII` + 마스킹.

- `src/routes/ledger/accounts-payable.ts:1054-1063` — MEDIUM — 매입원장 CSV 헤더가 8열(`…, 감액, 잔액, 비고`)인데 데이터 행은 7값이라 **잔액이 감액 칸, 비고가 잔액 칸**으로 밀린다. 같은 파일 :981-982 는 기간을 `date(created_at)` 로 걸어 화면(:92-97, `order_date`)과 다른 행을 뽑고, :1047 은 전기이월 없이 0부터 누적한다(`ar-ledger.ts:369` 도 동일). 대조: `ar-ledger.ts:375-376` 은 헤더 7 / 값 7 로 정합.

## 확인했지만 이상 없음 (1줄 나열)

`credit-helpers.ts` 여신 SQL 의 `?` 순서(2026-08-25 사고 지점, 바깥 상수 전부 인라인·params 순서 = SQL 등장순) · `utils/supplierPayable` AP 파생 3중 바인드 · `deriveArSplit`/`queryFifoOverdue` FIFO·부호분리 CTE · `intercompany` 6방향 대사 · `leaves` 소멸 sweep 의 자기교정(`expired += remaining` + `>0` 필터) · `leaves` 차감↔복원 대칭(`buildDeductStmts`↔`buildRestoreStmts`) · `bank` apply/unapply 의 link-first·원자적 클레임·UNIQUE 409 변환 · `taxInvoices/paymentMatch` 바인드 순서 · `payroll` 포괄임금 ÷225.5 분해와 일할(`calcInclusivePay`/`calcProratedInclusive`) · `caps.ts` 근태 계산(점심 차감·연장=퇴근−18:00) · `reports.ts` 미수 aging(SSOT `agingDaysFromOldest` 사용) · `financialReports` CAT_ROLE NOT_EXPENSE 제외 · `fixedAssets` 정률법 만기연도 균등배분 · `cashSchedule` 고정비 온더플라이 이중계상 가드.

## 기각한 후보 (5줄)

1. `bank.ts:2235-2248` `/unmatch` 가 `matched_payment_id` 만 안 지움 — `matched_payment_id` 는 APPLIED 에서만 세팅되고 이 라우트는 APPLIED 를 400 으로 막아 도달 불가.
2. `ledger/accounts-payable.ts:859` 정합성 검사의 `status IN ('CONFIRMED','RECEIVED','PARTIAL_RECEIVED')` vs 파생의 `NOT IN ('DRAFT','CANCELLED')` — 0032 CHECK 제약상 두 집합이 동치.
3. `payroll/shared.ts:329` 근로소득세액공제 한도식의 `× (74/66)` 가 법정식과 다름 — 간이세액표에 행이 없을 때만 쓰는 폴백이고 차액이 월 수백 원 수준.
4. `leaves.ts:199` 복원이 역FIFO(ANNUAL→MONTHLY)라 버킷 간 이동 가능 — 각 버킷 `used` 로 상한이 걸려 총 잔여는 보존됨.
5. `cashFlow.ts:377-378` `generate-schedule` 의 `setMonth` 오버플로(1/31 → 3/3) — 만기 미확인이면 400 으로 차단되고 운영상 이 라우트 사용을 금지한 항목(memory `design-loan-liability-model`).
