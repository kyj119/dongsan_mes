-- 0467: 급여명세서 셀프교부 (직원 셀프서비스 B3)
-- published_at = admin이 직원에게 '교부(공개)'한 시각 (NULL=미교부, 셀프 노출 게이트)
-- payslip_issuance_logs = 근로기준법 급여명세서 교부의무 증빙 (교부 시각 + 직원 열람 이력)

ALTER TABLE payroll ADD COLUMN published_at TEXT;  -- 직원 공개(교부) 시각

CREATE TABLE IF NOT EXISTS payslip_issuance_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payroll_id INTEGER NOT NULL,
  employee_id INTEGER NOT NULL,
  entity_id INTEGER,
  pay_period TEXT NOT NULL,
  issued_at TEXT,            -- admin 교부(공개) 시각
  issued_by INTEGER,         -- 교부 처리자 user id
  first_viewed_at TEXT,      -- 직원 최초 열람
  last_viewed_at TEXT,       -- 직원 최근 열람
  view_count INTEGER DEFAULT 0,
  viewed_ip TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(payroll_id)
);
CREATE INDEX IF NOT EXISTS idx_payslip_issuance_period ON payslip_issuance_logs(pay_period);
CREATE INDEX IF NOT EXISTS idx_payslip_issuance_emp ON payslip_issuance_logs(employee_id);
