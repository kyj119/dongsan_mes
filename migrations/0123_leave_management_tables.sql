-- ============================================================================
-- 연차/휴가 관리 확장
-- 기존: leave_balances (0110), leave_requests (0004)
-- 추가: leave_types (설정 테이블), family_event_rules (경조휴가 기준)
-- 변경: leave_requests에 created_by 컬럼 추가
-- ============================================================================

-- 1. 휴가 유형 설정 (관리자가 설정 가능)
CREATE TABLE IF NOT EXISTS leave_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,           -- ANNUAL, HALF_AM, HALF_PM, QUARTER_1~4, SICK, FAMILY_EVENT
  name TEXT NOT NULL,                  -- 표시 이름
  category TEXT NOT NULL DEFAULT 'ANNUAL',  -- ANNUAL(연차계열), SICK(병가), FAMILY(경조), SPECIAL(특별)
  deduction_days REAL NOT NULL DEFAULT 1.0, -- 연차 차감일수 (연차=1, 반차=0.5, 반반차=0.25, 병가=0)
  time_from TEXT,                      -- 시작 시간 (예: '08:30', '13:00') — 반차/반반차용
  time_to TEXT,                        -- 종료 시간 (예: '12:00', '18:00') — 반차/반반차용
  is_paid INTEGER NOT NULL DEFAULT 1,  -- 유급 여부
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 2. 경조휴가 기준 설정
CREATE TABLE IF NOT EXISTS family_event_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_name TEXT NOT NULL UNIQUE,     -- 예: '본인 결혼', '자녀 결혼', '부모 사망' 등
  paid_days INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 3. leave_requests에 created_by 추가
ALTER TABLE leave_requests ADD COLUMN created_by INTEGER REFERENCES users(id);

-- ============================================================================
-- 기본 데이터 시드
-- ============================================================================

-- 기본 휴가 유형
INSERT OR IGNORE INTO leave_types (code, name, category, deduction_days, time_from, time_to, is_paid, sort_order) VALUES
  ('ANNUAL', '연차', 'ANNUAL', 1.0, NULL, NULL, 1, 1),
  ('HALF_AM', '오전반차', 'ANNUAL', 0.5, '08:30', '12:00', 1, 2),
  ('HALF_PM', '오후반차', 'ANNUAL', 0.5, '13:00', '18:00', 1, 3),
  ('QUARTER_1', '반반차(08:30~10:00)', 'ANNUAL', 0.25, '08:30', '10:00', 1, 4),
  ('QUARTER_2', '반반차(10:00~12:00)', 'ANNUAL', 0.25, '10:00', '12:00', 1, 5),
  ('QUARTER_3', '반반차(13:00~16:00)', 'ANNUAL', 0.25, '13:00', '16:00', 1, 6),
  ('QUARTER_4', '반반차(16:00~18:00)', 'ANNUAL', 0.25, '16:00', '18:00', 1, 7),
  ('SICK', '병가', 'SICK', 0, NULL, NULL, 1, 10),
  ('FAMILY_EVENT', '경조휴가', 'FAMILY', 0, NULL, NULL, 1, 20);

-- 기본 경조휴가 기준
INSERT OR IGNORE INTO family_event_rules (event_name, paid_days, sort_order) VALUES
  ('본인 결혼', 5, 1),
  ('자녀 결혼', 1, 2),
  ('부모 사망', 5, 3),
  ('배우자 부모 사망', 5, 4),
  ('조부모 사망', 3, 5),
  ('형제자매 사망', 3, 6),
  ('배우자 사망', 5, 7),
  ('자녀 사망', 5, 8),
  ('배우자 출산', 10, 9);
