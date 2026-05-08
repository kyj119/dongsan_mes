-- ============================================================================
-- Phase B0: employees 테이블에 급여 계산용 컬럼 추가
-- - 부양가족수, 20세 이하 자녀수 → 근로소득 간이세액표 조회용
-- - 소득세 옵션 (80%/100%/120%) → 직원이 선택 가능
-- - 건강보험 등급(선택, 보수월액 제한 등 특수 사례용)
-- - 호봉/직위코드 등 외부 시스템(CAPS) 매핑용 보조 컬럼
-- 결정사항 #13 (Phase B 공제 항목 자동 계산) 반영
-- ============================================================================

ALTER TABLE employees ADD COLUMN dependents_count INTEGER DEFAULT 0;
ALTER TABLE employees ADD COLUMN children_under_20_count INTEGER DEFAULT 0;
ALTER TABLE employees ADD COLUMN income_tax_table_option TEXT DEFAULT '100';
  -- '80' / '100' / '120' — 근로소득 간이세액표 적용 비율 (직원 선택)
ALTER TABLE employees ADD COLUMN insurance_grade TEXT;
  -- 건강보험 등급 (예: 상한선 적용 등 특수 케이스)

-- CAPS(출퇴근 시스템) 매핑용
ALTER TABLE employees ADD COLUMN caps_employee_code TEXT;
  -- CAPS 시스템 사번 (employees.employee_code 와 다를 수 있음)
ALTER TABLE employees ADD COLUMN caps_sync_enabled INTEGER DEFAULT 1;
  -- 0 = CAPS 동기화 제외, 1 = 동기화 대상

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_employees_caps_code ON employees(caps_employee_code);
