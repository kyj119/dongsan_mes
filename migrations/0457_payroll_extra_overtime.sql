-- 급여: 추가연장시간 별도 저장 (기본연장/추가연장 분리 표기용)
-- overtime_hours = 고정연장(11h 등, 포괄임금 내재) + extra_overtime_hours(근태 실측: 연장+조기출근)
-- extra_overtime_hours 만 별도 컬럼으로 분리 → 화면에서 기본/추가 분해 표기 가능
--   기본연장 = overtime_hours - extra_overtime_hours
--   추가연장 = extra_overtime_hours
ALTER TABLE payroll ADD COLUMN extra_overtime_hours REAL DEFAULT 0;
