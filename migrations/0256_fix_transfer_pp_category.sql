-- ============================================================================
-- Migration 0256: 전사 PP 옵션 카테고리 수정
-- finish → transfer (방향별 UI가 아닌 파라미터 기반 UI 사용)
-- ============================================================================

UPDATE post_processing_options SET pp_category = 'transfer' WHERE option_code = 'PP-GROMMET';
UPDATE post_processing_options SET pp_category = 'transfer' WHERE option_code = 'PP-NONWOVEN';
UPDATE post_processing_options SET pp_category = 'transfer' WHERE option_code = 'PP-TASSEL';
