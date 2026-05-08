-- 급여 유형: VARIABLE(변동급, 기본값), FIXED(고정급/포괄임금)
-- VARIABLE: 근태관리 O, 연장근무 수당 O
-- FIXED: 근태관리 X (출퇴근 기록 안 함), 연장근무 수당 X
ALTER TABLE employees ADD COLUMN pay_type TEXT NOT NULL DEFAULT 'VARIABLE';
