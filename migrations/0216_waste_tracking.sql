-- #72: 자재 폐기/로스율 추적

ALTER TABLE cards ADD COLUMN waste_sqm REAL DEFAULT 0;
ALTER TABLE cards ADD COLUMN waste_reason TEXT;

CREATE TABLE IF NOT EXISTS waste_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id INTEGER REFERENCES cards(id),
  equipment_id TEXT,
  waste_date DATE NOT NULL,
  waste_type TEXT NOT NULL,    -- MEDIA | INK | LAMINATE | OTHER
  waste_reason TEXT NOT NULL,  -- SETUP | DEFECT | SCRAP | TRIM | OVERRUN
  quantity REAL NOT NULL,
  unit TEXT DEFAULT 'SQM',
  estimated_cost REAL DEFAULT 0,
  material_item_id INTEGER REFERENCES items(id),
  notes TEXT,
  recorded_by INTEGER REFERENCES users(id),
  entity_id INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_waste_date ON waste_records(waste_date);
CREATE INDEX IF NOT EXISTS idx_waste_equipment ON waste_records(equipment_id);
CREATE INDEX IF NOT EXISTS idx_waste_card ON waste_records(card_id);
CREATE INDEX IF NOT EXISTS idx_waste_reason ON waste_records(waste_reason);
