-- 0345: 수성 켈/켈그레이/합성지/합성지그레이 제품 + 원단(호홍 30M) 각 4폭 등록
--
-- 패트(0344)와 동일 구조: 제품(AREA) → 원단(yd, dual 매입+판매, 호홍 30M) product_materials 연결.
-- 4제품 × 각 원단 4폭(60/90/127/152cm) 전부 출력차감. 원단명에 브랜드(호홍)+롤길이(30M) 포함.

-- 제품 4 (AREA, 판매)
INSERT INTO items (item_code, item_name, item_type, category, category_id, unit, base_price, sales_price, pricing_method, pricing_profile, is_active, is_sales_item, is_purchase_item, production_required) VALUES
 ('AQ-KEL',  '수성 켈',          'PRODUCT', '수성', 15, 'EA', 0, 0, 'AREA', 'AREA', 1, 1, 0, 1),
 ('AQ-KELG', '수성 켈 그레이',    'PRODUCT', '수성', 15, 'EA', 0, 0, 'AREA', 'AREA', 1, 1, 0, 1),
 ('AQ-SYN',  '수성 합성지',       'PRODUCT', '수성', 15, 'EA', 0, 0, 'AREA', 'AREA', 1, 1, 0, 1),
 ('AQ-SYNG', '수성 합성지 그레이', 'PRODUCT', '수성', 15, 'EA', 0, 0, 'AREA', 'AREA', 1, 1, 0, 1);

-- 원단 16 (dual 매입+판매, yd, 호홍 30M)
INSERT INTO items (item_code, item_name, item_type, category, category_id, unit, base_price, sales_price, pricing_method, is_active, is_sales_item, is_purchase_item, production_required, item_group, width_mm, specification) VALUES
 ('KEL-060', '켈 30M 호홍',   'MATERIAL', '원자재', 5, 'yd', 0, 0, 'FIXED', 1, 1, 1, 0, '켈 30M 호홍',   600,  '60cm'),
 ('KEL-090', '켈 30M 호홍',   'MATERIAL', '원자재', 5, 'yd', 0, 0, 'FIXED', 1, 1, 1, 0, '켈 30M 호홍',   900,  '90cm'),
 ('KEL-127', '켈 30M 호홍',   'MATERIAL', '원자재', 5, 'yd', 0, 0, 'FIXED', 1, 1, 1, 0, '켈 30M 호홍',   1270, '127cm'),
 ('KEL-152', '켈 30M 호홍',   'MATERIAL', '원자재', 5, 'yd', 0, 0, 'FIXED', 1, 1, 1, 0, '켈 30M 호홍',   1520, '152cm'),
 ('KELG-060','켈그레이 30M 호홍','MATERIAL','원자재', 5, 'yd', 0, 0, 'FIXED', 1, 1, 1, 0, '켈그레이 30M 호홍', 600,  '60cm'),
 ('KELG-090','켈그레이 30M 호홍','MATERIAL','원자재', 5, 'yd', 0, 0, 'FIXED', 1, 1, 1, 0, '켈그레이 30M 호홍', 900,  '90cm'),
 ('KELG-127','켈그레이 30M 호홍','MATERIAL','원자재', 5, 'yd', 0, 0, 'FIXED', 1, 1, 1, 0, '켈그레이 30M 호홍', 1270, '127cm'),
 ('KELG-152','켈그레이 30M 호홍','MATERIAL','원자재', 5, 'yd', 0, 0, 'FIXED', 1, 1, 1, 0, '켈그레이 30M 호홍', 1520, '152cm'),
 ('SYN-060', '합성지 30M 호홍','MATERIAL','원자재', 5, 'yd', 0, 0, 'FIXED', 1, 1, 1, 0, '합성지 30M 호홍',  600,  '60cm'),
 ('SYN-090', '합성지 30M 호홍','MATERIAL','원자재', 5, 'yd', 0, 0, 'FIXED', 1, 1, 1, 0, '합성지 30M 호홍',  900,  '90cm'),
 ('SYN-127', '합성지 30M 호홍','MATERIAL','원자재', 5, 'yd', 0, 0, 'FIXED', 1, 1, 1, 0, '합성지 30M 호홍',  1270, '127cm'),
 ('SYN-152', '합성지 30M 호홍','MATERIAL','원자재', 5, 'yd', 0, 0, 'FIXED', 1, 1, 1, 0, '합성지 30M 호홍',  1520, '152cm'),
 ('SYNG-060','합성지그레이 30M 호홍','MATERIAL','원자재', 5, 'yd', 0, 0, 'FIXED', 1, 1, 1, 0, '합성지그레이 30M 호홍', 600,  '60cm'),
 ('SYNG-090','합성지그레이 30M 호홍','MATERIAL','원자재', 5, 'yd', 0, 0, 'FIXED', 1, 1, 1, 0, '합성지그레이 30M 호홍', 900,  '90cm'),
 ('SYNG-127','합성지그레이 30M 호홍','MATERIAL','원자재', 5, 'yd', 0, 0, 'FIXED', 1, 1, 1, 0, '합성지그레이 30M 호홍', 1270, '127cm'),
 ('SYNG-152','합성지그레이 30M 호홍','MATERIAL','원자재', 5, 'yd', 0, 0, 'FIXED', 1, 1, 1, 0, '합성지그레이 30M 호홍', 1520, '152cm');

-- 연결: 각 제품 → 동일 매체 원단 4폭 (전부 출력차감)
INSERT INTO product_materials (product_item_id, material_item_id, is_default)
SELECT p.id, m.id, 0
FROM items p JOIN items m
  ON ( (p.item_code='AQ-KEL'  AND m.item_group='켈 30M 호홍')
    OR (p.item_code='AQ-KELG' AND m.item_group='켈그레이 30M 호홍')
    OR (p.item_code='AQ-SYN'  AND m.item_group='합성지 30M 호홍')
    OR (p.item_code='AQ-SYNG' AND m.item_group='합성지그레이 30M 호홍') )
WHERE p.item_code IN ('AQ-KEL','AQ-KELG','AQ-SYN','AQ-SYNG');
