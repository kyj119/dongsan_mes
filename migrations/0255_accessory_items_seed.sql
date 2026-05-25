-- ============================================================================
-- Migration 0255: 부속품(GOODS) 마스터 데이터 등록
-- 깃대, 삼발이, 가방, 멕기 등 전사/깃발 동봉 부속품
-- item_type=GOODS, is_sales_item=1, is_purchase_item=1
-- ============================================================================

-- 부속품 카테고리가 없으면 생성
INSERT OR IGNORE INTO item_categories (category_name, category_code, sort_order, is_active)
VALUES ('부속품', 'ACCESSORY', 12, 1);

-- 부속품 아이템 등록
-- item_code: ACC-001~ | category: 부속품 | item_type: GOODS
INSERT OR IGNORE INTO items (
  category_id, item_code, item_name, category, sub_category,
  item_type, unit, is_sales_item, is_purchase_item, is_active
) VALUES
  ((SELECT id FROM item_categories WHERE category_code='ACCESSORY'), 'ACC-001', '목재깃대(창조립)',     '부속품', '깃대',    'GOODS', 'EA', 1, 1, 1),
  ((SELECT id FROM item_categories WHERE category_code='ACCESSORY'), 'ACC-002', '알루미늄깃대',         '부속품', '깃대',    'GOODS', 'EA', 1, 1, 1),
  ((SELECT id FROM item_categories WHERE category_code='ACCESSORY'), 'ACC-003', '삼발이',               '부속품', '거치대',  'GOODS', 'EA', 1, 1, 1),
  ((SELECT id FROM item_categories WHERE category_code='ACCESSORY'), 'ACC-004', '가방',                 '부속품', '케이스',  'GOODS', 'EA', 1, 1, 1),
  ((SELECT id FROM item_categories WHERE category_code='ACCESSORY'), 'ACC-005', '탁상용멕기(1구)',      '부속품', '멕기',    'GOODS', 'EA', 1, 1, 1),
  ((SELECT id FROM item_categories WHERE category_code='ACCESSORY'), 'ACC-006', '탁상용멕기(2구)',      '부속품', '멕기',    'GOODS', 'EA', 1, 1, 1),
  ((SELECT id FROM item_categories WHERE category_code='ACCESSORY'), 'ACC-007', '대형멕기',             '부속품', '멕기',    'GOODS', 'EA', 1, 1, 1),
  ((SELECT id FROM item_categories WHERE category_code='ACCESSORY'), 'ACC-008', '윈드배너 거치대',      '부속품', '거치대',  'GOODS', 'EA', 1, 1, 1),
  ((SELECT id FROM item_categories WHERE category_code='ACCESSORY'), 'ACC-009', '십자 거치대',          '부속품', '거치대',  'GOODS', 'EA', 1, 1, 1),
  ((SELECT id FROM item_categories WHERE category_code='ACCESSORY'), 'ACC-010', '물통 거치대',          '부속품', '거치대',  'GOODS', 'EA', 1, 1, 1);
