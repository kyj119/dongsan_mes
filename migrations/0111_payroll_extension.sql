-- Phase B1-1: 급여 시스템 확장
-- 1) payroll 테이블 컬럼 확장 (장기요양보험 등)
-- 2) insurance_rates 테이블 (4대보험 요율 마스터)
-- 3) income_tax_table 테이블 (근로소득 간이세액표)
-- 4) settings 키 추가 (급여 정책)

-- ============================================================
-- 1) payroll 테이블 컬럼 확장
-- ============================================================
ALTER TABLE payroll ADD COLUMN long_term_care_insurance INTEGER DEFAULT 0;  -- 장기요양보험 (건강보험의 12.81%)
ALTER TABLE payroll ADD COLUMN annual_leave_pay INTEGER DEFAULT 0;          -- 연차수당
ALTER TABLE payroll ADD COLUMN bonus INTEGER DEFAULT 0;                      -- 상여금
ALTER TABLE payroll ADD COLUMN nontax_meal INTEGER DEFAULT 0;                -- 비과세 식대 (월 20만원 한도)
ALTER TABLE payroll ADD COLUMN nontax_transport INTEGER DEFAULT 0;           -- 비과세 자가운전보조금 (월 20만원 한도)
ALTER TABLE payroll ADD COLUMN nontax_childcare INTEGER DEFAULT 0;           -- 비과세 육아수당 (월 20만원 한도)
ALTER TABLE payroll ADD COLUMN taxable_pay INTEGER DEFAULT 0;                -- 과세 대상 급여 (간이세액표 적용 기준)

-- 회사 부담분 (사용자가 부담하는 4대보험)
ALTER TABLE payroll ADD COLUMN employer_national_pension INTEGER DEFAULT 0;
ALTER TABLE payroll ADD COLUMN employer_health_insurance INTEGER DEFAULT 0;
ALTER TABLE payroll ADD COLUMN employer_long_term_care INTEGER DEFAULT 0;
ALTER TABLE payroll ADD COLUMN employer_employment_insurance INTEGER DEFAULT 0;
ALTER TABLE payroll ADD COLUMN employer_industrial_accident INTEGER DEFAULT 0;  -- 산재보험 (전액 회사부담)

-- 근태 연동 (CAPS)
ALTER TABLE payroll ADD COLUMN absent_days REAL DEFAULT 0;                   -- 결근일수
ALTER TABLE payroll ADD COLUMN late_count INTEGER DEFAULT 0;                 -- 지각 횟수
ALTER TABLE payroll ADD COLUMN leave_used_days REAL DEFAULT 0;               -- 사용 연차 (해당 월)
ALTER TABLE payroll ADD COLUMN attendance_synced_at DATETIME;                -- 근태 동기화 시점

-- 결재
ALTER TABLE payroll ADD COLUMN approved_by INTEGER;                          -- 승인자
ALTER TABLE payroll ADD COLUMN approved_at DATETIME;                         -- 승인 시점

-- ============================================================
-- 2) insurance_rates: 4대보험 요율 마스터
-- ============================================================
CREATE TABLE IF NOT EXISTS insurance_rates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  year INTEGER NOT NULL,                              -- 적용 연도
  insurance_type TEXT NOT NULL,                       -- NATIONAL_PENSION, HEALTH, LONG_TERM_CARE, EMPLOYMENT, INDUSTRIAL_ACCIDENT
  total_rate REAL NOT NULL,                           -- 전체 요율 (%)
  employee_rate REAL NOT NULL DEFAULT 0,              -- 근로자 부담 (%)
  employer_rate REAL NOT NULL DEFAULT 0,              -- 사용자 부담 (%)
  base TEXT NOT NULL DEFAULT 'TAXABLE_PAY',           -- 산정 기준 (TAXABLE_PAY, HEALTH_INSURANCE)
  min_base INTEGER,                                   -- 하한 (월보수액)
  max_base INTEGER,                                   -- 상한 (월보수액)
  effective_from DATE NOT NULL,
  effective_to DATE,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(year, insurance_type)
);

CREATE INDEX IF NOT EXISTS idx_insurance_rates_year ON insurance_rates(year);

-- ============================================================
-- 3) income_tax_table: 근로소득 간이세액표
-- 월급여 구간별 × 부양가족수별 원천징수액
-- ============================================================
CREATE TABLE IF NOT EXISTS income_tax_table (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  year INTEGER NOT NULL,                              -- 적용 연도 (2026)
  monthly_pay_min INTEGER NOT NULL,                   -- 월급여 하한 (이상)
  monthly_pay_max INTEGER NOT NULL,                   -- 월급여 상한 (미만)
  dependents_1 INTEGER DEFAULT 0,                     -- 부양가족 1명 (본인) 세액
  dependents_2 INTEGER DEFAULT 0,                     -- 부양가족 2명 세액
  dependents_3 INTEGER DEFAULT 0,
  dependents_4 INTEGER DEFAULT 0,
  dependents_5 INTEGER DEFAULT 0,
  dependents_6 INTEGER DEFAULT 0,
  dependents_7 INTEGER DEFAULT 0,
  dependents_8 INTEGER DEFAULT 0,
  dependents_9 INTEGER DEFAULT 0,
  dependents_10 INTEGER DEFAULT 0,
  dependents_11 INTEGER DEFAULT 0,                    -- 11명 이상
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_income_tax_table_lookup ON income_tax_table(year, monthly_pay_min);

-- ============================================================
-- 4) settings: 급여 정책 키
-- ============================================================
INSERT OR IGNORE INTO settings (setting_key, setting_value, description) VALUES
  ('payroll_pay_day', '10', '매월 급여 지급일 (1~31)'),
  ('payroll_period_type', 'PREVIOUS_MONTH', '급여 산정 기준 (PREVIOUS_MONTH=전월/CURRENT_MONTH=당월)'),
  ('payroll_meal_allowance_nontax_max', '200000', '식대 비과세 한도 (월)'),
  ('payroll_transport_allowance_nontax_max', '200000', '자가운전보조금 비과세 한도 (월)'),
  ('payroll_childcare_allowance_nontax_max', '200000', '육아수당 비과세 한도 (만 6세 이하)'),
  ('payroll_default_work_days', '22', '월 기본 근무일수 (소정근로일)'),
  ('payroll_default_work_hours', '209', '월 소정근로시간'),
  ('payroll_overtime_multiplier', '1.5', '연장근로 가산율'),
  ('payroll_night_multiplier', '0.5', '야간근로 가산율 (오후 10시~오전 6시)'),
  ('payroll_holiday_multiplier', '1.5', '휴일근로 가산율 (8시간 이내)'),
  ('payroll_caps_webhook_secret', '', 'CAPS AC Server 웹훅 인증 시크릿');
