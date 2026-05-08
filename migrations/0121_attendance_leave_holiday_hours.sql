-- 조퇴시간: 18:00 이전 퇴근 시 ceil((18:00-퇴근시간)/30분)*0.5h
ALTER TABLE attendance ADD COLUMN early_leave_hours REAL DEFAULT 0;

-- 휴일근무시간: 토/일 근무 시 전체 근무시간 (1.5배 수당 계산용, 연장근무와 분리)
ALTER TABLE attendance ADD COLUMN holiday_work_hours REAL DEFAULT 0;
