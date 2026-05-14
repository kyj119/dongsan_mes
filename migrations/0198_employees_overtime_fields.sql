-- 직원 고정연장 설정 + 시급 자동 계산 지원
ALTER TABLE employees ADD COLUMN overtime_daily_hours REAL DEFAULT 0;
ALTER TABLE employees ADD COLUMN overtime_work_days INTEGER DEFAULT 22;
