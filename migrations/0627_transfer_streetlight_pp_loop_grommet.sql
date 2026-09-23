-- ============================================================================
-- Migration 0627: 가로등배너 후가공 — 하도매 위치 개수 · 끈고리 옵션 · 봉제 프리셋 (2026-09-23 용준님 확정)
--
-- 왜: 전사 패널(판짜기)이 끈고리·하도매 표시를 그리는데, 그 값(상단/측면 개수·끈고리 상/중/하·봉미싱 cm)이
--     MES 어디에도 없어 종이 작업지시서를 사람이 읽어 패널에 쳤다. 주문서 후가공에 자리를 만들면
--     intake-config(open_lines) → 에이전트 config.json → 전사 탭으로 그대로 흐른다.
--   · PP-GROMMET(하도매): 「구수(2구/4구)」 → 「상단 개수·측면 개수」. 구수는 겹치는 모서리를 빼고 파생한다
--     (상단 2 + 측면 3 = 4구 — 패널 plate.js 와 같은 규칙). 호수에 9호 추가(패널 규칙 [3,5,8,9]).
--     옛 라인의 params.holes 는 라벨(finishingLabel)이 그대로 읽는다 — 소급 변환 없음.
--   · PP-LOOP(끈고리): 상·중·하 넣음/없음. 하는 상하단 봉미싱일 때만 뜻이 있다(패널이 밴드 없으면 무시).
--   · 두 옵션을 가로등배너 소분류에 연결(하도매는 정기·군기에만 붙어 있었다 — 0252).
--   · 봉제 프리셋: 가로등 표준 = 상단 봉미싱 5cm + 좌·우·하 쌍침 (3면 = 좌·우·하단, 상단은 봉미싱). 상하단 봉미싱 한 벌 더.
-- 멱등: UPDATE 는 재실행 무해 · INSERT OR IGNORE.
-- ============================================================================

UPDATE post_processing_options
   SET parameter_schema = '{"fields":[{"key":"size","label":"호수","type":"select","options":["3호","5호","8호","9호"],"default":"5호"},{"key":"top","label":"상단 개수","type":"number","default":2,"min":0,"max":4},{"key":"side","label":"측면 개수","type":"number","default":0,"min":0,"max":4}]}',
       description = '깃대 끼우는 고리(하도매). 호수 = 크기. 상단 N = 위 끝선 아래 1cm 줄(2 = 양 모서리), 측면 N = 안쪽 변 1cm 줄(3 = 위·중간·아래). 겹치는 모서리는 하나로 세어 구수가 된다(상단 2 + 측면 3 = 4구)'
 WHERE option_code = 'PP-GROMMET';

INSERT OR IGNORE INTO post_processing_options (
  option_code, option_name,
  margin_left, margin_right, margin_top, margin_bottom,
  additional_cost, description, is_active,
  pricing_type, unit_price, pp_category, display_on_card,
  parameter_schema
) VALUES (
  'PP-LOOP', '끈고리',
  0, 0, 0, 0,
  0, '끈고리 위치 표시(패널이 시접 띠에 그린다). 상 = 접는선에서 봉미싱 길이만큼 아래(부직포는 폭+1cm), 중 = 원본 중간, 하 = 상하단 봉미싱일 때만', 1,
  'fixed', 0, 'finish', 1,
  '{"fields":[{"key":"top","label":"상","type":"select","options":["넣음","없음"],"default":"넣음"},{"key":"mid","label":"중","type":"select","options":["넣음","없음"],"default":"넣음"},{"key":"bottom","label":"하(상하단 봉미싱만)","type":"select","options":["넣음","없음"],"default":"넣음"}]}'
);

-- 가로등배너 소분류 연결 (하도매 · 끈고리)
INSERT OR IGNORE INTO pp_option_subcategories (pp_option_id, subcat_id)
  SELECT p.id, s.id
  FROM post_processing_options p, pp_applicable_subcategories s
  WHERE p.option_code IN ('PP-GROMMET', 'PP-LOOP')
    AND s.group_name = '전사' AND s.subcat_name = '가로등배너';

-- 벌 수 = 판매단위 「조」(용준님 2026-09-23 「벌 수를 조로 표현」). 단위표(0619 item_units)에 가로등배너 품목마다 조 = 2 EA 행을 둔다.
--   역할은 전부 0 = **후보**(주문서 판매단위 셀렉트에 뜨되 기본단위 EA 는 그대로). 기본 판매단위를 조로 바꾸는 것은 단가 축이 바뀌는 일이라
--   여기서 하지 않는다(§단가는 값이 아니라 축). 주문서 저장 = quantity(EA) + sales_unit/sales_qty/unit_factor 스냅샷(0620) → 패널은 sales_unit 을 본다.
--   ⚠️ 판매단위 칸은 settings 'item_units.forms' 스위치가 ON 이어야 보인다.
INSERT OR IGNORE INTO item_units (item_id, unit, factor, is_base, role_purchase, role_sales, role_count, sort_order)
SELECT i.id, '조', 2, 0, 0, 0, 0, 3
FROM items i
WHERE (i.sub_category = '가로등배너' OR i.item_code LIKE 'TRB-%')
  AND COALESCE(NULLIF(i.unit, ''), 'EA') = 'EA';

-- 봉제 프리셋 — cm 는 봉미싱 길이(전사 패널의 밴드 = cm + 1)
INSERT OR IGNORE INTO finishing_presets (name, config, sort_order, is_active) VALUES
  ('가로등 상단봉미싱', '{"top":"봉미싱","top_cm":5,"left":"쌍침","right":"쌍침","bottom":"쌍침"}', 15, 1),
  ('가로등 상하단봉미싱', '{"top":"봉미싱","top_cm":5,"bottom":"봉미싱","bottom_cm":5,"left":"쌍침","right":"쌍침"}', 16, 1);
