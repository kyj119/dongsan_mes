-- ============================================================================
-- Migration 0305: 주문 청구 법인 분할 — order_billing_groups (P1: 스키마 + 백필)
-- 설계 정본: docs/superpowers/specs/2026-06-10-split-billing-by-entity.md (§4)
-- 핸드오프:  docs/superpowers/specs/2026-06-10-split-billing-IMPLEMENTATION-PLAN.md (P1)
--
-- 목적: 현재 orders 에 박혀 있는 청구 상태/금액(billing_status, billed_*)을
--       (주문 × 법인) 레이어인 order_billing_groups 로 끌어올린다.
--       품목 assigned_entity_id 별로 각 생산법인이 자기 몫을 직접 청구.
--
-- P1 범위 = 테이블 신설 + 기존 주문 1:1 백필(주문당 1그룹).
--   · 청구 분할(품목 assigned_entity_id 기준 재계산)은 P2/P3 신규 코드에서.
--   · orders.billing_status/billed_* 컬럼은 롤백용으로 유지(P5 검증 후 제거).
--
-- 멱등성: CREATE ... IF NOT EXISTS + 백필 INSERT OR IGNORE(UNIQUE order_id,entity_id).
--         재적용해도 중복 그룹 생성 안 됨.
-- 확인된 prod 스키마(2026-06-10): orders.entity_id NULL/0 = 0건,
--   billing_status = BILLED 3 / PAID 0 / NULL 432 (총 435). supply/tax_amount는
--   orders에 없으므로 백필 시 NULL(P3/P4에서 산정). tax_invoice_id 연결은 P4.
-- ============================================================================

CREATE TABLE IF NOT EXISTS order_billing_groups (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id        INTEGER NOT NULL REFERENCES orders(id),
  entity_id       INTEGER NOT NULL,                       -- 청구(=생산 담당) 법인
  billing_status  TEXT,                                   -- NULL | BILLED | PAID (orders에서 이동)
  billed_amount   INTEGER,                                -- 이 법인 몫 청구금액
  supply_amount   INTEGER,                                -- 공급가액 (P3/P4 산정)
  tax_amount      INTEGER,                                -- 세액 (P3/P4 산정)
  billed_at       DATETIME,
  billed_by       INTEGER REFERENCES users(id),
  tax_invoice_id  INTEGER REFERENCES tax_invoices(id),    -- 발행 시 연결 (P4)
  created_at      DATETIME DEFAULT (datetime('now')),
  UNIQUE(order_id, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_obg_order  ON order_billing_groups(order_id);
CREATE INDEX IF NOT EXISTS idx_obg_entity ON order_billing_groups(entity_id);
CREATE INDEX IF NOT EXISTS idx_obg_status ON order_billing_groups(billing_status);

-- 백필: 기존 주문 전수 → 주문당 1그룹 (order_id, orders.entity_id, 기존 청구상태/금액).
--   · BILLED/PAID 동결(이미 발행된 세금계산서가 orders.entity_id 기준 → 절대 재분할 금지).
--   · NULL(미청구)도 1그룹 백필 → P2/P3 신규 코드에서 품목 기준 재계산(발행 전이라 안전).
--   · supply_amount/tax_amount/tax_invoice_id 는 NULL(후속 Phase 산정).
INSERT OR IGNORE INTO order_billing_groups
  (order_id, entity_id, billing_status, billed_amount, billed_at, billed_by)
SELECT id, entity_id, billing_status, billed_amount, billed_at, billed_by
FROM orders;
