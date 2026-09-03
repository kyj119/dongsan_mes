# 수정 보고 — 묶음 ⑤ 회계·세무·자금·급여 수치 (2026-09-03 전수 리뷰)

worktree `dongsan_mes-worktrees/fix-finance` · branch `session/fix-finance` · push/배포 안 함

## 결과 요약
- HIGH 10 / 10 수정 · MEDIUM 4 / 4 수정 · SKIP 0
- 커밋 6 (아래) · 신규 게이트 4 (`test:calc` 등록)

## 항목별

### HIGH
| # | 위치 | 변경 1줄 | 적용 규칙 |
|---|---|---|---|
| 1 | `src/routes/ledger/ar-ledger.ts:652` | `SUM(clients.balance)` → `deriveArSplit(c)` (거래처별 양수 잔액 합 + `receivableClients` 신설, `ar-helpers.ts:93`) | clients.balance 폐기 · AR = groups[BILLED] − payments − adjustments · 선수금 상쇄 금지(거래처별 선집계) |
| 2 | `src/routes/taxInvoices/helpers.ts:376-420` + `src/utils/taxInvoiceDiscount.ts`(신규) | 그룹 에누리 = `supply+tax−billed_amount` 복원 → 세율 비율로 공급가액·세액 몫 분배 → 합계 = AR 청구액. 상세 모드엔 음수 「에누리」 품목 라인 추가(품목합 = 헤더) | 부가세법 §29③(에누리는 과세표준 제외). 단건·묶음 발행 모두 `createSplitInvoices` 경유라 단일 경로 |
| 3 | `src/routes/taxInvoices/issue.ts:519,562,610` | 코드 3·4·6 은 헤더·품목 금액 **음수**, 1·5 는 양수 복사, 2 는 items 없으면 400 | 프론트가 code/date/notes 만 보냄(`taxInvoices.js:785`) · vatReports 가 MODIFY 를 합산하므로 부호가 매출·부가세를 결정 |
| 4 | `src/utils/expenseEstimator.ts:44-80` | `substr(…,1,7)`/`'YYYY-MM'` → `substr(…,1,6)`/`'YYYYMM'`(`ymToKey`·`keyToYm`). 외부 인터페이스(targetYm `YYYY-MM`)는 유지. 카드 실적에 순지출 규칙(#5) 동시 적용 | transaction_date = YYYYMMDD(`cardExpenses.ts:996`·`bank.ts:642`). 호출처는 `cashflowEngine.ts:153` 1곳(`from.substring(0,7)`) |
| 5 | `src/utils/cashflowEngine.ts:372` + `src/utils/cardSpend.ts`(신규) | 조회에 `is_offset=0` 필터 + `CASE CANCEL THEN −amount` 적용 | 취소 = 차감 · is_offset=1(상계쌍 양쪽+가승인) = 행 제외. 둘 다 있어야 맞음(미상계 취소는 is_offset=0) |
| 6 | `src/routes/payroll/year-end.ts:208` → `src/routes/payroll/year-end-calc.ts`(신규 순수함수) | 보험·의료·교육·기부를 `totalDeductions` 에서 제거(세액공제만 유지). 국민연금 12% 세액공제 제거(소득공제만). 연금저축은 소득공제→세액공제 12%/15%·한도 600만 (`pension_contribution_credit` 컬럼에 저장) | 소득세법 §59의4(특별세액공제, 2014 귀속분~) · §51의3(연금보험료 소득공제) · §59의3(연금계좌 세액공제) · §59의4⑨(표준세액공제 13만) |
| 7 | `src/routes/bank.ts:2655` | `parseFloat(item.Balance \|\| '0')` → 미제공/빈문자/NaN 은 `null` | #500 수동 경로(`:786-790`)와 동일 · `LATEST_BALANCE_SUBQUERY` 가 0 을 잔액으로 읽는 사고 차단 |
| 8 | `src/routes/fixedAssets.ts:253-258,279` | 상각기록 없으면 `accumulated = acquisition_cost − 개시장부가(current_book_value)` · 정률 `openingAcc = prevYearMap ?? accumulated` | 연초누계 앵커(memory design-fixed-asset-depreciation) — 이관 자산 첫 상각에서 장부가가 취득가로 되살아나던 경로 |
| 9 | `src/routes/payroll/core.ts:249,506,565,679` | 직원 SELECT 에 `entity_id` 추가 → `emp.entity_id \|\| getEntityId(c) \|\| 1` (save·batch 둘 다) | 전체모드(entityId 0) 일괄생성이 선명·청주 급여를 동산(1) 귀속시키던 경로. `insuranceReports.ts:116` 이 `p.entity_id` 로 거름 |
| 10 | `src/templates/laborContract.ts:400` | 「월 급여」 `contract.hourly_rate` → `totalPay`(`:76` 기계산값) | 월급제 = 총액이 곧 기본급(`:62-70`) |

### MEDIUM
| # | 위치 | 변경 1줄 | 적용 규칙 |
|---|---|---|---|
| 11a | `src/routes/ledger/ar-dunning.ts:346` | `runningBalance = 0` → `deriveClientBalance − 기간순증감`(전기이월)에서 시작 + 「전기이월」 행 추가 → 마지막 행 = 실제 잔액 | 이월 = 파생 전체잔액 − 기간 증감(기간 필터 정의와 무관하게 정합) |
| 11b | `src/routes/ledger/ar-dunning.ts:196` + `ar-helpers.ts queryClientUnpaidFifo`(신규) | `NOT IN (SELECT order_id FROM payments)`(항상 빈 집합) → 거래처 1곳 FIFO 미충당 청구건(un>0), 메일 금액 = 잔여액 | `queryFifoOverdue` 와 같은 충당 규칙(오래된 청구부터 payments+adjustments 소진) |
| 12 | `src/routes/financialReports.ts:89,241` · `accounting.ts:66,245` · `cashFlow.ts:560,712` | 전부 `utils/cardSpend`(`cardNetAmountSql`·`cardSpendFilterSql`) 사용. accounting `/timeline` 의 활성카드(is_active=1) 한정은 제거(`/summary` 와 동일 집합) | 순지출 정본 1곳. 해지 카드의 과거 사용도 그 기간 실지출 |
| 13 | `src/routes/insuranceReports.ts:72-95` | 저장은 암호문 그대로(평문 사본 금지) · `GET /:id` 에서 `decryptPII` → ADMIN 원본 / 그 외 마스킹(`900101-*******`) | `payroll/year-end.ts:75` 패턴. 프론트 `insuranceReports.js` 는 `rrn` 을 렌더하지 않아 화면 변화 없음(API 만 정상화). 기존 저장 행(암호문)도 조회 시 복호화됨 |
| 14 | `src/routes/ledger/accounts-payable.ts:1054` | 값 7 → 8: `type==='감액'` 행은 「감액」칸, 나머지는 「지급」칸 | 헤더 8열 = 값 8열 (수식 가드는 XSS 담당분) |

## 게이트
| 게이트 | 결과 |
|---|---|
| `npm run typecheck` | 통과 |
| `npm run build` | 통과 (`_worker.js` 6,745 kB) |
| `npm run audit:entity` | 67/67 누락 0 |
| `node scripts/sort-audit.cjs` | P1 0 |
| `npm run audit:subquery` | exit 0 (P1 은 기존 파일·미변경, 신규 코드 미검출) |
| `npm run test:calc` (신규 4종 포함) | 전부 통과 — expense-month 10 · year-end 25 · card-spend 10 · tax-discount 14 |
| `npm run test:credit` | 11건 통과 |
| smoke `SMOKE_URL=http://127.0.0.1:3105` | **114 / 114 PASS** |
| 변경 라우트 수동 200 확인 | `/api/ledger/closing-summary` · `/api/accounting/summary` · `/api/accounting/timeline` · `/api/cash-flow/projection` · `/api/cash-flow/calendar` · `/api/cash-flow/schedule{,/forecast,/calendar,/monthly}`(cashflowEngine) · `/api/financial/pnl{,/monthly}` · `/api/reports/receivables-analysis` — 전부 200 (로컬 D1 은 거의 비어 값은 0, SQL 오류 없음) |

신규 selftest (in-memory SQLite, `scripts/lib/compile-ts.cjs` 스타일)
- `scripts/expense-month-key-selftest.cjs` (`test:expense-month`) — YYYYMMDD 월키·순지출·개인통장 제외·entity 바인딩
- `scripts/year-end-deduction-selftest.cjs` (`test:year-end`) — 손계산 기준 케이스 + 특별항목 유무에 과세표준 불변 + 국민연금/연금저축 규칙
- `scripts/card-spend-selftest.cjs` (`test:card-spend`) — 정본 20,000 vs 사고 재현값(50,000 / 220,000 / 350,000)
- `scripts/tax-discount-selftest.cjs` (`test:tax-discount`) — 리뷰 시나리오(100만/10만/에누리 10만 → 합계 100만) + 클램프

## 커밋
| hash | 내용 |
|---|---|
| `e6e048bc` | fix(ar): closing-summary 파생 · 거래명세 전기이월 · 독촉 FIFO 미결제 |
| `b0429833` | fix(tax-invoice): 에누리 반영 · 수정계산서 코드별 부호 · tax-discount selftest |
| `7324aa39` | fix(card): 순지출 정본 `utils/cardSpend` + 6곳 적용 · expenseEstimator 월키 · selftest 2종 |
| `acce58e3` | fix(payroll): 연말정산 이중공제 제거 · `year-end-calc.ts` 분리 · selftest |
| `689d541e` | fix(finance): auto-sync 잔액 null · 상각 개시장부가 앵커 · 급여 entity · 근로계약 월급 |
| `53c70442` | fix(reports): 신고서 주민번호 복호화 · AP CSV 8열 · package.json 등록 |

## 용준님 결정 필요
1. **에누리와 부가세 과세표준** — 주문은 `vat = 총액×10%` 를 에누리 **전**에 계산하고 에누리는 최종액에서만 뺀다(`orders/create.ts:154`). 계산서는 부가세법대로 에누리를 공급가액·세액에 나눠 뺐으므로(합계 = AR), **주문/청구그룹의 세액(10만)과 계산서 세액(90,909)이 다르다.** 주문 모델도 에누리 후 VAT 로 바꿀지(그러면 그룹·계산서·부가세신고 세액이 전부 일치) 결정 필요. 지금 상태는 「AR 합계 정합 + 계산서 세액 법정」이고, 「주문 VAT 표시」만 종전대로다.
2. **수정계산서 코드 1·5 의 당초분(−)** — 기재사항 착오정정(1)·내국신용장(5)은 원래 「당초분 −」과 「수정분 +」 2장이다. 프론트가 금액을 안 보내므로 지금은 수정분(+) 1장만 만든다(종전과 동일). 당초분 자동 생성이 필요하면 별도 작업.
3. **연금저축 소득공제→세액공제 전환** — 요청 범위(4항목)보다 넓다. 종전 `pension_saving` 을 소득공제(한도 400만, 2013년 이전 규정)로 넣던 것을 세액공제(12%/15%, 한도 600만)로 바꿨고 `pension_contribution_credit` 컬럼이 이 값을 받는다(종전엔 국민연금×12% 오용). 되돌리려면 `year-end-calc.ts` 의 `pensionSaving`·`pensionContributionCredit` 두 줄.
4. **4대보험 신고서 주민번호 노출 범위** — ADMIN 원본 / 그 외 마스킹으로 맞췄다(연말정산과 동일). 신고 업무를 MANAGER 가 한다면 원본 노출 역할을 넓혀야 한다.
5. **accounting `/timeline` 활성카드 한정 제거** — `/summary` KPI 와 같은 집합으로 통일했다. 해지 카드를 타임라인에서 숨기는 게 의도였다면 되돌릴 것(`accounting.ts:245` 1줄).

## 참고
- `src/routes/ledger/ar-helpers.ts deriveArSplit` 반환에 `receivableClients` 필드 추가(기존 호출처 영향 없음).
- 기존 `insurance_report_details.rrn` 행은 저장 형식이 그대로라 마이그레이션 불필요.
- wrangler 3105 는 작업 후 종료.
