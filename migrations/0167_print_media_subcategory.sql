-- ============================================================================
-- Migration 0167: 소재(print_media)에 소분류 연결
-- 출력품목의 후가공 옵션을 소재의 소분류를 통해 로드
-- ============================================================================

ALTER TABLE print_media ADD COLUMN subcategory_id INTEGER REFERENCES item_subcategories(id) ON DELETE SET NULL;
