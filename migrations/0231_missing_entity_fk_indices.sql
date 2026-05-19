-- Area 4: 데이터 정합성 — entity_id 인덱스 누락 + FK 인덱스 누락 일괄 추가
-- Tables: waste_records, returns, purchase_invoices, budgets, journal_entries, fixed_assets
-- FK cols: return_items.order_item_id, purchase_invoice_items.po_item_id/item_id

-- ── entity_id 인덱스 ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_waste_records_entity     ON waste_records(entity_id);
CREATE INDEX IF NOT EXISTS idx_returns_entity           ON returns(entity_id);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_entity ON purchase_invoices(entity_id);
CREATE INDEX IF NOT EXISTS idx_budgets_entity           ON budgets(entity_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_entity   ON journal_entries(entity_id);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_entity      ON fixed_assets(entity_id);

-- ── FK 인덱스 (return_items) ──────────────────────────────────────────────────
-- order_item_id 은 RESOLVED 후 재고 복원 JOIN 에 사용되므로 인덱스 필수
CREATE INDEX IF NOT EXISTS idx_return_items_order_item  ON return_items(order_item_id);

-- ── FK 인덱스 (purchase_invoice_items) ───────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_pii_po_item              ON purchase_invoice_items(po_item_id);
CREATE INDEX IF NOT EXISTS idx_pii_item                 ON purchase_invoice_items(item_id);

-- ── notifications entity_id 추가 (0058 생성 당시 멀티 entity 아키텍처 전) ──────
ALTER TABLE notifications ADD COLUMN entity_id INTEGER DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_notifications_entity     ON notifications(entity_id);
