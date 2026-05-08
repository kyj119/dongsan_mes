-- 장비 관리 확장: 배치도 좌표, 상태 관리, 헤드 관리, 유지보수 이력

-- 1. equipment 테이블 확장
ALTER TABLE equipment ADD COLUMN equipment_status TEXT DEFAULT 'IDLE';
ALTER TABLE equipment ADD COLUMN head_count INTEGER DEFAULT 0;
ALTER TABLE equipment ADD COLUMN location_x REAL DEFAULT 50;
ALTER TABLE equipment ADD COLUMN location_y REAL DEFAULT 50;
ALTER TABLE equipment ADD COLUMN location_zone TEXT DEFAULT '';
ALTER TABLE equipment ADD COLUMN notes TEXT DEFAULT '';
ALTER TABLE equipment ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP;

-- 2. 프린터 헤드 관리
CREATE TABLE IF NOT EXISTS equipment_heads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  equipment_id TEXT NOT NULL,
  head_number INTEGER NOT NULL,
  status TEXT DEFAULT 'NORMAL',
  replaced_at DATETIME,
  notes TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE,
  UNIQUE(equipment_id, head_number)
);

CREATE INDEX IF NOT EXISTS idx_equipment_heads_equip ON equipment_heads(equipment_id);

-- 3. 유지보수/정비 이력
CREATE TABLE IF NOT EXISTS maintenance_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  equipment_id TEXT NOT NULL,
  log_type TEXT NOT NULL DEFAULT 'MAINTENANCE',
  description TEXT NOT NULL,
  cost INTEGER DEFAULT 0,
  performed_by INTEGER,
  performed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE,
  FOREIGN KEY (performed_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_maintenance_logs_equip ON maintenance_logs(equipment_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_logs_type ON maintenance_logs(log_type);
