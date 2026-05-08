-- 장비 유지보수 고도화: 소모품 관리 + 예방정비 스케줄

-- 1. 장비 소모품 관리
CREATE TABLE IF NOT EXISTS equipment_consumables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  equipment_id TEXT NOT NULL,
  name TEXT NOT NULL,
  replacement_cycle_days INTEGER DEFAULT 0,
  last_replaced_at DATETIME,
  next_due_at DATETIME,
  quantity_on_hand INTEGER DEFAULT 0,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_equipment_consumables_equip ON equipment_consumables(equipment_id);
CREATE INDEX IF NOT EXISTS idx_equipment_consumables_due ON equipment_consumables(next_due_at);

-- 2. 예방정비 스케줄 (반복 일정)
CREATE TABLE IF NOT EXISTS maintenance_schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  equipment_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  interval_days INTEGER NOT NULL DEFAULT 30,
  checklist TEXT,
  last_performed_at DATETIME,
  next_due_at DATETIME,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_maintenance_schedules_equip ON maintenance_schedules(equipment_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_schedules_due ON maintenance_schedules(next_due_at);

-- 3. maintenance_logs 확장 (수리 티켓 강화)
ALTER TABLE maintenance_logs ADD COLUMN severity TEXT DEFAULT 'NORMAL';

ALTER TABLE maintenance_logs ADD COLUMN downtime_minutes INTEGER DEFAULT 0;

ALTER TABLE maintenance_logs ADD COLUMN resolved_at DATETIME;

ALTER TABLE maintenance_logs ADD COLUMN schedule_id INTEGER;
