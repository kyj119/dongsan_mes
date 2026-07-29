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

---

## 4차: 검수 + 잔여 전량 (2026-07-29, 사용자 요청 "55건 검수" → "나" → "C")

### 4-1. 3차 적용분 62곳 검수 — 결함 없음

`84a53302` 에서 추가된 ORDER BY 62줄 전수. 로컬 D1 `prepare()`(컬럼 해석까지 수행 → ambiguous column·compound SELECT 위반 포착) 45건 자동 + 변수 인터폴레이션 17건 실값 해소 + 고위험 6종 실행. **전부 정상.** UNION(`taxInvoices/queries.ts:353`)의 별칭 없는 `id` 도 entity 필터 활성 상태로 실행 확인.

유일한 지적: `approvals.ts:156` 은 `approval_requests ar JOIN approval_steps ast` 라 한 request가 여러 행이 될 수 있어 `ar.id` 가 엄밀히 유일하지 않음(병렬결재 시). 실무상 1행이라 영향 낮음.

### 4-2. 놓친 근본 원인 — §15 grep 패턴

`review-checklist` §15의 탐지 grep이 `ORDER BY [^,]*(created_at|...)` 이라 **`[^,]*` 가 쉼표를 넘지 못해 다항 ORDER BY를 구조적으로 못 잡았다.** `ORDER BY a DESC, b DESC` 형태의 페이징 목록 10곳이 그대로 통과. 정렬키 컬럼명 화이트리스트(`transaction_time`·`label`·`monthly_pay_min` 누락)도 같은 방식으로 샜다.

→ **`scripts/sort-audit.cjs` 로 교체**(P1 발견 시 exit 1). §15·CLAUDE.md 갱신.

### 4-3. P0 — `order_items.sort_order` 전면 무효 (14곳)

prod 실측 **2,881행 전부 `sort_order = 0`**(NULL 0·양수 0). 주문 1,021건에 대해 distinct 키가 1,021개 = 주문당 전 라인 동값, 최대 27라인, 2,486행이 tie 구간. 즉 주문 품목 라인 순서가 **전부 미정의**였다. (발주 라인은 1차에서 `sort_order ASC, poi.id ASC` 를 받았으나 주문 라인은 누락)

적용: `orders/core.ts:362,458` · `orders/helpers.ts:186` · `orders/operations.ts:84,341` · `orders/create.ts:623` · `orders/update.ts:393` · `cards/queries.ts:341,1007,1062` · `cards/lifecycle.ts:973` · `ledger/ar-ledger.ts:87` · `portal.ts:380,722`

- `cards/queries.ts:1007` 만 `ci.id` — `LEFT JOIN order_items` 라 `oi.id` 가 NULL 가능, 결과 행의 실제 고유키는 card_items

**표시를 넘어선 1곳 — `orders/update.ts` 카드 재매핑**: `item_id + sort_order` 로 기존 라인을 찾는데 sort_order가 전부 0이라 `item_id` 단독 매칭으로 퇴화 → `.find()` 가 비결정적 순서의 첫 행을 집었다. prod에 **동일 item_id 라인 2개 이상인 주문 102건** 존재 → 카드가 엉뚱한 라인에 붙을 수 있었다. 수정 = 저장 쿼리에도 `ORDER BY oi.sort_order, oi.id, ci.id` + 배정된 신규 라인 **소진 처리**. 소진 단위는 mapping이 아니라 **원본 order_item(`old_item_id`)** — 한 라인이 여러 카드에 걸린 경우(현 prod 0건이나 구조상 가능) 그 카드들이 모두 같은 신규 라인을 가리켜야 한다.

### 4-4. P1 — 페이징 목록 10곳

`LIMIT ? OFFSET ?` 인데 마지막 정렬 항목이 여전히 비고유. prod tie 실측:

| 위치 | ORDER BY | prod |
|---|---|---|
| `accounting.ts:304` | `t.evt_date DESC, t.label` | label=3종 리터럴, 입금 flow만 최대군집 26 |
| `accounting.ts:158` · `ledger/ar-payments.ts:258` | `payment_date DESC, created_at DESC` | 339행/152키, 최대 16, 261행(77%)이 tie |
| `bank.ts:461` | `transaction_date DESC, transaction_time DESC` | 1,536행/1,297키, 최대 27 |
| `cardExpenses.ts:547` | 동일 | 808행/709키, 최대 3 |
| `shipments.ts:82` · `hometaxInvoices.ts:133,379` · `ar-dunning.ts:125` · `payroll/settings.ts:126` | — | 데이터 0~2건(코드 결함만) |

`accounting.ts:304` 는 서브쿼리 `t` 의 `ref_id` 사용 → prod 1,388행에서 `label|ref_id` 조합 전부 유일, 전순서 확정.

### 4-5. P2 전량 119곳 (자동 107 + 수동 12)

`scripts/sort-audit.cjs` 로 후보를 뽑고, 괄호 depth 0에서만 동작하는 변환기로 일괄 적용 후 **diff 전량 육안 검토**. 기계 적용이 틀렸을 케이스가 실제로 있었다:

| 케이스 | 곳 | 처리 |
|---|---|---|
| `id` 없는 복합PK 테이블 | 3 | `ai_file_chunks`·`department_category_map`·`equipment_processes` — 해당 키로 WHERE 필터되어 이미 결정론적. 그대로 `id` 를 붙였으면 **`no such column` 500** |
| `SELECT DISTINCT` | 3 | 단일 컬럼 DISTINCT는 이미 유일 → 제외. `inspections.ts:360` 만 출력 컬럼 `supplier_id` 사용 |
| 조인 lookup 별칭 오선택 | 2 | `shipments.ts:658`→`oi.id` · `payroll/tax-agent.ts:219`→`p.id` |
| 서브쿼리·윈도우 내부 | 2 | depth 규칙이 자동 제외 → 수동 |
| 문자열 조립 쿼리 | 9 | 정적 추출 불가 → 개별 확인 |
| `holidays` | 1 | PK=`holiday_date` → 이미 결정론적 |

**표시가 아니라 동작이 바뀌던 곳 4건**:
- `bank.ts:1621`(쓰기) — 입금 자동매칭 `UPDATE cash_schedule ... WHERE id=(SELECT ... ORDER BY schedule_date ASC LIMIT 1)`. 같은 거래처·금액·날짜 예정이 둘 이상이면 **어느 예정을 DONE 처리할지 비결정적**
- `purchaseRequests.ts:768`(윈도우) — `ROW_NUMBER() OVER (... ORDER BY po.created_at DESC)` 로 "최근 발주처" 추천. 발주 이관 241건 동값 → **추천 공급업체가 실행마다 달라짐**
- `utils/autoDeductPostProcessingMaterials.ts:87`(쓰기) — 후가공 자재 폭매칭 `ORDER BY width_mm ASC LIMIT 1`. prod에 같은 `item_group`+`width_mm` **31조합·최대 6개** → **차감되는 자재 SKU가 실행마다 달라짐**(재고 정합성). ※ "동폭 중 어느 SKU를 소비할지"는 별도 업무규칙 필요 — 현재는 id 최소값 고정
- `utils/intercompany.ts:114` — 법인간 AR 목록 `LIMIT 500`

라우트 밖(`src/utils`) 2건은 스캔 범위를 `src/services`·`src/utils` 까지 넓히면서 새로 발견됐다.

### 4-6. 남은 것 (의도적)

- **P2 잔여 0** — 감사 도구가 보고하는 잔여는 전부 `KNOWN_SAFE` 등록분(복합PK 4·DISTINCT 단일컬럼 2) 또는 고유키 정렬(`page_key`·`setting_key`)
- **P3 72 / P4 69 미적용** — GROUP BY 집계·랭킹이라 행 정체성이 없다. 표시 순서만 흔들리며 페이징도 없음

### 검증

| 항목 | 결과 |
|---|---|
| `npm run verify` | typecheck 0 · build 422 모듈 |
| SQL `prepare()` **HEAD 대조** | baseline 62 = 변경 후 62, **차집합 공집합 → 신규 SQL 오류 0** |
| 변경 ORDER BY 145줄 개별 검증 | 131 자동 + 나머지 실 SQL 실행 |
| `npm run smoke` | 104/104 |
| 변경 엔드포인트 실호출 | 55경로 **500계열 0** |
| prod 실데이터 | 주문 559(27라인·전부 `sort_order=0`) → id 순 결정론 확인 |

> ⚠️ **타입체크는 SQL 오류를 못 잡는다.** `npm run verify` 통과는 SQL 정상을 의미하지 않는다.
> 정렬 수정 후에는 반드시 로컬 D1 `prepare()`/실행으로 확인할 것.

---

## 후속(정렬과 별개 건)

정렬을 고친 뒤 발주 목록 첫 화면이 법인간거래 이관건(`ICM-AP-*`)으로 채워지는 것이 드러나, **발주 목록·COUNT·통계·CSV에서 내부법인 매입처를 기본 제외 + '법인간거래 포함' 토글**을 추가했다(main `696791a6`, prod 반영은 타 세션 배포 `10f2d4de`에 수렴).
- 식별은 SSOT `constants/intercompany`(`supplier_id ∈ {53,1271,3757}`) — `po_number` 접두 필터 금지
- `receiving=1`(입고 페이지)은 제외 대상 아님(입고 누락 방지)
- 상세 기록 = `.claude/PROJECT_STATUS.md` #12 · 설계 정본 = 법인간거래 원장 이관 메모리
