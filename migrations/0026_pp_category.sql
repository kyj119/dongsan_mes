-- ============================================================================
-- Migration 0026: PP 카테고리 컬럼 추가 + 펀칭 스키마 업데이트
-- ============================================================================

-- 1. pp_category 컬럼 추가
-- 'finish'     = 마감 후가공 (상호배타, 여백 추가)
-- 'punching'   = 펀칭 (독립, 고정 여백)
-- 'annotation' = 주석 (여백 의존)
ALTER TABLE post_processing_options ADD COLUMN pp_category TEXT DEFAULT 'finish';

-- 2. 기존 옵션 카테고리 설정
UPDATE post_processing_options SET pp_category = 'punching' WHERE option_code = 'PUNCHING';
UPDATE post_processing_options SET pp_category = 'annotation' WHERE option_code = 'ANNOTATION';

-- 3. 펀칭 parameter_schema 업데이트 (corners: toggle → number)
UPDATE post_processing_options
SET parameter_schema = '{"fields":[{"key":"corner_tl","label":"좌상","type":"number","default":0,"max":1},{"key":"side_top","label":"상","type":"number","unit":"개","default":0},{"key":"corner_tr","label":"우상","type":"number","default":0,"max":1},{"key":"side_left","label":"좌","type":"number","unit":"개","default":0},{"key":"side_right","label":"우","type":"number","unit":"개","default":0},{"key":"corner_bl","label":"좌하","type":"number","default":0,"max":1},{"key":"side_bottom","label":"하","type":"number","unit":"개","default":0},{"key":"corner_br","label":"우하","type":"number","default":0,"max":1}],"layout":"punching_grid"}'
WHERE option_code = 'PUNCHING';
