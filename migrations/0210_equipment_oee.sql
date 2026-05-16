-- #67: 장비별 OEE (설비종합효율) 대시보드
CREATE TABLE IF NOT EXISTS equipment_oee_daily (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  equipment_id TEXT NOT NULL,
  oee_date DATE NOT NULL,
  -- 가용성 (Availability)
  planned_hours REAL NOT NULL DEFAULT 8,
  actual_run_hours REAL DEFAULT 0,
  downtime_planned_min REAL DEFAULT 0,
  downtime_unplanned_min REAL DEFAULT 0,
  availability_pct REAL DEFAULT 0,
  -- 성능 (Performance)
  theoretical_output_sqm REAL DEFAULT 0,
  actual_output_sqm REAL DEFAULT 0,
  performance_pct REAL DEFAULT 0,
  -- 품질 (Quality)
  total_produced INTEGER DEFAULT 0,
  good_produced INTEGER DEFAULT 0,
  defect_count INTEGER DEFAULT 0,
  quality_pct REAL DEFAULT 0,
  -- OEE
  oee_pct REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(equipment_id, oee_date)
);
CREATE INDEX IF NOT EXISTS idx_oee_equipment ON equipment_oee_daily(equipment_id);
CREATE INDEX IF NOT EXISTS idx_oee_date ON equipment_oee_daily(oee_date);
