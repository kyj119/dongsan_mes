# 목록 정렬 tie-break 감사 (2026-07-27)

## 발단

발주 관리(`/purchase-orders`) 목록이 "역순"으로 표시됨 — 첫 줄이 `SMP-0001`(2026-01-06, 가장 오래된 발주), 발주번호 오름차순처럼 보임.

## 근본 원인

`ORDER BY po.created_at DESC`에 **고유키 tie-break가 없음**. prod 발주 데이터의 `created_at` 분포:

| created_at | 건수 | id 범위 | 발주번호 |
|---|---|---|---|
| 2026-07-15 12:56:24 | **241** | 2~242 | SMP-0001 ~ SMP-0243 |
| 2026-07-15 12:56:43 | 7 | 243~249 | SMP-ACCT/OPEN-* |
| 2026-07-20 01:03:22 | 8 | 250~257 | ICM-AP-E1-* |
| 2026-07-20 01:03:31 | 2 | 258~259 | ICM-AP-E3-* |

전체 258건 중 241건이 초 단위까지 동일 (선명 매입 이관 배치 INSERT). 정렬 키가 전건 동값이므로 SQLite는 순서를 보장하지 않고 실제로는 **rowid 오름차순(=id ASC, 오래된 순)** 으로 반환 → 화면이 뒤집힘.

부수 위험: 동값 구간에서 `LIMIT ? OFFSET ?` 페이징은 페이지 간 **행 중복·누락**이 발생할 수 있음(페이지별 재실행마다 tie 순서 무보장).

### 2차 원인 — 기본 정렬 키 선택

이관 데이터의 `created_at`은 "이관 스크립트 실행 시각"이지 실제 발주 시점이 아님. 업무상 의미 있는 날짜는 `order_date`(prod NULL 0건, INSERT 시 `kstYmd()` 기본). 따라서 기본 정렬을 `created_at` → `order_date`로 교체.

## 적용 (발주 계열)

| 파일:라인 | 변경 |
|---|---|
| `src/routes/purchaseOrders/core.ts:28` | 기본 `sort` = `created_at_desc` → `order_date_desc` |
| `src/routes/purchaseOrders/core.ts:97-106` | `sortOptions` 전 항목에 `po.id` tie-break. `order_date_asc`·`po_number_asc` 추가. `NULLS LAST` → `col IS NULL, col ASC` |
| `src/routes/purchaseOrders/core.ts:119,236` | 발주 품목 라인 `sort_order ASC, poi.id ASC` |
| `src/routes/purchaseOrders/po-queries.ts:90` | 매입처 잔액 TOP5 `balance DESC, c.id ASC` |
| `src/routes/purchaseOrders/po-queries.ts:145` | CSV `po.order_date DESC, po.id DESC` (목록 기본과 정합) |
| `src/routes/purchaseOrders/po-receipts.ts:52,196` | 입고 이력 `ir.receipt_date DESC, ir.id DESC` (`receipt_date` NOT NULL 확인) |
| `src/routes/purchaseOrders/templates.ts:26` | `t.updated_at DESC, t.id DESC` |
| `src/routes/purchaseOrders/stock-alerts.ts:34` | `sa.created_at DESC, sa.id DESC` |
| `src/routes/purchaseRequests.ts:80,281` | `pr.created_at DESC, pr.id DESC` |
| `src/pages/purchaseOrders.ts:47` | 드롭다운 라벨 기준 명시(발주일/등록) + 6옵션 |
| `src/scripts/purchaseOrderForm.js:198,258` | "최근 발주" 조회 `sort=created_at_desc` → `order_date_desc` (이관건이 최근으로 뒤집혀 나오던 문제) |

## 재발 방지 (문서화)

- `CLAUDE.md` → "알려진 함정 (Critical)" 에 **목록 정렬 = 고유키 tie-break 필수** 항목 추가
- `.claude/skills/review-checklist/SKILL.md` → **§15 목록 정렬 tie-break 검사** 추가 (grep 패턴 + 판정 기준)

## 2차: 전역 스윕 (2026-07-27 동일 세션, 사용자 승인 "전체 진행")

### tie 순서는 예측 불가 — 실증

같은 `orders` 테이블, 같은 `ORDER BY created_at DESC`인데 필터 유무로 동값 구간 순서가 **반전**됐다.

| 조건 | 동값 구간 내부 |
|---|---|
| 필터 없음 | id 내림차순 (1116 → 1099 → 1098) |
| `WHERE created_at='2026-04-01 09:00:00'` | id 오름차순 (495 → 496 → 497) |

즉 발주는 ASC로 뒤집혀 사고가 났고 주문은 우연히 DESC였을 뿐. 필터·인덱스 경로가 바뀌면 언제든 반전된다. "현재 정상으로 보임"은 안전을 의미하지 않는다.

### prod tie 밀도 실측

| 테이블.정렬키 | 건수 | distinct | 판정 |
|---|---|---|---|
| orders.created_at | 1021 | 135 | 평균 7.6, **최대 군집 29건**(이관분 `'날짜 09:00:00'` 고정) |
| items (favorite\|분류\|item_name) | 922 | 718 | **204건 동값** |
| purchase_invoices.invoice_date | 241 | 107 | 평균 2.25 |
| activity_logs.created_at | 3292 | 2725 | 경미 |
| print_events (완료시각) | 2049 | 2044 | 거의 고유 |
| inventory (category\|item_name) | 79 | 75 | 4건 |
| employees.employee_code | 112 | 112 | 고유(안전) |
| cards / quotations / cash_receipts / returns / tax_invoices / inspection_results / quality_issues / approval_requests / inventory_auto_deductions / labor_contracts | 0~3 | — | 데이터 없음(코드 결함만) |

### 적용 (33곳)

**🔴 실데이터 위험**: `orders/core.ts:141-153`(sortOptions 6항목 + `NULLS LAST`→`IS NULL`) · `orders/queries.ts:403-412` · `items.ts:158` · `purchaseInvoices.ts:33`

**🟡 경미**: `activityLogs.ts:37` · `printEvents.ts:764,866` · `inventory.ts:64,445` · `notifications.ts:38` · `tasks.ts:54` · `hr.ts:98`

**⚪ 데이터 유입 전 예방**: `quotations.ts:95-100` · `cashReceipts.ts:105` · `returns.ts:42` · `taxInvoices/queries.ts:107` · `portal.ts:290,336,481,712` · `inspections.ts:329,386` · `cards/queries.ts:308-315,678,825-831,1072` · `approvals.ts:123` · `costs.ts:243` · `inventoryCount.ts:36` · `hr.ts:1180` · `clients.ts:124-126` · `items.ts:23,544` · `bank.ts:83` · `cashSchedule.ts:542` · `ledger/ar-dunning.ts:203` · `aiAnalysis.ts:502` · `aiLayout.ts:53`

**`NULLS LAST`(D1 방언) 제거 전량**: `orders/core.ts` 2곳 · `orders/queries.ts` 1곳 · `clients.ts:125` · `priceList.ts:62,134` · `rip.ts:939,1129` · `shipments.ts:180` → `col IS NULL, col` 형태로 통일. 소스 전체에 `NULLS LAST` 잔존 0건.

## 3차: 잔여 전량 정비 (2026-07-27 동일 세션, "나머지 55곳도 진행")

2차에서 남긴 `LIMIT` 없는 전체 조회 및 상위 N 조회 **59곳**(재스캔에서 4곳 추가 발견)을 전량 처리. 대상 = 상세 모달의 이력·메모·코멘트 목록, 대시보드 최근 활동, 원장 거래 시계열, 검색 결과, 큐 처리 순서 등.

| 파일 | 처리 |
|---|---|
| `approvals.ts:156` · `autoProcess.ts:208` · `cardExpenses.ts:111` · `claims.ts:71` | 승인 대기·자동가공 큐·법인카드·클레임 |
| `cards/queries.ts:1117,1144` | 카드 상태이력·불량이력 |
| `clients.ts:312,322,348,358` | 거래처 상세의 최근주문·견적·단가·메모 |
| `dashboard.ts:798,810` | 최근 주문·출고 위젯 |
| `emails.ts:58` · `kakao.ts:1380` · `messages.ts:584` · `messageTemplates.ts:24` · `migration.ts:20` | 발송 로그·템플릿·이관 로그 |
| `hometaxInvoices.ts:424,438` · `vatReports.ts:45,68` | 홈택스 수집분·부가세 신고 상세 |
| `inspections.ts:454` · `items.ts:68,359` · `specGroups.ts:52` | 검수 이력·분류별 품목·규격 베이스 |
| `leaves.ts:502` · `leaveShared.ts:48` | 휴가 신청 목록(관리자·본인) |
| `ledger/ar-dunning.ts:303,310,317` · `ar-ledger.ts:67,116,138` · `ar-payments.ts:369` · `ar-receivables.ts:386` | 원장 거래 시계열(주문·입금·감액) — 잔액 누적 순서라 결정론 중요 |
| `notifications.ts:208` · `productionReports.ts:64` · `orders/queries.ts:144` | 납기 임박·초과 목록 |
| `orders/core.ts:309` · `purchaseRequests.ts:203,353` | 주문 상태이력·발주요청 코멘트 |
| `portal.ts:757,763,769` | 고객 포털 원장 |
| `prices.ts:478` · `purchaseInvoices.ts:59` · `purchaseOrders/core.ts:265` | 매입처 단가·미확정 단가·발주 입고이력 |
| `quotations.ts:770` · `rip.ts:210,1352,1367,2131,2145` · `search.ts:35,45,57,68` · `tasks.ts:157` · `taxInvoices/queries.ts:353` · `taxInvoices/paymentMatch.ts:138` · `workbench.ts:39` | 견적→주문·RIP·정비/소모품·통합검색·태스크 클레임·세금계산서 |

### 주의해서 처리한 케이스

- **UNION(compound SELECT)** `taxInvoices/queries.ts:353` — SQLite는 compound SELECT의 `ORDER BY`에서 **출력 컬럼만** 참조 가능. `ti.id`처럼 별칭을 붙이면 오류 → 별칭 없는 `id` 사용(주석 명기).
- **GROUP BY** `purchaseInvoices.ts:59`(`po.id`) · `orders/queries.ts:144`(`o.id` + HAVING) — tie-break 키가 그룹 키여야 함.
- **SELECT 목록에 `id` 없음** `portal.ts:757,763,769` — 단일 SELECT는 출력 컬럼 밖의 테이블 컬럼도 `ORDER BY` 참조 가능하므로 안전(compound와 다름).
- **NULL 가능 정렬키** `rip.ts:2131,2145` — 필터가 없어 `next_due_at IS NULL, … ASC, id ASC` 형태로 처리(1352·1367은 `IS NOT NULL` 필터가 이미 있어 불필요).

### 검증

- `npm run verify` 통과. 단 **타입체크는 SQL 오류를 잡지 못함** — ambiguous column·compound SELECT 위반은 런타임 500.
- 위험 케이스 6종을 로컬 D1에 **직접 실행**해 확인(UNION·GROUP BY+HAVING·SELECT에 id 없는 쿼리·`IS NULL` 정렬·서브쿼리+별칭) → 전부 `success: true`.
- 로컬 스모크 102/102 PASS (dev 서버가 구 dist를 서빙할 가능성이 있어 위 직접 실행으로 보강).

### 프론트엔드

`src/scripts/*.js` `.sort()` 20곳 점검 — 비교자 없는 2곳(`cardExpenses.js:966`, `costAnalysis.js:46`)은 날짜 문자열 키라 사전순=날짜순으로 정상. 이상 없음.
