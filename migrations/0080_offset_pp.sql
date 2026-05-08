-- ============================================================================
-- Migration 0080: 오프셋(다이컷) PP 옵션 추가
-- 디자인 윤곽선(클리핑 패스) 기준 오프셋 재단선(M100) + 가장자리 색상 확장
-- ============================================================================

-- 1. OFFSET PP 옵션 삽입
INSERT INTO post_processing_options (
  option_code, option_name,
  margin_left, margin_right, margin_top, margin_bottom,
  additional_cost, description, is_active,
  pricing_type, unit_price,
  parameter_schema, pp_category
) VALUES (
  'OFFSET', '오프셋(다이컷)',
  0, 0, 0, 0,
  0, '디자인 윤곽선 기준 오프셋 재단선 + 여백 색상 확장', 1,
  'fixed', 0,
  '{"fields":[{"key":"offset_distance","label":"오프셋 거리","type":"number","unit":"mm","default":3,"min":1,"max":20}]}',
  'offset'
);

-- 2. OFFSET ↔ 소분류 연결 (시트, 평판출력, 간판 계열)
INSERT OR IGNORE INTO pp_option_subcategories (pp_option_id, subcat_id)
  SELECT p.id, s.id
  FROM post_processing_options p, pp_applicable_subcategories s
  WHERE p.option_code = 'OFFSET'
    AND s.subcat_name IN ('시트', '평판출력', '원형간판', '채널간판', '프레임간판', '갈바');
