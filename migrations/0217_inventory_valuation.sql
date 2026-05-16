-- #74: 재고 평가 (FIFO / 이동평균 / 표준원가)

-- 평가 방법 설정
INSERT OR IGNORE INTO settings (setting_key, setting_value, description)
VALUES ('inventory_valuation_method', 'WEIGHTED_AVG', '재고 평가 방법: FIFO | WEIGHTED_AVG | STANDARD');

-- FIFO 레이어
CREATE TABLE IF NOT EXISTS inventory_fifo_layers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  receipt_date DATE NOT NULL,
  receipt_id INTEGER,
  original_quantity REAL NOT NULL,
  remaining_quantity REAL NOT NULL,
  unit_cost REAL NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_fifo_item ON inventory_fifo_layers(item_id, remaining_quantity);
CREATE INDEX IF NOT EXISTS idx_fifo_receipt ON inventory_fifo_layers(receipt_date);

-- 이동평균 단가 캐시
ALTER TABLE items ADD COLUMN avg_unit_cost REAL DEFAULT 0;
