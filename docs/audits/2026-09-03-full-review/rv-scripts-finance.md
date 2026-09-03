# 슬라이스 F 결과 — 검사 30파일 / 약 21,600줄

대상: `src/scripts/` 회계·자금·세무·급여·HR·보고서 계열 29개 + `src/templates/*.ts` 3개.
동시 로드 페이지(`/tax-invoices`, `/reports`, `/payroll`, `/hr`, `/cash-schedule`)는 top-level 식별자 충돌을 스크립트로 전수 대조했고, 각 fetch/axios 호출은 `src/routes/**` 원본을 열어 요청 필드·응답 필드명을 1:1 확인했다.

## 조치 필요 (심각도순, 12건)

- `src/scripts/accounting.js:852` — **HIGH** — `/api/clients` 응답을 배열로 취급(`res.data.data`)하는데 서버는 `{clients, pagination}` 객체를 준다 — `list.length`가 `undefined`라 법인간거래 등록/수정 모달의 거래처 검색이 **입력과 무관하게 항상 "검색 결과 없음"**. 거래처를 붙인 대납·자금대여 기록을 만들 수 없다. counterpart checked: `src/routes/clients.ts:182-193`(단일 return, `fields=picker`도 동일 형태) / 같은 파일 정상 사례 `src/scripts/cashReceipts.js:182`·`src/scripts/taxInvoices.js:1438`
- `src/scripts/ledger.js:694` — **HIGH** — 감액 등록 모달의 주문 드롭다운이 `/api/orders?status=SHIPPED&limit=100&clientId=<선택거래처>`를 부르는데 서버 목록 필터에 `clientId`/`client_id` 항목 자체가 없어 **무시된다** → 선택한 거래처와 무관한 전체 SHIPPED 주문 100건이 뜬다. 서버도 `order_id`가 `client_id` 소속인지 검증하지 않아 **다른 거래처 주문에 감액이 붙는다**(미수금 파생 왜곡). counterpart checked: `src/routes/orders/listFilter.ts:97-189`(clientId 미처리) · `src/routes/ledger/ar-payments.ts:324-335`(`body.order_id`를 그대로 INSERT)
- `src/templates/laborContract.ts:400` — **HIGH** — 월급제(`isMonthly`) 근로계약서의 「월 급여」에 `contract.hourly_rate`(통상시급)를 출력한다. 같은 파일이 이미 `totalWage`/`basePay`로 올바른 월 총액을 계산해 두었는데(:62, :68) 그 값을 안 쓴다. 계약서 원본에 시급(또는 0원)이 월급으로 인쇄된다. counterpart checked: `src/templates/laborContract.ts:61-68` · 호출부 `src/routes/hr.ts:1466`(`hourly_rate: row.hourly_rate || 0`) · 저장부 `src/scripts/laborContracts.js:243`(월 총액=`monthly_salary`)
- `src/scripts/taxInvoices.js:1513` — **MEDIUM** — 직접발행 모달의 부가세 미리보기가 `round(Σ공급가 × 0.1)`인데 서버는 **품목별** `round(공급가×0.1)`을 합산한다 — 품목이 여러 줄이면 화면 합계와 실제 발행 세액·합계가 원 단위로 어긋난다(발행 후에야 드러남). counterpart checked: `src/routes/taxInvoices/issue.ts:96-117`(`normItems` 별 tax 산출 후 reduce)
- `src/scripts/cashSchedule.js:327` — **MEDIUM** — 자금 예정 등록 모달의 기본 등록일을 `new Date().toISOString().slice(0,10)`로 만든다. 브라우저가 KST라 **00:00~09:00 사이에는 전날 날짜가 채워진다**. 같은 파일의 다른 업무일(`:293` 완료처리)은 로컬 기준 `fmtDate()`를 쓰고 있어 규약도 어긋난다. counterpart checked: `src/scripts/layout/shell.js:147`(`window.kstToday`), 같은 결함 `src/scripts/cashSchedule.js:569`(init 시 동일 필드)
- `src/scripts/cashSchedule.js:83` — **MEDIUM** — 연체 KPI가 `parseDate(dateStr) < new Date()`로 판정한다. `parseDate`는 그 날 00:00을 주므로 **오늘 만기인 미완료 항목이 전부 연체로 집계**된다(오전에 열면 오늘 지급건이 이미 빨간 숫자). 달력 셀의 `isPast`(:113)도 같은 식. counterpart checked: `src/pages/cashSchedule.ts:123`(라벨 「연체」) · 서버 판정은 `src/routes/cashSchedule.ts:139-183`과 무관한 클라 전용 계산
- `src/scripts/vatReports.js:209` — **MEDIUM** — 부가세 신고자료 CSV의 매출 명세 행을 이스케이프 없이 `[...].join(',')` 한다. 거래처명(`buyer_name`)에 콤마가 있으면 그 행부터 **열이 밀려 공급가액·세액이 다른 칸에 들어간다**. 같은 파일이 다운로드는 SSOT(`window.dsDownloadCsv`, :224)를 쓰면서 셀 조립만 자체 처리. 매입 행 `:217`도 동일. counterpart checked: `src/utils/csv.ts:96-104`(`window.dsCsvCell` SSOT)
- `src/scripts/taxInvoices.js:10` — **MEDIUM** — `/tax-invoices` 한 페이지에 concat 되는 `taxInvoices.js`와 `cashReceipts.js:1`이 **같은 전역 `var currentPage`를 공유**한다. 세금계산서 목록에서 3페이지를 본 뒤 현금영수증 탭에서 취소·삭제를 하면 `loadReceipts(currentPage)`가 3페이지를 다시 부른다(그 반대도 동일). 파일 상단 주석(:7)이 "의도적 미개명"으로 남겨둔 항목이나 실제 오작동 경로가 있다. counterpart checked: `src/pages/taxInvoices.ts:1013`(concat 순서) · `src/scripts/cashReceipts.js:53,344,359,372,400`
- `src/scripts/reports.js:83` — **MEDIUM** — 월별 요약이 `monthly`(주문 있는 달)만 순회하며 `payMap`에서 입금을 끌어온다. 주문이 0건인 달의 **입금이 통째로 빠져** `rptTotalPayments`·`rptCollectionRate`가 과소 표시된다. 두 쿼리가 각각 자기 기준으로 GROUP BY 하므로 달 집합이 다를 수 있다. counterpart checked: `src/routes/reports.ts:355-381`(monthly/payments 별도 집계, 달 union 없음)
- `src/scripts/vatReports.js:222` — **MEDIUM** — CSV 마지막 「납부세액」 행이 콤마 5개(`'납부세액,,,,,'`)라 값이 7번째(합계)가 아니라 **6번째(세액) 칸**에 들어간다. 바로 위 매출/매입 합계 행(:212, :220)은 콤마 4개로 올바르게 7번째에 놓여 있어 같은 표 안에서 기준이 다르다. counterpart checked: 헤더 `src/scripts/vatReports.js:207`(7열)
- `src/scripts/reports.js:61` — **MEDIUM** — 병행 기간 안내의 조회 시작일을 `d.toISOString().slice(0,10)`로 만든다(`d`=N개월 전 1일, 로컬). **09:00 KST 이전에 열면 전월 말일**로 밀려 안내 문구의 기준일이 틀린다. 같은 파일 `:738`은 `window.kstToday()`를 쓴다. counterpart checked: `src/scripts/layout/shell.js:147`
- `src/scripts/ledger.js:1569` — **MEDIUM** — 매입 정산 CSV가 공급처명을 `'"' + name + '"'`로 감싸면서 **내부 따옴표를 이스케이프하지 않는다**(매출 쪽 `:1068`은 `.replace(/"/g,'""')`를 한다). 이름에 `"`가 들어가면 그 행 이후 열이 어긋난다. counterpart checked: `src/scripts/ledger.js:1068`(정상 사례) · `src/utils/csv.ts:96`

## 확인했지만 이상 없음 (1줄 나열)

동시 로드 4조합 전역 충돌 전수 대조(`fmt` 3중 중복은 세 정의가 모두 `window.fmtNum` 위임이라 무해) · `/api/cash-flow/summary`·`/loans`·`/schedule` POST · `/api/vat/*` · `/api/tax-invoices/billing-pending-summary` · `/api/reports/{monthly-summary,receivables-analysis,margin-by-client}` · `/api/financial/pnl{,/monthly}` · `/api/payroll/preview`(공제 합계에 `other_deduction` 미포함 → 클라 가산이 정확) · `/api/ledger/receivables`(`balance>0`·`c.id` 키) 계약 일치 · `bank.js`의 `is_personal` 계좌 제외(:1276·:1440) · 원장 부가세 3열 배분(`ledgerAllocVat` 잔차 흡수, `:447-459`) · 원장 합계행 서버집계 우선(cap 1000 방어) · `dsDownloadCsv` BOM 보장 · aging 버킷 라벨↔색상 4:4 대응 · `/clients/:id` 드릴다운 라우트 존재 · 급여대장 CSV/인쇄 컬럼 정합 · `departments.js:267`·`cardExpenses.js:434`의 `toISOString`(UTC 앵커 후 사용이라 정상) · 템플릿 3종 숫자·날짜 헬퍼(Worker=UTC라 `formatDate` 안전, `payslipHtml`은 `Number.isFinite` 가드).

## 기각한 후보 (5줄)

- `accounting.js:312` 카드 합계가 현재 페이지만 합산 — 페이지 라벨이 「페이지 합계」로 명시(`src/pages/accounting.ts:295`)라 오해 소지 없음.
- `financialReports.js:168` 연 매출 ÷ 12 — 카드 부제가 「12개월」로 명시(`src/pages/financialReports.ts:129`)이고 서버가 항상 12행을 준다.
- `cashSchedule.js:109` `days[dateStr]` 무가드 접근 — 라우트가 월 전일을 미리 채워 반환(`src/routes/cashSchedule.ts:153-156`)해 누락 불가.
- `payroll.js:515` 일괄수정의 `childcare: row.nontax_childcare` — 육아수당 입력 UI·직원 고정값이 코드 어디에도 없어 항상 0, 실제 손실 경로 없음.
- `taxInvoices.js`↔`cashReceipts.js`의 `fmt` 중복 — 후자가 이기지만 소수점 옵션 차이뿐이라 정수 금액에서 결과 동일.
