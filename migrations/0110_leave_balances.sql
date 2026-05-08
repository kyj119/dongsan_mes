-- ============================================================================
-- Phase B3: 연차 잔여 관리 테이블
-- 결정사항 #15 (근로기준법 준수): 1년 미만 월 1일(최대 11), 1년 15일,
-- 3년차부터 2년마다 1일 가산 (최대 25일)
-- ============================================================================

-- 직원-연도별 연차 부여/사용 잔액
CREATE TABLE IF NOT EXISTS leave_balances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  year INTEGER NOT NULL,                       -- 회계연도 또는 입사년도 기준 (기본 입사일 기준 연차)
  leave_type TEXT NOT NULL DEFAULT 'ANNUAL',   -- 'ANNUAL' / 'MONTHLY_GRANT' (1년 미만 월차)
  accrued REAL NOT NULL DEFAULT 0,             -- 누적 부여 (근로기준법 자동 계산)
  granted_extra REAL NOT NULL DEFAULT 0,       -- 별도 부여 (특별 휴가, 보상 등)
  used REAL NOT NULL DEFAULT 0,                -- 사용 일수
  carried_over REAL NOT NULL DEFAULT 0,        -- 전년 이월 (현재는 사용 안 함, 향후 옵션)
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(employee_id, year, leave_type),
  FOREIGN KEY (employee_id) REFERENCES employees(id)
);

CREATE INDEX IF NOT EXISTS idx_leave_balances_employee ON leave_balances(employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_balances_year ON leave_balances(year);

-- 연차 적립 이력 (감사 추적용)
CREATE TABLE IF NOT EXISTS leave_accrual_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  year INTEGER NOT NULL,
  accrual_type TEXT NOT NULL,                  -- 'MONTHLY' (1년 미만 월 1일) / 'YEARLY' (1년차 15일) / 'TENURE_BONUS' (가산)
  days REAL NOT NULL,                          -- 부여된 일수
  reason TEXT,                                 -- 사유 메모
  run_at DATETIME DEFAULT CURRENT_TIMESTAMP,   -- 실행 시각
  run_by INTEGER,                              -- 실행자 (자동 batch면 NULL)
  FOREIGN KEY (employee_id) REFERENCES employees(id),
  FOREIGN KEY (run_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_leave_accrual_logs_employee ON leave_accrual_logs(employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_accrual_logs_year ON leave_accrual_logs(year);
