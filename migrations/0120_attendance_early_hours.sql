-- 조기출근 시간 컬럼 추가
-- 07:30 이전 출근 시 (08:30 - 출근시간)을 30분 단위로 절사하여 기록
ALTER TABLE attendance ADD COLUMN early_hours REAL DEFAULT 0;
