-- #66: 프린터별 작업 큐 & 예상 완료시간
ALTER TABLE equipment ADD COLUMN avg_print_minutes_per_sqm REAL DEFAULT 0;
ALTER TABLE equipment ADD COLUMN working_hours_start TEXT DEFAULT '09:00';
ALTER TABLE equipment ADD COLUMN working_hours_end TEXT DEFAULT '18:00';

ALTER TABLE cards ADD COLUMN estimated_minutes REAL;
ALTER TABLE cards ADD COLUMN queue_position INTEGER;
ALTER TABLE cards ADD COLUMN estimated_start_at DATETIME;
ALTER TABLE cards ADD COLUMN estimated_end_at DATETIME;
