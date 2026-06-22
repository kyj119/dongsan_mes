-- 0349: 솔벤 현수막/UV 현수막 제품 + 솔벤 현수막 원단 8폭(솔벤·UV 공용)
--
-- 원단 '솔벤 현수막'(취급명)은 솔벤·UV 둘 다 출력 + 같은 롤(공용 재고). 후렉스와 동일 패턴.
-- 제품 2(솔벤 현수막=솔벤, UV 현수막=UV), 원단은 공용 연결. 원단명은 제품과 동명 유지(타입/탭 구분).
-- 폭 70/90/127/150/180/200/250/320cm 전부 차감, dual 매입+판매.

-- 제품 2 (AREA, 판매)
INSERT INTO items (item_code, item_name, item_type, category, category_id, unit, base_price, sales_price, pricing_method, pricing_profile, is_active, is_sales_item, is_purchase_item, production_required) VALUES
 ('SV-BANNER', '솔벤 현수막', 'PRODUCT', '솔벤', 3, 'EA', 0, 0, 'AREA', 'AREA', 1, 1, 0, 1),
 ('UV-BANNER', 'UV 현수막',  'PRODUCT', 'UV',   2, 'EA', 0, 0, 'AREA', 'AREA', 1, 1, 0, 1);

-- 원단: 솔벤 현수막 8폭 (공용, dual)
INSERT INTO items (item_code, item_name, item_type, category, category_id, unit, base_price, sales_price, pricing_method, is_active, is_sales_item, is_purchase_item, production_required, item_group, width_mm, specification) VALUES
 ('SVB-070','솔벤 현수막','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'솔벤 현수막',700, '70cm'),
 ('SVB-090','솔벤 현수막','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'솔벤 현수막',900, '90cm'),
 ('SVB-127','솔벤 현수막','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'솔벤 현수막',1270,'127cm'),
 ('SVB-150','솔벤 현수막','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'솔벤 현수막',1500,'150cm'),
 ('SVB-180','솔벤 현수막','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'솔벤 현수막',1800,'180cm'),
 ('SVB-200','솔벤 현수막','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'솔벤 현수막',2000,'200cm'),
 ('SVB-250','솔벤 현수막','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'솔벤 현수막',2500,'250cm'),
 ('SVB-320','솔벤 현수막','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'솔벤 현수막',3200,'320cm');

-- 연결: 솔벤 현수막 + UV 현수막 둘 다 → 솔벤 현수막 원단 8폭 (공용)
INSERT INTO product_materials (product_item_id, material_item_id, is_default)
SELECT p.id, m.id, 0
FROM items p JOIN items m ON (m.item_type='MATERIAL' AND m.item_group='솔벤 현수막')
WHERE p.item_code IN ('SV-BANNER', 'UV-BANNER');
