-- ============================================================================
-- Migration 0252: 전사/깃발 후가공 옵션 추가 (작업지시서 통합)
-- 하도매(PP-GROMMET), 부직포(PP-NONWOVEN), 수술(PP-TASSEL) + subcategory 연결
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. 전사 소분류 추가 (pp_applicable_subcategories)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO pp_applicable_subcategories (group_name, subcat_name, sort_order) VALUES
  ('전사', '윈드배너', 20),
  ('전사', '가로등배너', 21),
  ('전사', '정기', 22),
  ('전사', '군기', 23),
  ('전사', '탁상기', 24),
  ('전사', '근조기', 25),
  ('전사', '워킹배너', 26),
  ('전사', '자이언트배너', 27),
  ('전사', '수기', 28);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. PP-GROMMET (하도매) — 깃대 고리 규격
-- ─────────────────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO post_processing_options (
  option_code, option_name,
  margin_left, margin_right, margin_top, margin_bottom,
  additional_cost, description, is_active,
  pricing_type, unit_price, pp_category, display_on_card,
  parameter_schema
) VALUES (
  'PP-GROMMET', '하도매',
  0, 0, 0, 0,
  0, '깃대 끼우는 고리 (하도매). 호수: 크기, 구수: 구멍 개수', 1,
  'fixed', 0, 'finish', 1,
  '{"fields":[{"key":"size","label":"호수","type":"select","options":["3호","5호","8호"],"default":"5호"},{"key":"holes","label":"구수","type":"select","options":["2구","4구"],"default":"2구"}]}'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. PP-NONWOVEN (부직포/바이어스) — 보강재
-- ─────────────────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO post_processing_options (
  option_code, option_name,
  margin_left, margin_right, margin_top, margin_bottom,
  additional_cost, description, is_active,
  pricing_type, unit_price, pp_category, display_on_card,
  parameter_schema
) VALUES (
  'PP-NONWOVEN', '부직포/바이어스',
  0, 0, 0, 0,
  0, '가장자리 보강재. 부직포(cm) 또는 바이어스천', 1,
  'fixed', 0, 'finish', 1,
  '{"fields":[{"key":"type","label":"종류","type":"select","options":["부직포","바이어스천"],"default":"부직포"},{"key":"size","label":"크기(cm)","type":"number","default":7,"min":1,"max":20}]}'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. PP-TASSEL (수술) — 장식 술
-- ─────────────────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO post_processing_options (
  option_code, option_name,
  margin_left, margin_right, margin_top, margin_bottom,
  additional_cost, description, is_active,
  pricing_type, unit_price, pp_category, display_on_card,
  parameter_schema
) VALUES (
  'PP-TASSEL', '수술',
  0, 0, 0, 0,
  0, '장식 술. 색상 선택 또는 미부착', 1,
  'fixed', 0, 'finish', 1,
  '{"fields":[{"key":"color","label":"색상","type":"select","options":["백색","금색","은색","적색","없음"],"default":"없음"}]}'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. PP 옵션 ↔ 전사 소분류 연결
-- ─────────────────────────────────────────────────────────────────────────────

-- PP-GROMMET → 정기, 군기
INSERT OR IGNORE INTO pp_option_subcategories (pp_option_id, subcat_id)
  SELECT p.id, s.id
  FROM post_processing_options p, pp_applicable_subcategories s
  WHERE p.option_code = 'PP-GROMMET'
    AND s.subcat_name IN ('정기', '군기');

-- PP-NONWOVEN → 윈드배너, 가로등배너, 정기, 군기, 워킹배너, 자이언트배너, 수기
INSERT OR IGNORE INTO pp_option_subcategories (pp_option_id, subcat_id)
  SELECT p.id, s.id
  FROM post_processing_options p, pp_applicable_subcategories s
  WHERE p.option_code = 'PP-NONWOVEN'
    AND s.subcat_name IN ('윈드배너', '가로등배너', '정기', '군기', '워킹배너', '자이언트배너', '수기');

-- PP-TASSEL → 정기, 군기, 근조기
INSERT OR IGNORE INTO pp_option_subcategories (pp_option_id, subcat_id)
  SELECT p.id, s.id
  FROM post_processing_options p, pp_applicable_subcategories s
  WHERE p.option_code = 'PP-TASSEL'
    AND s.subcat_name IN ('정기', '군기', '근조기');

-- 기존 PP-FINISHING(마감방식)도 전사 소분류에 연결 (봉제 프리셋 사용을 위해)
INSERT OR IGNORE INTO pp_option_subcategories (pp_option_id, subcat_id)
  SELECT p.id, s.id
  FROM post_processing_options p, pp_applicable_subcategories s
  WHERE p.option_code = 'PP-FINISHING'
    AND s.group_name = '전사';
