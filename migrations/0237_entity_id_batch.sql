-- #154: stock_alerts entity_id
ALTER TABLE stock_alerts ADD COLUMN entity_id INTEGER DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_stock_alerts_entity ON stock_alerts(entity_id);

-- #141: tasks entity_id
ALTER TABLE tasks ADD COLUMN entity_id INTEGER DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_tasks_entity ON tasks(entity_id);

-- #141: equipment_consumables entity_id
ALTER TABLE equipment_consumables ADD COLUMN entity_id INTEGER DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_ec_entity ON equipment_consumables(entity_id);

-- #141: maintenance_schedules entity_id
ALTER TABLE maintenance_schedules ADD COLUMN entity_id INTEGER DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_ms_entity ON maintenance_schedules(entity_id);

-- #150: purchase_invoice_items entity_id
ALTER TABLE purchase_invoice_items ADD COLUMN entity_id INTEGER DEFAULT 1;
UPDATE purchase_invoice_items SET entity_id = (
  SELECT COALESCE(pi.entity_id, 1) FROM purchase_invoices pi WHERE pi.id = purchase_invoice_items.invoice_id
) WHERE EXISTS (SELECT 1 FROM purchase_invoices pi WHERE pi.id = purchase_invoice_items.invoice_id);
CREATE INDEX IF NOT EXISTS idx_pii_entity ON purchase_invoice_items(entity_id);

-- #149: return_items entity_id
ALTER TABLE return_items ADD COLUMN entity_id INTEGER DEFAULT 1;
UPDATE return_items SET entity_id = (
  SELECT COALESCE(r.entity_id, 1) FROM returns r WHERE r.id = return_items.return_id
) WHERE EXISTS (SELECT 1 FROM returns r WHERE r.id = return_items.return_id);
CREATE INDEX IF NOT EXISTS idx_ri_entity ON return_items(entity_id);

-- #153: inventory_count_items UNIQUE 제약 추가
CREATE UNIQUE INDEX IF NOT EXISTS idx_count_items_unique ON inventory_count_items(count_id, item_id);
