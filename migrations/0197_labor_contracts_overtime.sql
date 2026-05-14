-- 고정 연장근무 설정 필드 추가
ALTER TABLE labor_contracts ADD COLUMN base_hours_monthly REAL DEFAULT 209;
ALTER TABLE labor_contracts ADD COLUMN overtime_daily_hours REAL DEFAULT 0;
ALTER TABLE labor_contracts ADD COLUMN overtime_work_days INTEGER DEFAULT 22;
ALTER TABLE labor_contracts ADD COLUMN monthly_salary INTEGER DEFAULT 0;
