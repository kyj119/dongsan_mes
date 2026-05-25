-- ============================================================================
-- Migration 0257: 전사 품목 마스터 데이터 등록
-- sub_category가 pp_applicable_subcategories와 일치해야 PP 필터링 작동
-- print_method_id=5(전사), print_media_id=원단별 매핑
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 윈드배너 (매쉬, 면적 기반)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO items (
  item_code, item_name, category, sub_category, item_type, unit,
  base_price, pricing_method, print_method_id, print_media_id,
  is_sales_item, is_purchase_item, is_active
) VALUES
  ('TF-101', '윈드배너', '전사', '윈드배너', 'PRODUCT', 'EA',
   13000, 'FIXED', 5, 1, 1, 0, 1),
  ('TF-102', '윈드배너(대)', '전사', '윈드배너', 'PRODUCT', 'EA',
   18000, 'FIXED', 5, 1, 1, 0, 1);

-- ─────────────────────────────────────────────────────────────────────────────
-- 가로등배너 (폰지, 면적 기반)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO items (
  item_code, item_name, category, sub_category, item_type, unit,
  base_price, pricing_method, print_method_id, print_media_id,
  is_sales_item, is_purchase_item, is_active
) VALUES
  ('TF-201', '가로등배너', '전사', '가로등배너', 'PRODUCT', 'EA',
   0, 'AREA', 5, 2, 1, 0, 1),
  ('TF-202', '가로등배너(대형)', '전사', '가로등배너', 'PRODUCT', 'EA',
   0, 'AREA', 5, 2, 1, 0, 1);

-- ─────────────────────────────────────────────────────────────────────────────
-- 정기 (폰지, 고정가) — 기관기, 단체기, 사기 등
-- ─────────────────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO items (
  item_code, item_name, category, sub_category, item_type, unit,
  base_price, pricing_method, print_method_id, print_media_id,
  is_sales_item, is_purchase_item, is_active
) VALUES
  ('TF-301', '정기(폰지)', '전사', '정기', 'PRODUCT', 'EA',
   0, 'FIXED', 5, 2, 1, 0, 1),
  ('TF-302', '정기(사틴)', '전사', '정기', 'PRODUCT', 'EA',
   0, 'FIXED', 5, 3, 1, 0, 1),
  ('TF-303', '정기자수', '전사', '정기', 'PRODUCT', 'EA',
   0, 'FIXED', 5, 2, 1, 0, 1);

-- ─────────────────────────────────────────────────────────────────────────────
-- 군기 (폰지, 고정가) — 대대기, 중대기, 참모총장기 등
-- ─────────────────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO items (
  item_code, item_name, category, sub_category, item_type, unit,
  base_price, pricing_method, print_method_id, print_media_id,
  is_sales_item, is_purchase_item, is_active
) VALUES
  ('TF-401', '군기(폰지)', '전사', '군기', 'PRODUCT', 'EA',
   0, 'FIXED', 5, 2, 1, 0, 1),
  ('TF-402', '군기(사틴)', '전사', '군기', 'PRODUCT', 'EA',
   0, 'FIXED', 5, 3, 1, 0, 1);

-- ─────────────────────────────────────────────────────────────────────────────
-- 탁상기 (사틴, 고정가)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO items (
  item_code, item_name, category, sub_category, item_type, unit,
  base_price, pricing_method, print_method_id, print_media_id,
  is_sales_item, is_purchase_item, is_active
) VALUES
  ('TF-501', '탁상기(사틴)', '전사', '탁상기', 'PRODUCT', 'EA',
   0, 'FIXED', 5, 3, 1, 0, 1),
  ('TF-502', '탁상기(폰지)', '전사', '탁상기', 'PRODUCT', 'EA',
   0, 'FIXED', 5, 2, 1, 0, 1);

-- ─────────────────────────────────────────────────────────────────────────────
-- 근조기 (외주 — 대진국기사 발주)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO items (
  item_code, item_name, category, sub_category, item_type, unit,
  base_price, pricing_method, print_method_id, print_media_id,
  is_sales_item, is_purchase_item, is_active
) VALUES
  ('TF-601', '근조기(외주)', '전사', '근조기', 'PRODUCT', 'EA',
   0, 'FIXED', 5, NULL, 1, 0, 1);

-- ─────────────────────────────────────────────────────────────────────────────
-- 워킹배너 (매쉬)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO items (
  item_code, item_name, category, sub_category, item_type, unit,
  base_price, pricing_method, print_method_id, print_media_id,
  is_sales_item, is_purchase_item, is_active
) VALUES
  ('TF-701', '워킹배너', '전사', '워킹배너', 'PRODUCT', 'EA',
   0, 'FIXED', 5, 1, 1, 0, 1);

-- ─────────────────────────────────────────────────────────────────────────────
-- 자이언트배너 (매쉬)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO items (
  item_code, item_name, category, sub_category, item_type, unit,
  base_price, pricing_method, print_method_id, print_media_id,
  is_sales_item, is_purchase_item, is_active
) VALUES
  ('TF-801', '자이언트배너', '전사', '자이언트배너', 'PRODUCT', 'EA',
   0, 'AREA', 5, 1, 1, 0, 1);

-- ─────────────────────────────────────────────────────────────────────────────
-- 수기 (폰지, 고정가) — 수기태극기, 수기깃발 등
-- ─────────────────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO items (
  item_code, item_name, category, sub_category, item_type, unit,
  base_price, pricing_method, print_method_id, print_media_id,
  is_sales_item, is_purchase_item, is_active
) VALUES
  ('TF-901', '수기', '전사', '수기', 'PRODUCT', 'EA',
   0, 'FIXED', 5, 2, 1, 0, 1),
  ('TF-902', '수기태극기', '전사', '수기', 'PRODUCT', 'EA',
   0, 'FIXED', 5, 2, 1, 0, 1);

-- ─────────────────────────────────────────────────────────────────────────────
-- 태극기 (기성품, 사틴, 규격별)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO items (
  item_code, item_name, category, sub_category, item_type, unit,
  base_price, pricing_method, print_method_id, print_media_id,
  is_sales_item, is_purchase_item, is_active
) VALUES
  ('TF-011', '태극기 1호(150×100)', '전사', '정기', 'PRODUCT', 'EA',
   0, 'FIXED', 5, 3, 1, 0, 1),
  ('TF-012', '태극기 2호(135×90)', '전사', '정기', 'PRODUCT', 'EA',
   0, 'FIXED', 5, 3, 1, 0, 1),
  ('TF-013', '태극기 3호(120×80)', '전사', '정기', 'PRODUCT', 'EA',
   0, 'FIXED', 5, 3, 1, 0, 1),
  ('TF-014', '태극기 4호(95×60)', '전사', '정기', 'PRODUCT', 'EA',
   0, 'FIXED', 5, 3, 1, 0, 1),
  ('TF-015', '태극기 5호(70×45)', '전사', '정기', 'PRODUCT', 'EA',
   0, 'FIXED', 5, 3, 1, 0, 1),
  ('TF-016', '태극기 6호(50×35)', '전사', '정기', 'PRODUCT', 'EA',
   0, 'FIXED', 5, 3, 1, 0, 1),
  ('TF-017', '태극기 특호(200×135)', '전사', '정기', 'PRODUCT', 'EA',
   0, 'FIXED', 5, 3, 1, 0, 1),
  ('TF-018', '태극기 탁상용(30×20)', '전사', '탁상기', 'PRODUCT', 'EA',
   0, 'FIXED', 5, 3, 1, 0, 1);
