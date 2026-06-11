# 주문 청구 법인 분할 (Split Billing by Production Entity)

- **작성일**: 2026-06-10
- **상태**: 설계 확정 (브레인스토밍 완료) · 구현 전 · 세션 분리 예정
- **뒤집는 결정**: `2026-06-04-order-intake-entity-split.md`의 **"매출=청구법인 단일 + 타법인 공정 내부정산"** → **생산법인별 분할 청구**로 전환
- **유지되는 기반**: `order_items.assigned_entity_id`(품목별 담당), `orderVisibilityFilter`, `cards.requesting_entity_id`, 재고차감 COALESCE 정책 (전부 이미 prod 배포됨)

---

## 1. 배경 / 문제

현재 청구법인은 `orders.entity_id` 단일값으로, 주문 저장 시 **로그인 사용자의 세션 법인으로 자동 설정**된다 (`src/routes/orders/core.ts:896-898`, 프론트 셀렉트 기본값 "자동=내 법인" `src/pages/orderForm.ts:65`).

용준님 판단: **청구법인 개념 자체가 코드와 다르다.** 청구는 *주문 입력자(로그인 법인)*가 아니라 *그 품목을 실제로 생산·담당하는 법인*이 주체가 되어야 한다. 한 주문에 동산(현수막)·선명(간판)이 섞이면 **각 생산법인이 자기 품목을 고객에게 직접 청구**해야 한다.

→ 한 주문 = 여러 청구 주체. 기존 "주문 단위 단일 청구" 전제가 무너진다.

## 2. 확정 모델

```
주문 1건 (거래처·생산흐름 통합 — 안 쪼갬)
 ├─ order_item (assigned_entity_id = 담당=청구 법인)
 ├─ order_item
 └─ order_item
        ↓ 품목의 청구법인별로 묶음
 ┌────────────────────────────────────────┐
 │ 청구그룹 A (동산) ← 현수막 품목들        │ → 세금계산서·매출·미수금 (동산)
 │ 청구그룹 B (선명) ← 간판 품목들          │ → 세금계산서·매출·미수금 (선명)
 └────────────────────────────────────────┘
  같은 거래처가 동산·선명 양쪽에서 각각 청구받음
  품목 내부 타법인 공정 = 그 품목 청구법인에 내부정산 (직접 고객청구 아님)
```

## 3. 핵심 결정 (브레인스토밍 9문항 합의)

| # | 결정 사항 | 선택 |
|---|-----------|------|
| 1 | 현재 자동청구의 문제 | **청구법인 개념이 코드와 다름** |
| 2 | 청구법인 기준 | **담당 생산법인 기준** (입력자/로그인 법인 아님) |
| 3 | 혼합 생산 주문의 청구 | **생산법인별 분할 청구** (한 주문 → 여러 세금계산서·매출 분할 인식) |
| 4 | 거래처 ↔ 청구법인 | **같은 거래처가 여러 법인에서 청구 가능** (거래처는 법인 공유, 중립) |
| 5 | 주문 데이터 구조 | **단일 주문 + 법인별 청구그룹** (주문 안 쪼갬, 내부에 청구단위) |
| 6 | 청구 분할 최소 단위 | **품목 단위**(`assigned_entity_id`). 품목 내 타법인 공정은 **내부정산** |
| 7 | 청구그룹 물리 모델 | **전용 테이블 `order_billing_groups` 신설** (청구상태/금액 보유, tax_invoices가 참조) |
| 8 | 법인별 미수금 | **`clients.balance` 캐시 폐기 → (거래처×법인) 파생 계산** |
| 9 | 생산 안 하는 품목(상품·부자재, 담당 NULL)의 청구법인 | **주문 주(主)법인** (거래처 담당·입력 법인) |

## 4. 신규 데이터 모델: `order_billing_groups` (청구단위)

현재 `orders`에 박혀 있는 청구 상태/금액을 **(주문 × 법인)** 레이어로 끌어올린다.

```sql
CREATE TABLE order_billing_groups (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id        INTEGER NOT NULL REFERENCES orders(id),
  entity_id       INTEGER NOT NULL,          -- 청구(=생산 담당) 법인
  billing_status  TEXT,                       -- NULL | BILLED | PAID  (orders에서 이동)
  billed_amount   INTEGER,                    -- 이 법인 몫 청구금액
  supply_amount   INTEGER,                    -- 공급가액
  tax_amount      INTEGER,                    -- 세액
  billed_at       DATETIME,
  billed_by       INTEGER REFERENCES users(id),
  tax_invoice_id  INTEGER REFERENCES tax_invoices(id),  -- 발행 시 연결
  created_at      DATETIME DEFAULT (datetime('now')),
  UNIQUE(order_id, entity_id)
);
CREATE INDEX idx_obg_order  ON order_billing_groups(order_id);
CREATE INDEX idx_obg_entity ON order_billing_groups(entity_id);
CREATE INDEX idx_obg_status ON order_billing_groups(billing_status);
```

- **품목 → 그룹 귀속**: `order_items.assigned_entity_id`로 결정. NULL(상품·부자재 등 미생산) → 주문 주(主)법인 그룹.
- **주(主)법인** = 주문을 접수·소유한 법인. 현재 `orders.entity_id`가 이 역할로 의미 재정의됨 (단일 청구법인 → 접수/대표 법인).
- **금액 산정**: 그룹 `billed_amount` = 그 법인 귀속 품목들의 `amount` 합 ± 배분된 할인/조정.

## 5. 시스템별 변경점 (파생 vs 물리)

> 현재 코드의 의존 구조 (탐색 결과): 매출·미수금은 **파생 계산**, billing_status·clients.balance는 **물리 저장**.

| 시스템 | 현재 | 변경 후 | 주요 파일 |
|--------|------|---------|-----------|
| **청구 상태** | `orders.billing_status` (주문 단위) | `order_billing_groups.billing_status` (그룹 단위) | `orders/core.ts:520-585` (`/bill`) → `/order-invoices/:id/bill` |
| **매출 집계** | `SUM(orders.final_amount) WHERE entity_id=?` 파생 | `SUM(order_billing_groups.billed_amount) WHERE entity_id=?` | `reports.ts:45-155`, `financialReports.ts` |
| **미수금** | `clients.balance` 단일 캐시 (법인 무구분!) | **캐시 폐기** → `(billing_groups[BILLED] − payments − adjustments)` group by (client, entity) 파생 | `ledger/accounts-receivable.ts:141-402, 285-286` |
| **세금계산서** | `tax_invoices.order_id` + M:N `tax_invoice_orders`, 발행 시 주문 BILLED | `tax_invoices`가 청구그룹 참조, 발행 시 **그룹** BILLED. 이미 `entity_id` 보유 | `taxInvoices.ts:113-305` |
| **주문번호 채번** | `E{eid}-date-seq`, orders.entity_id 기반 | 주문번호=주(主)법인 기준 유지. 세금계산서 번호는 그룹 법인별(기존 `generateInvoiceNumber(entityId)` 그대로) | `sequenceGenerator.ts:44-57` |
| **entity 격리** | `entityFilter(orders.entity_id)` / `orderVisibilityFilter` 이미 존재 | 청구·매출·미수금 쿼리는 `order_billing_groups.entity_id` 기준으로 전환 | `entityFilter.ts` |
| **입금·조정** | `payments.entity_id`, `adjustments.entity_id` 이미 보유 | 변경 없음 (이미 법인별) — 미수금 파생의 입력으로 사용 | — |

## 6. Phase 계획 (구현 — 세션 분리)

| Phase | 작업 | 핵심 파일 |
|-------|------|-----------|
| **P1. 스키마·백필** | `order_billing_groups` 신설. 기존 주문 전부 1그룹(`order_id, orders.entity_id, 기존 billing_status/billed_*`)으로 백필. 멱등 마이그레이션 | migrations/ |
| **P2. 주문 생성/수정·UI** | 저장 시 품목 `assigned_entity_id`별 그룹 자동 생성/재계산(NULL→주법인). 주문서 "청구 법인" 셀렉트 → **품목별 청구법인 도출 표시**로 교체. 주문 상세에 청구그룹 요약 | `orders/core.ts`, `pages/orderForm.ts`, `scripts/orderForm/*` |
| **P3. 청구(billing)** | `billing_status`를 그룹 단위로 이동. `/order-invoices/:id/bill`. 청구확정 시 그룹 금액 확정. `clients.balance` 캐시 폐기·미수금 파생 전환 | `orders/core.ts`, `ledger/accounts-receivable.ts` |
| **P4. 세금계산서** | `tax_invoices` ↔ 청구그룹 연결. 발행 단위 = (주문×법인). 발행 시 그룹 BILLED 갱신 | `taxInvoices.ts` |
| **P5. 매출·미수금·리포트** | reports·financialReports·cashSchedule 집계를 그룹 단위로. 미수금 (거래처×법인) 분리. 자금예측(IFRS9) 반영 | `reports.ts`, `financialReports.ts`, `cashSchedule.ts` |
| **P6. 내부정산(후속)** | 품목 내 타법인 공정 정산 추적 (별도 설계) | 신규 |

→ P1~P5 = MVP. P6 = 후속.

## 7. 세부 결정 (확정)

**금액 구성 확인** (`core.ts:938-952`): 품목금액 = `unit_price × 면적/수량`(품목별), VAT = 품목별(`vat_included`), 할인 = 주문 단일값 `orders.discount_amount` (총액 - 할인). → **품목금액·VAT는 품목 담당법인 그룹으로 자연 귀속**, 배분 필요한 건 **주문 레벨 할인 하나뿐**.

| # | 항목 | 확정 |
|---|------|------|
| 7-1 | **할인 배분** | 주문 레벨 `discount_amount`는 **그룹 공급액 비례(pro-rata)** 자동 배분. 라운딩 잔차는 주(主)법인 그룹에 귀속. 단일그룹 주문=100% 그 그룹(현행 동일). 특정 법인 한정 할인이 필요하면 **품목 단가(unit_price) 조정**으로 입력→자동 귀속. MVP는 별도 UI 불필요 |
| 7-2 | **기존 주문 백필** | 마이그레이션이 주문당 **1그룹** 생성 = `(order_id, orders.entity_id, 기존 billing_status·billed_*·supply/tax)`. 멱등(`UNIQUE(order_id,entity_id)` + INSERT OR IGNORE). **BILLED/PAID는 동결**(이미 발행된 세금계산서가 orders.entity_id 기준 → 절대 재분할 금지). NULL(미청구)도 1그룹 백필하되, 신규 코드(P2/P3)에서 다음 저장·청구 시 품목 기준 **재계산**(발행 전이라 안전) |
| 7-3 | **롤백 전략** | `orders.billing_status/billed_*/discount_amount` 컬럼은 전환기 **유지**(읽기는 그룹으로 전환, 기존 컬럼은 백업). P5 prod 검증 완료 **후** 별도 마이그레이션으로 제거 |
| 7-4 | **단가미정 게이트** | 그룹 BILLED 조건 = **그 그룹 내 품목이 모두 price_status 확정**. 현 주문 단위 게이트(`core.ts`)를 그룹 단위로 |
| 7-5 | **세금계산서 연결 일원화** | `tax_invoices.order_id`(1:1) + `tax_invoice_orders`(M:N) 공존 모순 → **청구그룹 참조로 일원화**. 신규 `tax_invoice_billing_groups`(M:N, **동일 entity 그룹만** — 월합산 발행 대비). `tax_invoices.order_id`는 전환기 nullable 유지 |
| 7-6 | **주(主)법인** | = `orders.entity_id`(접수 법인). NULL 담당·상품/부자재 품목 청구처. 거래처별 기본 청구법인은 미도입(결정 #9) |

**남은 known-impact(결정 아님, 구현 시 점검)**: `clients.balance`를 읽는 모든 지점(대시보드 `financialReports.ts:244`, 연체 알림 등)을 파생 쿼리로 전환 + 성능 확인.

## 8. 영향 파일 요약

- **DB**: `migrations/` (신규 `order_billing_groups` + 백필)
- **백엔드**: `orders/core.ts`(생성·청구), `taxInvoices.ts`(발행), `ledger/accounts-receivable.ts`(미수금), `reports.ts`·`financialReports.ts`(매출), `cashSchedule.ts`(자금예측), `entityFilter.ts`
- **프론트**: `pages/orderForm.ts`, `scripts/orderForm/{calc,sheet}.js`, 주문 상세 뷰

## 9. 후속 조치

- 메모리 `design-order-intake-split` 의 "매출=청구법인 단일" 항목 = **본 spec으로 뒤집힘** 표기 완료.
- §7 세부 전부 확정 (2026-06-10). **설계 완료 — 다음 세션 P1(스키마·백필)부터 착수 가능.**
- 구현은 6 Phase 세션 분리. P1~P5 = MVP, P6(내부정산) = 후속.
