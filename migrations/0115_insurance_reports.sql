-- ============================================================================
-- 0115: 4대보험 신고서 (Insurance Report) 테이블
-- Phase B5: 월별 4대보험 신고 데이터 저장 + 취득/상실 신고 이력
-- ============================================================================

-- 월별 4대보험 신고 마스터
CREATE TABLE IF NOT EXISTS insurance_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,           -- 1~12
  report_type TEXT NOT NULL,        -- MONTHLY(정기) / ACQUISITION(취득) / LOSS(상실)
  status TEXT NOT NULL DEFAULT 'DRAFT',  -- DRAFT / SUBMITTED / CONFIRMED

  -- 집계 요약
  employee_count INTEGER DEFAULT 0,
  total_national_pension INTEGER DEFAULT 0,
  total_health_insurance INTEGER DEFAULT 0,
  total_long_term_care INTEGER DEFAULT 0,
  total_employment_insurance INTEGER DEFAULT 0,
  total_industrial_accident INTEGER DEFAULT 0,  -- 산재보험 (회사 부담)
  employer_national_pension INTEGER DEFAULT 0,
  employer_health_insurance INTEGER DEFAULT 0,
  employer_long_term_care INTEGER DEFAULT 0,
  employer_employment_insurance INTEGER DEFAULT 0,
  grand_total_employee INTEGER DEFAULT 0,   -- 근로자 부담 합계
  grand_total_employer INTEGER DEFAULT 0,   -- 회사 부담 합계
  grand_total INTEGER DEFAULT 0,            -- 전체 합계

  notes TEXT,
  submitted_at TEXT,
  confirmed_by INTEGER,
  confirmed_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),

  UNIQUE(year, month, report_type)
);

-- 월별 4대보험 신고 직원별 상세
CREATE TABLE IF NOT EXISTS insurance_report_details (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL,
  employee_id INTEGER NOT NULL,
  employee_name TEXT,
  rrn TEXT,                         -- 주민등록번호 (신고서 필수)
  base_salary INTEGER DEFAULT 0,    -- 보수월액 (보험료 산정 기준)

  -- 근로자 부담
  national_pension INTEGER DEFAULT 0,
  health_insurance INTEGER DEFAULT 0,
  long_term_care INTEGER DEFAULT 0,
  employment_insurance INTEGER DEFAULT 0,

  -- 회사 부담
  employer_national_pension INTEGER DEFAULT 0,
  employer_health_insurance INTEGER DEFAULT 0,
  employer_long_term_care INTEGER DEFAULT 0,
  employer_employment_insurance INTEGER DEFAULT 0,
  employer_industrial_accident INTEGER DEFAULT 0,

  -- 취득/상실 신고 전용
  acquisition_date TEXT,            -- 취득일
  loss_date TEXT,                   -- 상실일
  loss_reason TEXT,                 -- 상실사유

  FOREIGN KEY (report_id) REFERENCES insurance_reports(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_insurance_reports_ym ON insurance_reports(year, month);
CREATE INDEX IF NOT EXISTS idx_insurance_report_details_rid ON insurance_report_details(report_id);
