-- employees 테이블에 caps_id 컬럼 추가
-- CAPS ACServer의 고유 사원번호(e_idno)를 직접 저장하여 매핑 단순화
-- 기존 caps_employee_map 테이블은 유지 (하위 호환)
ALTER TABLE employees ADD COLUMN caps_id TEXT;

-- UNIQUE 인덱스: 같은 CAPS 번호가 두 직원에 매핑되지 않도록
CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_caps_id ON employees(caps_id) WHERE caps_id IS NOT NULL AND caps_id != '';
