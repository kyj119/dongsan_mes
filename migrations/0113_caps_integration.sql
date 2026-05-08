-- ============================================================================
-- Phase B2: CAPS 근태 시스템 연동 (Method A: ODBC DB 릴레이)
--
-- 연동 구조:
--   [경리 PC CAPS ACServer] → ODBC → [NAS/MES 릴레이 DB nOutput]
--                                              ↓ (MES worker poll)
--                                    [Cloudflare D1 attendance]
--
-- 릴레이 DB nOutput 스키마 (ACServer 사양 — 참고용, 실제 DB는 외부):
--   fpid LONG, c_dept VARCHAR(20), c_position VARCHAR(8),
--   e_group SHORT(5), e_idno VARCHAR(30), e_name VARCHAR(30),
--   d_date VARCHAR(8), n_date VARCHAR(31),
--   in_time VARCHAR(6), out_time VARCHAR(6),
--   leave_time VARCHAR(6), return_time VARCHAR(6),
--   late_time VARCHAR(4), ealry_time VARCHAR(4),
--   over_time VARCHAR(4), night_time VARCHAR(4), total_time VARCHAR(4)
--
-- D1에는 CAPS 원본을 그대로 미러링하는 스테이징 테이블을 만들지 않고,
-- attendance 테이블에 source 필드를 두어 구분한다.
-- ============================================================================

-- ---------- 1) attendance 테이블에 CAPS 관련 필드 추가 ----------
ALTER TABLE attendance ADD COLUMN source TEXT DEFAULT 'MANUAL';
  -- 'CAPS' | 'MANUAL' | 'CAPS_EDITED' (CAPS에서 불러온 후 수동 수정)
ALTER TABLE attendance ADD COLUMN caps_fpid INTEGER;
  -- CAPS 원본 레코드의 fpid (고유키, 재동기화 시 중복 방지)
ALTER TABLE attendance ADD COLUMN caps_e_idno TEXT;
  -- CAPS 사원번호 (e_idno, 매핑 확인용)
ALTER TABLE attendance ADD COLUMN caps_late_min INTEGER DEFAULT 0;
  -- 지각 시간 (분)
ALTER TABLE attendance ADD COLUMN caps_early_min INTEGER DEFAULT 0;
  -- 조퇴 시간 (분)
ALTER TABLE attendance ADD COLUMN caps_over_min INTEGER DEFAULT 0;
  -- 연장근무 시간 (분)
ALTER TABLE attendance ADD COLUMN caps_night_min INTEGER DEFAULT 0;
  -- 야간근무 시간 (분)
ALTER TABLE attendance ADD COLUMN caps_total_min INTEGER DEFAULT 0;
  -- 총 근무시간 (분)
ALTER TABLE attendance ADD COLUMN caps_raw_json TEXT;
  -- CAPS 원본 레코드 JSON (감사용)
ALTER TABLE attendance ADD COLUMN caps_synced_at DATETIME;
  -- CAPS에서 이 레코드를 가져온 시점

CREATE INDEX IF NOT EXISTS idx_attendance_caps_fpid ON attendance(caps_fpid);
CREATE INDEX IF NOT EXISTS idx_attendance_source ON attendance(source);

-- ---------- 2) caps_sync_log: CAPS 동기화 이력 ----------
CREATE TABLE IF NOT EXISTS caps_sync_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  finished_at DATETIME,
  status TEXT NOT NULL DEFAULT 'RUNNING',
    -- 'RUNNING' | 'SUCCESS' | 'FAILED' | 'PARTIAL'
  fetched_count INTEGER DEFAULT 0,   -- 릴레이 DB에서 읽은 행 수
  inserted_count INTEGER DEFAULT 0,  -- 신규 삽입
  updated_count INTEGER DEFAULT 0,   -- 기존 업데이트 (수동수정분 제외)
  skipped_count INTEGER DEFAULT 0,   -- 이미 수동수정된 건 등
  error_count INTEGER DEFAULT 0,
  error_message TEXT,
  trigger_type TEXT DEFAULT 'SCHEDULED',
    -- 'SCHEDULED' | 'MANUAL' | 'WEBHOOK'
  triggered_by INTEGER,              -- users.id (수동 트리거 시)
  from_date DATE,
  to_date DATE,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_caps_sync_log_started_at ON caps_sync_log(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_caps_sync_log_status ON caps_sync_log(status);

-- ---------- 3) caps_employee_map: CAPS 사원번호 ↔ employees 매핑 ----------
-- 이미 employees.caps_employee_code가 있지만, 역매핑 조회 속도와 다중 매핑 대응용
CREATE TABLE IF NOT EXISTS caps_employee_map (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  caps_e_idno TEXT NOT NULL UNIQUE,   -- CAPS의 e_idno (사원번호)
  caps_e_name TEXT,                    -- CAPS의 e_name (이름, 매칭 확인용)
  caps_c_dept TEXT,                    -- CAPS의 부서
  employee_id INTEGER NOT NULL,        -- employees.id 매핑
  is_active INTEGER DEFAULT 1,
  mapped_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  mapped_by INTEGER,                   -- users.id
  notes TEXT,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_caps_employee_map_e_idno ON caps_employee_map(caps_e_idno);
CREATE INDEX IF NOT EXISTS idx_caps_employee_map_employee ON caps_employee_map(employee_id);

-- ---------- 4) settings 키 추가 ----------
INSERT OR IGNORE INTO settings (setting_key, setting_value, description) VALUES
  ('caps_relay_db_host',       '192.168.0.122', 'CAPS 릴레이 DB 호스트 (NAS)'),
  ('caps_relay_db_port',       '3306',          'CAPS 릴레이 DB 포트 (MySQL 3306 / PostgreSQL 5432)'),
  ('caps_relay_db_engine',     'mysql',         'CAPS 릴레이 DB 엔진 (mysql/postgresql)'),
  ('caps_relay_db_name',       'caps_relay',    'CAPS 릴레이 DB 이름'),
  ('caps_relay_db_user',       'mes_reader',    'CAPS 릴레이 DB 읽기 계정 (SELECT 전용)'),
  ('caps_relay_db_password',   '',              'CAPS 릴레이 DB 비밀번호 (시크릿)'),
  ('caps_relay_table',         'nOutput',       'CAPS 릴레이 DB 테이블명'),
  ('caps_sync_enabled',        '0',             'CAPS 자동 동기화 활성화 (0=off, 1=on)'),
  ('caps_sync_interval_min',   '15',            'CAPS 자동 동기화 주기 (분)'),
  ('caps_sync_lookback_days',  '3',             'CAPS 동기화 시 과거 N일 재조회 (지연 이체 대응)'),
  ('caps_sync_last_ok_at',     '',              'CAPS 마지막 성공 동기화 시각'),
  ('caps_worker_endpoint',     '',              'CAPS 동기화를 실행하는 on-prem 워커 URL (내부망)'),
  ('caps_worker_api_key',      '',              'CAPS 동기화 워커 인증 키 (X-Agent-Key)');
