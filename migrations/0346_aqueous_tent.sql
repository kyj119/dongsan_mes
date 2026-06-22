-- 0346: 수성 텐트천 제품 + 텐트천 원단 4폭 등록
--
-- 패트/켈/합성지(0344~0345)와 동일 구조: 제품(AREA) → 원단(yd, dual 매입+판매) 연결.
-- 폭 90/127/152/180cm 전부 출력차감. 브랜드/길이 미지정 → 원단명 "텐트천"(추후 수정 가능).

-- 제품: 수성 텐트천 (AREA, 판매)
INSERT INTO items (item_code, item_name, item_type, category, category_id, unit, base_price, sales_price, pricing_method, pricing_profile, is_active, is_sales_item, is_purchase_item, production_required)
VALUES ('AQ-TENT', '수성 텐트천', 'PRODUCT', '수성', 15, 'EA', 0, 0, 'AREA', 'AREA', 1, 1, 0, 1);

-- 원단: 텐트천 (4폭, dual 매입+판매, yd)
INSERT INTO items (item_code, item_name, item_type, category, category_id, unit, base_price, sales_price, pricing_method, is_active, is_sales_item, is_purchase_item, production_required, item_group, width_mm, specification) VALUES
 ('TENT-090', '텐트천', 'MATERIAL', '원자재', 5, 'yd', 0, 0, 'FIXED', 1, 1, 1, 0, '텐트천', 900,  '90cm'),
 ('TENT-127', '텐트천', 'MATERIAL', '원자재', 5, 'yd', 0, 0, 'FIXED', 1, 1, 1, 0, '텐트천', 1270, '127cm'),
 ('TENT-152', '텐트천', 'MATERIAL', '원자재', 5, 'yd', 0, 0, 'FIXED', 1, 1, 1, 0, '텐트천', 1520, '152cm'),
 ('TENT-180', '텐트천', 'MATERIAL', '원자재', 5, 'yd', 0, 0, 'FIXED', 1, 1, 1, 0, '텐트천', 1800, '180cm');

-- 연결: 수성 텐트천 → 텐트천 4폭 (전부 출력차감)
INSERT INTO product_materials (product_item_id, material_item_id, is_default)
SELECT p.id, m.id, 0
FROM items p, items m
WHERE p.item_code = 'AQ-TENT'
  AND m.item_code IN ('TENT-090', 'TENT-127', 'TENT-152', 'TENT-180');
