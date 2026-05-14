-- ============================================================================
-- CAPS 멀티사이트 지원
-- 두 개 이상의 ACServer(대전/청주 등)를 동시 연동하기 위한 구조 변경
--
-- 핵심 변경:
--   1. caps_sites 테이블 신설 (사이트별 설정 관리)
--   2. caps_employee_map UNIQUE 변경: (caps_e_idno) → (site_id, caps_e_idno)
--   3. employees.caps_site_id 추가
--   4. attendance.caps_site_id 추가
--   5. caps_sync_log.site_id 추가
--   6. 기존 대전(DJ) 데이터 마이그레이션
-- ============================================================================

-- ---------- 1) caps_sites: 사이트별 CAPS 설정 ----------
CREATE TABLE IF NOT EXISTS caps_sites (
  id TEXT PRIMARY KEY,                          -- 'DJ', 'CJ' 등 짧은 코드
  name TEXT NOT NULL,                           -- '대전 본사', '청주'
  relay_db_host TEXT DEFAULT '',
  relay_db_port INTEGER DEFAULT 3306,
  relay_db_engine TEXT DEFAULT 'access',
  relay_db_name TEXT DEFAULT '',
  relay_db_user TEXT DEFAULT '',
  relay_db_password TEXT DEFAULT '',
  relay_table TEXT DEFAULT 'nOutput',
  sync_enabled INTEGER DEFAULT 0,
  sync_interval_min INTEGER DEFAULT 30,
  sync_lookback_days INTEGER DEFAULT 3,
  worker_endpoint TEXT DEFAULT '',
  worker_api_key TEXT DEFAULT '',
  ignored_fpids TEXT DEFAULT '[]',              -- JSON 배열
  last_sync_ok_at DATETIME,
  last_unmapped TEXT DEFAULT '[]',              -- JSON 배열
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 기존 settings에서 대전(DJ) 사이트 초기 데이터 이관
INSERT OR IGNORE INTO caps_sites (id, name, relay_db_host, relay_db_port, relay_db_engine, relay_db_name, relay_db_user, relay_db_password, relay_table, sync_enabled, sync_interval_min, sync_lookback_days, worker_endpoint, worker_api_key, ignored_fpids, last_sync_ok_at)
SELECT
  'DJ', '대전 본사',
  MAX(CASE WHEN setting_key='caps_relay_db_host' THEN setting_value END),
  CAST(MAX(CASE WHEN setting_key='caps_relay_db_port' THEN setting_value END) AS INTEGER),
  MAX(CASE WHEN setting_key='caps_relay_db_engine' THEN setting_value END),
  MAX(CASE WHEN setting_key='caps_relay_db_name' THEN setting_value END),
  MAX(CASE WHEN setting_key='caps_relay_db_user' THEN setting_value END),
  COALESCE(MAX(CASE WHEN setting_key='caps_relay_db_password' THEN setting_value END), ''),
  MAX(CASE WHEN setting_key='caps_relay_table' THEN setting_value END),
  CAST(MAX(CASE WHEN setting_key='caps_sync_enabled' THEN setting_value END) AS INTEGER),
  CAST(MAX(CASE WHEN setting_key='caps_sync_interval_min' THEN setting_value END) AS INTEGER),
  CAST(MAX(CASE WHEN setting_key='caps_sync_lookback_days' THEN setting_value END) AS INTEGER),
  MAX(CASE WHEN setting_key='caps_worker_endpoint' THEN setting_value END),
  MAX(CASE WHEN setting_key='caps_worker_api_key' THEN setting_value END),
  COALESCE(MAX(CASE WHEN setting_key='caps_ignored_fpids' THEN setting_value END), '[]'),
  MAX(CASE WHEN setting_key='caps_sync_last_ok_at' THEN setting_value END)
FROM settings
WHERE setting_key LIKE 'caps_%';

-- ---------- 2) caps_employee_map: site_id 추가 + UNIQUE 변경 ----------
-- SQLite는 ALTER로 UNIQUE 변경 불가 → 테이블 재생성
CREATE TABLE caps_employee_map_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id TEXT NOT NULL DEFAULT 'DJ',
  caps_e_idno TEXT NOT NULL,
  caps_e_name TEXT,
  caps_c_dept TEXT,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  is_active INTEGER DEFAULT 1,
  mapped_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  mapped_by INTEGER,
  notes TEXT,
  UNIQUE(site_id, caps_e_idno)
);

INSERT INTO caps_employee_map_v2 (id, site_id, caps_e_idno, caps_e_name, caps_c_dept, employee_id, is_active, mapped_at, mapped_by, notes)
  SELECT id, 'DJ', caps_e_idno, caps_e_name, caps_c_dept, employee_id, is_active, mapped_at, mapped_by, notes
  FROM caps_employee_map;

DROP TABLE caps_employee_map;
ALTER TABLE caps_employee_map_v2 RENAME TO caps_employee_map;

CREATE INDEX IF NOT EXISTS idx_caps_emp_map_site_idno ON caps_employee_map(site_id, caps_e_idno);
CREATE INDEX IF NOT EXISTS idx_caps_emp_map_employee ON caps_employee_map(employee_id);

-- ---------- 3) employees: caps_site_id 추가 ----------
ALTER TABLE employees ADD COLUMN caps_site_id TEXT DEFAULT NULL;
UPDATE employees SET caps_site_id = 'DJ' WHERE caps_id IS NOT NULL AND caps_id != '';

-- ---------- 4) attendance: caps_site_id 추가 ----------
ALTER TABLE attendance ADD COLUMN caps_site_id TEXT DEFAULT NULL;
UPDATE attendance SET caps_site_id = 'DJ' WHERE source = 'CAPS';

-- ---------- 5) caps_sync_log: site_id 추가 ----------
ALTER TABLE caps_sync_log ADD COLUMN site_id TEXT DEFAULT 'DJ';
UPDATE caps_sync_log SET site_id = 'DJ';
