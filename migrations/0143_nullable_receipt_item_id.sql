-- 0143: inventory_receipt_items.item_id를 nullable로 변경
-- 이미 _new 테이블이 있거나 적용 완료된 경우 안전하게 스킵

CREATE TABLE IF NOT EXISTS inventory_receipt_items_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_id INTEGER NOT NULL,
  item_id INTEGER,
  quantity REAL NOT NULL,
  unit_price REAL NOT NULL,
  amount REAL NOT NULL,
  location TEXT,
  notes TEXT,
  received_quantity REAL DEFAULT 0,
  accepted_quantity REAL DEFAULT 0,
  rejected_quantity REAL DEFAULT 0,
  quality_status TEXT,
  reject_memo TEXT,
  po_item_id INTEGER,
  FOREIGN KEY (receipt_id) REFERENCES inventory_receipts(id),
  FOREIGN KEY (item_id) REFERENCES items(id)
);

INSERT OR IGNORE INTO inventory_receipt_items_new SELECT * FROM inventory_receipt_items WHERE EXISTS (SELECT 1 FROM inventory_receipt_items LIMIT 1);
DROP TABLE IF EXISTS inventory_receipt_items;
ALTER TABLE inventory_receipt_items_new RENAME TO inventory_receipt_items;
