-- 0348: UV 양면배너후렉스 제품 + 양면배너 후렉스 원단(137 단일폭) 등록
--
-- 양면배너 후렉스 = UV 전용, 별도 원단(빛차단 소재), 137cm 단일폭.
-- 제품(AREA, 대분류 UV) → 원단(yd, dual 매입+판매, 137폭) 연결. 출력차감 대상.

-- 제품: UV 양면배너후렉스
INSERT INTO items (item_code, item_name, item_type, category, category_id, unit, base_price, sales_price, pricing_method, pricing_profile, is_active, is_sales_item, is_purchase_item, production_required)
VALUES ('UV-FLEXD', 'UV 양면배너후렉스', 'PRODUCT', 'UV', 2, 'EA', 0, 0, 'AREA', 'AREA', 1, 1, 0, 1);

-- 원단: 양면배너 후렉스 (137 단일폭, dual)
INSERT INTO items (item_code, item_name, item_type, category, category_id, unit, base_price, sales_price, pricing_method, is_active, is_sales_item, is_purchase_item, production_required, item_group, width_mm, specification)
VALUES ('FLEXD-137', '양면배너 후렉스', 'MATERIAL', '원자재', 5, 'yd', 0, 0, 'FIXED', 1, 1, 1, 0, '양면배너 후렉스', 1370, '137cm');

-- 연결
INSERT INTO product_materials (product_item_id, material_item_id, is_default)
SELECT p.id, m.id, 0
FROM items p, items m
WHERE p.item_code = 'UV-FLEXD' AND m.item_code = 'FLEXD-137';
