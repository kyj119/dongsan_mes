-- ============================================================================
-- Migration 0023: PP 옵션-소분류 연결 데이터 + 펀칭/주석 옵션 추가
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. 기존 PP 옵션 ↔ 소분류 연결 (pp_option_subcategories 현재 비어 있음)
--    PP 옵션 ID: 아일렛=1, 열재단=2, 봉제=3, 윗봉=4, 줄달기=5, 코팅=6, 폼보드=7, 프레임=8
--    소분류 ID:  태극기=1, 현수막=2, 시트=3, 후렉스=4, 평판출력=5,
--               원형간판=6, 채널간판=7, 프레임간판=8, 갈바=9
-- ─────────────────────────────────────────────────────────────────────────────

-- PP 옵션 ↔ 소분류 연결 (PP 옵션이 존재할 때만 삽입)
INSERT OR IGNORE INTO pp_option_subcategories (pp_option_id, subcat_id)
  SELECT p.id, s.id FROM post_processing_options p, pp_applicable_subcategories s
  WHERE p.id IN (1,2,3,4,5,6,7,8) AND s.id IN (1,2,3,4,5,6,7,8,9)
  AND (
    (p.id = 1 AND s.id IN (2,3,4)) OR
    (p.id = 2 AND s.id IN (2,3,4,5)) OR
    (p.id = 3 AND s.id IN (2,4)) OR
    (p.id = 4 AND s.id IN (2,4)) OR
    (p.id = 5 AND s.id IN (2,4)) OR
    (p.id = 6 AND s.id IN (2,3,4,5)) OR
    (p.id = 7 AND s.id IN (5)) OR
    (p.id = 8 AND s.id IN (6,7,8,9))
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. 펀칭(PUNCHING) PP 옵션 삽입
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO post_processing_options (
  option_code, option_name,
  margin_left, margin_right, margin_top, margin_bottom,
  additional_cost, description, is_active,
  pricing_type, unit_price,
  parameter_schema
) VALUES (
  'PUNCHING', '펀칭',
  2, 2, 2, 2,
  0, '도무송 마크 (5mm 검정 원) 배치', 1,
  'fixed', 0,
  '{"fields":[{"key":"corner_tl","label":"좌상","type":"toggle","default":false},{"key":"side_top","label":"상","type":"number","unit":"개","default":0},{"key":"corner_tr","label":"우상","type":"toggle","default":false},{"key":"side_left","label":"좌","type":"number","unit":"개","default":0},{"key":"side_right","label":"우","type":"number","unit":"개","default":0},{"key":"corner_bl","label":"좌하","type":"toggle","default":false},{"key":"side_bottom","label":"하","type":"number","unit":"개","default":0},{"key":"corner_br","label":"우하","type":"toggle","default":false}],"layout":"punching_grid"}'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. 주석(ANNOTATION) PP 옵션 삽입
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO post_processing_options (
  option_code, option_name,
  margin_left, margin_right, margin_top, margin_bottom,
  additional_cost, description, is_active,
  pricing_type, unit_price,
  parameter_schema
) VALUES (
  'ANNOTATION', '주석',
  0, 0, 0, 0,
  0, '마진 영역에 [내용]-[규격]-[개수] 텍스트 배치', 1,
  'fixed', 0,
  '{"fields":[{"key":"position","label":"위치","type":"select","options":["상","하","좌","우"],"default":"하"}]}'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. 신규 옵션 ↔ 소분류 연결 (SELECT 기반, ID 미리 알 수 없음)
-- ─────────────────────────────────────────────────────────────────────────────

-- 펀칭 → 현수막(2), 시트(3), 후렉스(4)
INSERT OR IGNORE INTO pp_option_subcategories (pp_option_id, subcat_id)
  SELECT p.id, s.id
  FROM post_processing_options p, pp_applicable_subcategories s
  WHERE p.option_code = 'PUNCHING'
    AND s.subcat_name IN ('현수막', '시트', '후렉스');

-- 주석 → 현수막(2), 시트(3), 후렉스(4), 평판출력(5)
INSERT OR IGNORE INTO pp_option_subcategories (pp_option_id, subcat_id)
  SELECT p.id, s.id
  FROM post_processing_options p, pp_applicable_subcategories s
  WHERE p.option_code = 'ANNOTATION'
    AND s.subcat_name IN ('현수막', '시트', '후렉스', '평판출력');
