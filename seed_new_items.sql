-- New items with category structure
-- 대분류: 전사, 실사출력, 간판

-- First, insert categories
INSERT OR IGNORE INTO item_categories (id, category_name, category_code, sort_order, is_active) VALUES
(1, '전사', 'TRANSFER', 1, 1),
(2, '실사출력', 'PRINT', 2, 1),
(3, '간판', 'SIGN', 3, 1);

-- 전사 (2개)
INSERT INTO items (category_id, item_code, item_name, category, sub_category, unit, base_price, is_active) VALUES
(1, 'T001', '깃발', '전사', '깃발', 'EA', 15000, 1),
(1, 'T002', '태극기', '전사', '태극기', 'EA', 20000, 1);

-- 실사출력 (4개)
INSERT INTO items (category_id, item_code, item_name, category, sub_category, unit, base_price, is_active) VALUES
(2, 'P001', '현수막', '실사출력', '현수막', '㎡', 8000, 1),
(2, 'P002', '패트', '실사출력', '패트', '㎡', 12000, 1),
(2, 'P003', '켈', '실사출력', '켈', '㎡', 10000, 1),
(2, 'P004', '후렉스', '실사출력', '후렉스', '㎡', 9000, 1);

-- 간판 (3개)
INSERT INTO items (category_id, item_code, item_name, category, sub_category, unit, base_price, is_active) VALUES
(3, 'S001', '포인트간판', '간판', '포인트간판', 'EA', 50000, 1),
(3, 'S002', '채널간판', '간판', '채널간판', 'EA', 80000, 1),
(3, 'S003', '프레임간판', '간판', '프레임간판', 'EA', 100000, 1);
