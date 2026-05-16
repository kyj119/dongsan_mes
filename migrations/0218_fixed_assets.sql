-- #77: 고정자산 관리 (감가상각 추적)

CREATE TABLE IF NOT EXISTS fixed_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,  -- EQUIPMENT | VEHICLE | FURNITURE | IT | OTHER
  equipment_id TEXT REFERENCES equipment(id),
  acquisition_date DATE NOT NULL,
  acquisition_cost REAL NOT NULL,
  useful_life_months INTEGER NOT NULL,
  depreciation_method TEXT NOT NULL DEFAULT 'STRAIGHT_LINE',  -- STRAIGHT_LINE | DECLINING_BALANCE
  salvage_value REAL DEFAULT 0,
  current_book_value REAL,
  status TEXT NOT NULL DEFAULT 'IN_USE',  -- IN_USE | DISPOSED | SOLD | IDLE
  disposed_at DATE,
  disposal_amount REAL,
  disposal_reason TEXT,
  location TEXT,
  serial_number TEXT,
  entity_id INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_fa_category ON fixed_assets(category);
CREATE INDEX IF NOT EXISTS idx_fa_status ON fixed_assets(status);
CREATE INDEX IF NOT EXISTS idx_fa_equipment ON fixed_assets(equipment_id);

CREATE TABLE IF NOT EXISTS depreciation_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,
  period TEXT NOT NULL,  -- YYYY-MM
  depreciation_amount REAL NOT NULL,
  accumulated_depreciation REAL NOT NULL,
  book_value REAL NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(asset_id, period)
);
CREATE INDEX IF NOT EXISTS idx_depr_asset ON depreciation_records(asset_id);
CREATE INDEX IF NOT EXISTS idx_depr_period ON depreciation_records(period);
