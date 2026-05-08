-- ============================================================================
-- Migration 0128 — Order templates
-- ----------------------------------------------------------------------------
-- Reusable "item combination" templates for the order entry form.
-- Intentional scope (per product decision, 2026-04-14): templates only store
-- the item combination (품목·규격·수량·단가·후가공·VAT·내용). Client,
-- delivery date, notes etc. are NOT templated — they belong to the specific
-- order being placed.
--
-- RBAC policy: all authenticated users may CRUD templates. The handler keeps
-- created_by for auditing but does not gate writes by role.
-- ============================================================================

CREATE TABLE IF NOT EXISTS order_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  -- JSON array of items, each row shaped like an order_items payload:
  --   { item_id, item_name, category_name, width, height, quantity, unit,
  --     unit_price, vat_included, post_processing, content }
  items_json TEXT NOT NULL DEFAULT '[]',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_order_templates_active
  ON order_templates(is_active, name);
