-- ============================================================================
-- Migration 0027: RIP 잡 시스템 - 장비 마스터 + 프리셋 + cards 필드 추가
-- ============================================================================

-- 1. 장비(프린터+RIP PC) 마스터
CREATE TABLE IF NOT EXISTS equipment (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  printer_name TEXT,
  ip_address TEXT,
  status TEXT DEFAULT 'ACTIVE',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. 장비별 인쇄 프리셋
CREATE TABLE IF NOT EXISTS equipment_presets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  equipment_id TEXT NOT NULL REFERENCES equipment(id),
  preset_name TEXT NOT NULL,
  tps_filename TEXT NOT NULL,
  description TEXT,
  is_default INTEGER DEFAULT 0,
  UNIQUE(equipment_id, preset_name)
);

CREATE INDEX IF NOT EXISTS idx_equipment_presets_equipment ON equipment_presets(equipment_id);

-- 3. cards 테이블 RIP 잡 연동 필드 추가
ALTER TABLE cards ADD COLUMN source_file_path TEXT;
ALTER TABLE cards ADD COLUMN rip_preset TEXT;
ALTER TABLE cards ADD COLUMN rip_queued_at DATETIME;
