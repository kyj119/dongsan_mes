-- ============================================================================
-- Migration 0028: 펀칭 마크 그룹 안쪽 이동 + 오타 수정
-- ============================================================================

-- 1. 펀칭 여백 0 (마크가 그룹 안쪽이므로 bleed 불필요)
UPDATE post_processing_options
SET margin_left = 0, margin_right = 0, margin_top = 0, margin_bottom = 0
WHERE option_code = 'PUNCHING';

-- 2. 오타 수정 (DB에 '펹칭'으로 저장되어 있을 수 있음)
UPDATE post_processing_options SET option_name = '펀칭' WHERE option_code = 'PUNCHING';
