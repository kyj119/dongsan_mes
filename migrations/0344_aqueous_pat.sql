-- 0344: 수성 패트 제품 + 패트배너(호홍 30M) 원단 4폭 등록
--
-- 현수막(0333)과 동일 구조: 제품(AREA) → 원단(yd, dual 매입+판매) product_materials 연결.
-- 단 원단명에 브랜드(호홍)+롤길이(30M) 포함(사용자 요청). 폭은 specification(cm)에. 4폭 전부 출력차감.
-- 폭: 60/90/127/152cm (width_mm 600/900/1270/1520).

-- 제품: 수성 패트 (AREA, 판매)
INSERT INTO items (item_code, item_name, item_type, category, category_id, unit, base_price, sales_price, pricing_method, pricing_profile, is_active, is_sales_item, is_purchase_item, production_required)
VALUES ('AQ-PAT', '수성 패트', 'PRODUCT', '수성', 15, 'EA', 0, 0, 'AREA', 'AREA', 1, 1, 0, 1);

-- 원단: 패트배너 30M 호홍 (4폭, dual 매입+판매, yd)
INSERT INTO items (item_code, item_name, item_type, category, category_id, unit, base_price, sales_price, pricing_method, is_active, is_sales_item, is_purchase_item, production_required, item_group, width_mm, specification)
VALUES
 ('PAT-060', '패트배너 30M 호홍', 'MATERIAL', '원자재', 5, 'yd', 0, 0, 'FIXED', 1, 1, 1, 0, '패트배너 30M 호홍', 600,  '60cm'),
 ('PAT-090', '패트배너 30M 호홍', 'MATERIAL', '원자재', 5, 'yd', 0, 0, 'FIXED', 1, 1, 1, 0, '패트배너 30M 호홍', 900,  '90cm'),
 ('PAT-127', '패트배너 30M 호홍', 'MATERIAL', '원자재', 5, 'yd', 0, 0, 'FIXED', 1, 1, 1, 0, '패트배너 30M 호홍', 1270, '127cm'),
 ('PAT-152', '패트배너 30M 호홍', 'MATERIAL', '원자재', 5, 'yd', 0, 0, 'FIXED', 1, 1, 1, 0, '패트배너 30M 호홍', 1520, '152cm');

-- 연결: 수성 패트 → 패트배너 4폭 (전부 출력차감)
INSERT INTO product_materials (product_item_id, material_item_id, is_default)
SELECT p.id, m.id, 0
FROM items p, items m
WHERE p.item_code = 'AQ-PAT'
  AND m.item_code IN ('PAT-060', 'PAT-090', 'PAT-127', 'PAT-152');
