-- Migration: 0004_add_hr_tables.sql
-- Purpose: 인사/급여 관리 시스템 테이블 생성
-- Created: 2026-02-12

-- 직원 정보
CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_code TEXT UNIQUE NOT NULL,               -- 사원번호 (예: EMP-001)
  user_id INTEGER,                                  -- users 테이블 연결 (로그인 계정)
  name TEXT NOT NULL,                                -- 이름
  name_eng TEXT,                                     -- 영문 이름
  resident_number TEXT,                              -- 주민등록번호 (암호화 권장)
  email TEXT,                                        -- 이메일
  phone TEXT,                                        -- 전화번호
  mobile TEXT,                                       -- 휴대폰
  address TEXT,                                      -- 주소
  
  department TEXT NOT NULL,                          -- 부서 (PRODUCTION, OFFICE, SALES)
  position TEXT NOT NULL,                            -- 직급 (STAFF, SENIOR, MANAGER, DIRECTOR)
  job_title TEXT,                                    -- 직책
  employment_type TEXT NOT NULL DEFAULT 'FULL_TIME', -- 고용형태 (FULL_TIME, PART_TIME, CONTRACT)
  
  hire_date DATE NOT NULL,                           -- 입사일
  resignation_date DATE,                             -- 퇴사일
  status TEXT NOT NULL DEFAULT 'ACTIVE',             -- 재직상태 (ACTIVE, LEAVE, RESIGNED)
  
  base_salary INTEGER DEFAULT 0,                     -- 기본급
  hourly_rate INTEGER DEFAULT 0,                     -- 시급 (시간제 근무자)
  
  bank_name TEXT,                                    -- 은행명
  bank_account TEXT,                                 -- 계좌번호
  
  emergency_contact TEXT,                            -- 비상연락처
  emergency_phone TEXT,                              -- 비상연락 전화번호
  
  notes TEXT,                                        -- 비고
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 근태 기록 (출퇴근)
CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,                      -- 직원 ID
  work_date DATE NOT NULL,                           -- 근무일
  check_in_time DATETIME,                            -- 출근 시간
  check_out_time DATETIME,                           -- 퇴근 시간
  work_hours REAL DEFAULT 0,                         -- 근무 시간 (시간)
  overtime_hours REAL DEFAULT 0,                     -- 초과 근무 시간
  
  attendance_type TEXT NOT NULL DEFAULT 'NORMAL',    -- 근태 유형 (NORMAL, LATE, EARLY_LEAVE, ABSENT, HOLIDAY, VACATION)
  status TEXT NOT NULL DEFAULT 'PRESENT',            -- 상태 (PRESENT, ABSENT, VACATION, SICK_LEAVE)
  
  notes TEXT,                                        -- 비고
  approved_by INTEGER,                               -- 승인자 (관리자)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (employee_id) REFERENCES employees(id),
  FOREIGN KEY (approved_by) REFERENCES users(id),
  UNIQUE(employee_id, work_date)                     -- 하루 1건만 기록
);

-- 휴가 신청
CREATE TABLE IF NOT EXISTS leave_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,                      -- 직원 ID
  leave_type TEXT NOT NULL,                          -- 휴가 유형 (ANNUAL, SICK, PERSONAL, MATERNITY)
  start_date DATE NOT NULL,                          -- 시작일
  end_date DATE NOT NULL,                            -- 종료일
  days REAL NOT NULL,                                -- 일수
  reason TEXT,                                       -- 사유
  status TEXT NOT NULL DEFAULT 'PENDING',            -- 상태 (PENDING, APPROVED, REJECTED)
  approved_by INTEGER,                               -- 승인자
  approved_at DATETIME,                              -- 승인 일시
  rejection_reason TEXT,                             -- 반려 사유
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (employee_id) REFERENCES employees(id),
  FOREIGN KEY (approved_by) REFERENCES users(id)
);

-- 급여 내역
CREATE TABLE IF NOT EXISTS payroll (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,                      -- 직원 ID
  pay_period TEXT NOT NULL,                          -- 급여 기간 (예: 2026-02)
  pay_date DATE NOT NULL,                            -- 지급일
  
  base_salary INTEGER NOT NULL DEFAULT 0,            -- 기본급
  overtime_pay INTEGER DEFAULT 0,                    -- 초과근무수당
  night_pay INTEGER DEFAULT 0,                       -- 야간근무수당
  holiday_pay INTEGER DEFAULT 0,                     -- 휴일근무수당
  meal_allowance INTEGER DEFAULT 0,                  -- 식대
  transportation_allowance INTEGER DEFAULT 0,        -- 교통비
  other_allowance INTEGER DEFAULT 0,                 -- 기타 수당
  
  total_salary INTEGER NOT NULL DEFAULT 0,           -- 총 급여
  
  national_pension INTEGER DEFAULT 0,                -- 국민연금
  health_insurance INTEGER DEFAULT 0,                -- 건강보험
  employment_insurance INTEGER DEFAULT 0,            -- 고용보험
  income_tax INTEGER DEFAULT 0,                      -- 소득세
  local_tax INTEGER DEFAULT 0,                       -- 지방세
  other_deduction INTEGER DEFAULT 0,                 -- 기타 공제
  
  total_deduction INTEGER NOT NULL DEFAULT 0,        -- 총 공제
  net_pay INTEGER NOT NULL DEFAULT 0,                -- 실지급액
  
  work_days REAL DEFAULT 0,                          -- 근무일수
  overtime_hours REAL DEFAULT 0,                     -- 초과근무시간
  
  status TEXT NOT NULL DEFAULT 'PENDING',            -- 상태 (PENDING, APPROVED, PAID)
  paid_at DATETIME,                                  -- 지급 일시
  
  notes TEXT,                                        -- 비고
  created_by INTEGER,                                -- 생성자
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (employee_id) REFERENCES employees(id),
  FOREIGN KEY (created_by) REFERENCES users(id),
  UNIQUE(employee_id, pay_period)                    -- 월 1회 급여
);

-- 급여 명세서 상세 (추가 항목)
CREATE TABLE IF NOT EXISTS payroll_details (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payroll_id INTEGER NOT NULL,                       -- 급여 ID
  detail_type TEXT NOT NULL,                         -- 유형 (ALLOWANCE, DEDUCTION)
  item_name TEXT NOT NULL,                           -- 항목명
  amount INTEGER NOT NULL,                           -- 금액
  notes TEXT,                                        -- 비고
  
  FOREIGN KEY (payroll_id) REFERENCES payroll(id)
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_employees_code ON employees(employee_code);
CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(department);
CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status);
CREATE INDEX IF NOT EXISTS idx_attendance_employee ON attendance(employee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(work_date);
CREATE INDEX IF NOT EXISTS idx_leave_requests_employee ON leave_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_payroll_employee ON payroll(employee_id);
CREATE INDEX IF NOT EXISTS idx_payroll_period ON payroll(pay_period);
