# 전수 감사 정본 — KST/UTC 날짜 버그 + UI 영문 노출 (2026-07-10)

> 발주: mojibake·KST 대기열 실행 + 영문(직급/부서 등) 노출 점검 추가 지시.
> mojibake는 당일 정정 완료(`73da47be`, prod DB 계정과목 UPDATE 포함) — 본 문서는 **KST·영문 수정 작업목록 정본**.
>
> **✅ 수정 완료 (2026-07-10 당일)**: 1부 KST BUG 전체=`9110ad0e`(74파일 ~137곳, LOW ~45건은 보류) / 2부 영문 상+중=`d952a052`(33파일, 단위 11지점은 현행 유지 결정). 아래 목록은 감사 원본 기록.
>
> **✅ LOW ~45건도 완료 (2026-07-10, 커밋 `639ceaca`, prod 배포·apex 검증)**: 1부 LOW 전량(ⓐ연도 getFullYear→kstYear 14파일·ⓑ월 getMonth산술→kstYm파생·ⓒCSV/R2폴더 toISOString→kstYmd 11파일·ⓓ알림 dedup date('now')→KST·채번 kstYmdCompact) 32파일 정비. 동일클래스 형제 CSV(inspections·purchaseRequests·po-receipts·tax-agent·cashSchedule) + leaves calcAnnualEntitlement까지 확장. **제외**: payroll/core.ts 죽은 fallback(미커밋 회피)·프론트 .js CSV 파일명(window.kstToday 패턴, 별도). **2부 단위(11지점)=④ 사용자 최종 결정 "현행 유지(EA/yd/L)" — 종결**.

---

# 1부. KST/UTC 날짜 버그 (BUG ~130건: 백엔드 ~88 / 프론트 ~42, LOW ~45건)

전제: Workers 런타임=UTC. `new Date().toISOString().slice(0,10)`·SQL `date('now')`/`strftime('%Y-%m','now')`가 업무일에 쓰이면 **KST 00:00~09:00에 매일 하루 어긋남**. `src/utils/kstDate.ts` 헬퍼 미적용 지점만 BUG 판정.

## A. 집계/KPI 월·오늘 경계 (최우선)
- `src/routes/dashboard.ts:63` | month_billed=strftime('%Y-%m','now') (인접라인은 전부 kstMonth()) | 대시보드 당월 매출이 월초 00~09시 전월로 오집계
- `src/routes/dashboard.ts:64` | month_paid 동일 | 당월 수금 전월 오집계
- `src/routes/reports.ts:474` | 당월 매출 strftime('%Y-%m','now') | AR 요약 당월 매출 월경계 오집계
- `src/routes/reports.ts:481` | 당월 수금 동일
- `src/routes/reports.ts:655` | 비교기준월 now.getMonth()-1(UTC) | 월초 비교기준월 한 달 더 밀림
- `src/routes/ledger/ar-ledger.ts:590` | 마감요약 당월 now.getMonth()(UTC) | 월초 마감 대시보드 전월 표시

## B. "오늘" 기본 조회일 → 전날 데이터
- `src/routes/oee.ts:13,152,171` | OEE 계산/조회/추이 기준일
- `src/routes/productionReports.ts:15,98,181,293,358,422,499,579` | 리포트 dateTo/targetDate 기본값 (생산요약·실적·후가공·불량·소모·체류·인쇄)
- `src/routes/shipments.ts:134,273,607,634` | 출고 daily/합배송/뱃지/대시보드 기준일
- `src/routes/production.ts:418` | 생산통계 종료일
- `src/routes/cards/queries.ts:685` | 불량통계 종료=오늘 23:59:59(UTC)
- `src/routes/portal.ts:741` | 포털 원장 종료일
- `src/routes/ledger/ar-dunning.ts:292` | 독촉 대상기간 종료일
- `src/routes/attendance.ts:58` | 근태 기본월=slice(0,7)(UTC)
- `src/routes/hr.ts:926` | 직원상세 기본월
- `src/routes/printEvents.ts:832,854` | 오늘 실적 date(created_at)=date('now')
- `src/routes/rip.ts:1278` | 장비 오늘 출력 date(print_completed_at)=date('now')
- `src/scripts/productionReports.js:66` | getToday()→일일생산 기본일 (production.js는 kstToday() 기수정 — 형제 누락)
- `src/scripts/productionReports.js:250,776` | 기간분석/OEE 기준일 default
- `src/scripts/shipmentsDashboard.js:2` | 배송 대시보드 조회일

## C. OVERDUE/만료/연체 판정 하루 지연
- `src/routes/rip.ts:917,1107,1328,1343,2108,2122` | next_due_at<=date('now') | 당일 만료 소모품·정비 09시까지 OVERDUE 미표시
- `src/routes/quotations.ts:39,107,150-155` | 견적 만료 처리·목록·KPI
- `src/routes/orders/queries.ts:19` | 견적만료 목록
- `src/routes/orders/operations.ts:251` | 견적 유효기한 비교 → "아직 유효" 오판
- `src/routes/ledger/ar-receivables.ts:260` | 연체일수 → 30/60/90 구간 오분류
- `src/routes/notifications.ts:158` | 납기지연/발주초과/정비기한 today·tomorrow(UTC) | 알림 하루 늦음
- `src/scripts/dashboard.js:304,600` | 오늘 마감 카드 긴급/지연 표시 누락
- `src/scripts/productionReports.js:222` | 생산 마감 지연 판정
- `src/scripts/schedule.js:149` | 오늘마감 카운트 저평가
- `src/scripts/shipments.js:1415` | 자동완료 대상 판정
- `src/scripts/taxInvoices.js:851` | 청구가능/대기 분류

## D. 채번(YYYYMMDD 프리픽스) — 00~09시 전날 날짜
- `src/routes/orders/create.ts:68,439` | 주문번호(최다경로)·여신결재 번호
- `src/routes/approvals.ts:177` | 결재요청 번호
- `src/routes/claims.ts:87` | 클레임 번호
- `src/routes/returns.ts:58` | 반품 번호
- `src/utils/shipmentHelper.ts:73` | 출고번호 SHP-E{n}
- `src/routes/inventory.ts:316,689` | 입고 RCV·출고 REL 번호
- `src/routes/purchaseOrders/po-special.ts:44,150,267` | 재/복제/빠른발주 PO번호
- `src/routes/purchaseOrders/po-receive.ts:53` | 입고번호
- `src/routes/weeklyPurchase.ts:246` | 구매요청 번호
- `src/routes/quotations.ts:32,628` | 견적번호·전환 주문번호
- `src/routes/taxInvoices/issue.ts:129` | 직접발행 백업주문 번호
- `src/routes/paymentRequests.ts:111,170` | 지출결의 번호
- `src/routes/purchaseRequests.ts:384,666,819` | PR·PO 번호
- `src/routes/purchaseOrders/core.ts:290`·`templates.ts:191` | PO 번호
- `src/routes/orders/operations.ts:87` | 주문복제 신규번호
- `src/routes/hrSelf.ts:115` | 재직증명서 번호
- `src/routes/inventoryCount.ts:72` | 재고실사 count_number (기지)

## E. 저장 업무일 기본값 — 하루 밀려 저장/표시
- `src/routes/taxInvoices/issue.ts:76,315,508`·`batch.ts:36` | **세금계산서 issue_date 기본** (법적 문서)
- `src/scripts/taxInvoices.js:407,701,1090` | 발행/수정/일괄 issue_date 제출값
- `src/routes/claims.ts:95`·`returns.ts:66` | claim_date·return_date 기본
- `src/routes/purchaseOrders/po-special.ts:159,276` | order_date=date('now')
- `src/routes/purchaseOrders/po-receive.ts:50` | receipt_date 기본
- `src/utils/stockShip.ts:67` | transaction_date=date('now') → 일자별 재고집계 왜곡
- `src/routes/inventoryCount.ts:73` | count_date (기지)
- `src/routes/purchaseInvoices.ts:235,271` | 지급예정 기준일·invoice_date 기본
- `src/routes/ledger/accounts-payable.ts:593` | adjustment_date 기본
- `src/routes/quotations.ts:246` | valid_until·quotation_date 기본
- `src/routes/paymentRequests.ts:111,170` | request_date 기본
- `src/routes/hrSelf.ts:115` | 증명서 issue_date 저장+당일 카운트 WHERE
- `src/pages/payslip.ts:276` | 급여명세서 발행일(인쇄본)
- `src/pages/yearEnd.ts:300` | 연말정산 발행 월/일(인쇄본)
- `src/routes/inventory.ts:470` | 검수 결정로그 날짜+시각 노트 박제
- `src/scripts/cashFlow.js:275` | actual_paid_date 제출
- `src/scripts/paymentRequests.js:198` | paid_at 제출
- 프론트 폼 날짜 기본값(UTC toISOString → 제출 시 오저장): `cardExpenses.js:538,760` · `cashReceipts.js:162` · `ledger.js:1034,1299` · `receiving.js:328` · `laborContracts.js:210` · `purchaseInvoices.js:69` · `purchaseOrderForm.js:57,60` · `migration.js:590` · `equipment.js:1240` · `quotationForm.js:607` · `iaEditor.js:2772` · `orderForm/sheet.js:13`·`client.js:330`·`parent.js:1264` · `orderFormDist.js:475` · `cashFlow.js:133,353` · `financialReports.js:470`

## F. 외부 동기화 조회창 / 저장경로 / 고객발송
- `src/routes/bank.ts:459,1745` | 바로빌 은행 수집창 dateStart/End | 당일 거래 누락
- `src/routes/cardExpenses.ts:320`·`src/scripts/cardExpenses.js:433` | 카드 동기화 range
- `src/utils/consumptionForecast.ts:39`·`src/routes/postProcessing.ts:287` | 집계 since 시작점
- `src/routes/autoProcess.ts:319` | 파일 저장 yyyy\mm\dd 폴더 → 00~09시 저장분 전날 폴더
- `src/scripts/ledger.js:1595,1991`·`orders.js:1583`·`messages.js:77`·`taxInvoices.js:1264` | 고객발송 기준일/발행일/접수일

## G. datetime-local 예약시각 — 9시간 오차 (별도·더 심각)
- `src/scripts/layout/shell.js:1846`·`messages.js:327` | 예약발송 기본시각 toISOString().slice(0,16) offset 보정 누락 (equipment.js:1145는 보정 있음 — 그 패턴으로)

## LOW (~45건, 후순위)
- 연도 기본값(1/1 00~09시만 오류): budgets.ts:11,57 · cashReceipts.ts:21 · financialReports.ts:164,385 · insuranceReports.ts:17,45,90 · leaves.ts:236,293,1073 · payroll/year-end.ts:57,143,173,400 · payroll/settings.ts:329 · vatReports.ts:13 · taxInvoices/helpers.ts:71 · ar-ledger.ts:504 · pages/yearEnd.ts:8
- 월 기본값(1일 00~09시만): taxInvoices/queries.ts:405 · cashSchedule.ts:480 · cashFlow.ts:450,773 · forecast.ts:76 · cardExpenses.ts:101,765,910 · leaves.ts:60 · productionReports.js:412
- CSV 파일명(표시만): accounts-payable.ts:966 · productionReports.ts:581 · orders/queries.ts:427 · ar-ledger.ts:370 · po-queries.ts:146 · reports.ts:858 외 프론트 다수
- 알림 dedup UTC창·번호 date 경계: notifications.ts:13 · permissions.ts:137 · po-receive.ts:432 · shipments.ts:804 · cards/lifecycle.ts:982 · hr.ts:1477

## 수정 방법 (권장)
- SQL: `strftime('%Y-%m','now')`→`kstMonth()`, `strftime('%Y-%m',col)`→`kstMonth('col')`, `date('now')`→`kstDate()`, `date(col)`→`kstDateOf('col')`
- 백엔드 JS 날짜문자열: kstDate.ts에 **kstYmd()/kstToday() JS 헬퍼 신설** (`new Date(Date.now()+9*3600e3).toISOString().slice(0,10)`) 후 채번/기본값 일괄 치환 (기존 관례: SQL `date('now','+9 hours')` — cashflowEngine.ts:366)
- 프론트: `new Date().toISOString().slice(0,10)` → 기존 `window.kstToday()` 치환. datetime-local은 equipment.js:1145 getTimezoneOffset() 보정 패턴
- OK 제외(수정 금지): created_at 등 UTC 감사 타임스탬프 저장, UTC간 경과시간 비교, 프론트 getFullYear/valueAsDate/toLocaleDateString(브라우저=KST)

---

# 2부. UI 영문 코드값 노출 (상 12 / 중 ~29지점 / 하 다수)

## 인프라 사실
- **role 한글 SSOT 없음**: `users.role`(ADMIN/MANAGER/DESIGNER/OPERATOR) 맵은 `src/scripts/layout/shell.js:508` 로컬 `__roleMap`뿐(topbar만). HR의 POSITION_NAMES(사원/과장…)와 **다른 필드** → `window.ROLE_NAMES` 승격 필요
- layout.ts는 MES_STATUS+HR_ENUMS(DEPT/POSITION/EMPLOYMENT)+PROCESS 주입. 포털 portalLayout.ts는 MES_STATUS만
- `constants/units.ts` UNIT_LABELS는 **어디에도 미주입** → 단위 영문 노출 11지점의 단일 근본원인

## 심각도 상 — 직급/역할/부서 원값 (12건)
| file:line | 노출 | 수정 |
|---|---|---|
| `src/pages/permissions.ts:29,33,37,41` | 역할 탭 MANAGER/DESIGNER/OPERATOR/ADMIN | 신규 ROLE_NAMES |
| `src/scripts/storageZones.js:118` | 담당자 드롭다운 `이름 (ADMIN)` | ROLE_NAMES |
| `src/scripts/messages.js:440` | 대량발송 수신자 배지 role 원값 | ROLE_NAMES |
| `src/scripts/messages.js:441` | 같은 배지 dept 원값 | DEPT_NAMES |
| `src/scripts/approvals.js:311` | 결재 타임라인 approver_role 원값 | ROLE_NAMES |
| `src/scripts/employeeSelf.js:62` | 셀프서비스 부서/직급 원값 (HR_ENUMS 미주입 페이지) | 주입 추가+매핑 |
| `src/scripts/yearEndManage.js:94,125` | 연말정산 목록·모달 부서 원값 | DEPT_NAMES |
| `src/scripts/payroll.js:42` | 급여등록 option 부서 원값 (같은 파일 prDeptLabel 미사용) | prDeptLabel |
| `src/pages/payslip.ts:253-254` | **급여명세서(공식문서)** 부서·직책 원값 | 서버측 hr.ts 라벨 import |
| `src/pages/yearEnd.ts:243-244` | **원천징수영수증(공식문서)** 부서·직책 원값 | 서버측 hr.ts 라벨 import |

## 심각도 중 (약 29지점)
### 기존 MES_STATUS로 즉시 (6곳)
- `orders.js:107` 일괄출고 토스트 `(PRINTING)` · `cards/rip.js:408` QR 토스트 `현재 상태: HOLD` · `shipments.js:927` 출고차단 모달 status · `productionReports.js:230` 미완료주문 status · `quotations.js:222` 전환주문 status · `portalOrders.js:188,236` **고객 포털** STATUS_MAP에 DRAFT/COMPLETED 누락

### 새 매핑/복붙 불일치 통일 (~12그룹)
- `production.js:51` 배지 "OK" 하드코딩→"정상" · `quality.js:43,86,175,225` 클레임상태/반품사유/불량분류 3맵 신설 · `inspections.js:329` PASS/FAIL/N/A · `cardDetail.js:175` COD만 분기→COLLECT 노출 · `cards/detail.js:24` catLabels SIZE/DAMAGE/DESIGN 누락 · `inventory.js:251` 조정 reason STOCK_COUNT/COUNT_ERROR (백엔드 inventoryCount.ts:460 하드코딩 연동) · `receiving.js:133,231`+`purchaseOrders.js:523` inspStatusLabels 불완전→`purchaseOrders.js:490` 맵으로 통일 · `maintenance.js:104` log_type 누락→`equipment.js:41` LOG_TYPE_MAP 통일 · `equipment.js:819`+`maintenance.js:109` 백엔드 rip.ts:605 `상태 변경: IDLE → RUNNING` 영문 삽입 · `weeklyPurchase.js:238` 발송결과 · `migration.js:431,739,810` · `capsSettings.js:278,326` · `forecast.js:32` MA3 · `schedule.js:37` rip_status · `messages.js:411` client_type (clients.js 맵 재사용) · `activityLog.js:62` LEDGER_EMAIL_SENT 키 누락

### 단위 원값 (11지점, 단일 근본원인 — ⚠️사업 판단 필요)
`purchaseInvoice.js:84` `purchaseInvoices.js:63` `purchaseOrders.js:259,648` `purchaseOrderForm.js:451` `purchaseRequests.js:179` `purchaseRequestForm.js:77-85` `bom.js:139` `storageZones.js:500` `inventoryDashboard.js:114` `receiving.js:923` — UNIT_LABELS window 주입+uomFmt로 일괄. 단, 현장이 EA/yd 관용 사용 가능성.

## 심각도 하 — fallback-only (실사용 노출 없음, 신규 코드 추가 시만 위험)
receiving.js:292 · purchaseOrders.js:177,234 · purchaseOrderForm.js:272 · purchaseRequests.js:93,169,213 · bom.js:78 · equipment.js:460 · iaEditor.js:319 · iaBatchTest.js:318 · inventory.js:239 · hr.js:78 · hrDetail.js:174 · laborContracts.js:127 · leaves.js:65 · paymentRequests.js:90 · cashFlow.js:203,300 · orderFormDist.js:137 · scan.js:184 · emailLogs.js:71
> 별개(사소): pages/quality.ts:26,174 · pages/production.ts:287 옵션 텍스트 `접수(OPEN)` 병기

## 효율적 수정 순서
1. ROLE_NAMES SSOT 신설(shell.js __roleMap→window 주입) → 상 절반 일괄
2. MES_STATUS 미적용 6곳 1줄 치환
3. DEPT 매핑 누락 + employeeSelf 주입 + 공식문서(payslip/yearEnd 서버 라벨)
4. 복붙 불일치 통일(같은 도메인에 올바른 맵 존재)
5. 신규 라벨맵 9종 + 단위 UNIT_NAMES(사업 판단 후)
