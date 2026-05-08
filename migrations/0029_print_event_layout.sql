-- ============================================================================
-- Migration 0029: print_events 배열출력/분할출력/Cancel 실제 매수 필드 추가
-- ============================================================================

-- 배열출력 (Column × Row) 정보
ALTER TABLE print_events ADD COLUMN copy_columns INTEGER DEFAULT 1;
ALTER TABLE print_events ADD COLUMN copy_rows INTEGER DEFAULT 1;
ALTER TABLE print_events ADD COLUMN copy_total INTEGER DEFAULT 1;

-- 분할출력 (타일링) 정보
ALTER TABLE print_events ADD COLUMN tile_count INTEGER DEFAULT 0;
ALTER TABLE print_events ADD COLUMN tile_index INTEGER DEFAULT 0;

-- Cancel 시 수동 입력 필드
ALTER TABLE print_events ADD COLUMN actual_printed INTEGER;
ALTER TABLE print_events ADD COLUMN actual_printed_by TEXT;
ALTER TABLE print_events ADD COLUMN actual_printed_at DATETIME;
