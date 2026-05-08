-- 지각 분(late_minutes): 출근시간 - 08:30, 분 단위 기록
-- LATE 타입 대신 NORMAL + late_minutes > 0 으로 지각 표시
ALTER TABLE attendance ADD COLUMN late_minutes INTEGER DEFAULT 0;
