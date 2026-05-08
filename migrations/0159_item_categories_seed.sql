-- 0159: item_categories 누락 카테고리 추가
-- 품목 체계(PM-1xxx~PM-8xxx, RM-Xxxxx) 지원을 위해 전사/UV/솔벤/상품/원자재 추가
INSERT OR IGNORE INTO item_categories (category_name, category_code, sort_order, is_active) VALUES
  ('전사',   'TRANSFER', 7,  1),
  ('UV',     'UV',       8,  1),
  ('솔벤',   'SOLVENT',  9,  1),
  ('상품',   'GOODS',    10, 1),
  ('원자재', 'MATERIAL', 11, 1);
