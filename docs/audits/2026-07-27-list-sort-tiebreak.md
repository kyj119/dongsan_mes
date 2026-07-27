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

## 미적용 잠복 지점 (전역 — 이번 범위 밖)

사용자 지시 범위는 "발주 계열 + 전역 규약 문서화". 아래는 **동일 결함이 남아 있는 목록**으로, 별도 승인 시 스윕 대상.

### 정렬 옵션 맵 (tie-break 전무)

| 파일:라인 | 기본 정렬 | prod tie 밀도 |
|---|---|---|
| `src/routes/orders/core.ts:141-149` | `o.created_at DESC` | orders 1021건 / distinct 135 → **평균 7.6건 동값** |
| `src/routes/orders/queries.ts:403-411` | `o.created_at DESC` | 상동 |
| `src/routes/quotations.ts:95-101` | `q.created_at DESC` | 미측정 |
| `src/routes/cards/queries.ts:308-314` | `c.priority DESC, c.delivery_date ASC, c.created_at ASC` | 미측정 |
| `src/routes/cards/queries.ts:815-831` | `sortMap` / `c.shipped_at DESC` | 미측정 |
| `src/routes/clients.ts:124-126` | `c.client_name ASC`(고유성 없음) / `c.created_at DESC` | clients 3782건 / distinct 1266 |

### 페이징 목록 (`LIMIT ? OFFSET ?`, tie-break 없음)

`activityLogs.ts:37` · `approvals.ts:123` · `cashReceipts.ts:105` · `costs.ts:243` · `cards/queries.ts:678` · `hr.ts:1180` · `portal.ts:336` · `portal.ts:481` · `returns.ts:42` · `taxInvoices/queries.ts:107`

> `NULLS LAST` 사용처(`orders/core.ts:144-145`, `clients.ts:125`)는 D1 방언 의존 — `col IS NULL, col ASC` 형태로 대체 권장.
