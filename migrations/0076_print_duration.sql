-- 인쇄 소요시간 자동 계산용 칼럼 추가
-- print_started_at, print_completed_at 차이를 초 단위로 저장
ALTER TABLE print_events ADD COLUMN print_duration_sec INTEGER;
