-- 0347: 후렉스(솔벤·UV 공용 매체) 제품 4 + 원단 2그룹(조명용13/비조명용12) 등록
--
-- 후렉스는 솔벤·UV 둘 다 출력 가능 + 물리적으로 같은 롤(공용 재고).
-- autoDeductInventory가 '폭'만 매칭하므로 조명/비조명을 폭으로 구분 불가 →
-- 제품을 인쇄방식×조명여부 4개로 분리(각 제품 → 단일 매체타입), 원단은 솔벤·UV 공용 연결.
-- 대분류: 솔벤(id 3) / UV(id 2). 원단=원자재(id 5). 폭 cm 규격, dual 매입+판매, 전폭 차감.

-- 제품 4 (AREA, 판매)
INSERT INTO items (item_code, item_name, item_type, category, category_id, unit, base_price, sales_price, pricing_method, pricing_profile, is_active, is_sales_item, is_purchase_item, production_required) VALUES
 ('SV-FLEXL', '솔벤 조명후렉스',  'PRODUCT', '솔벤', 3, 'EA', 0, 0, 'AREA', 'AREA', 1, 1, 0, 1),
 ('SV-FLEXN', '솔벤 비조명후렉스','PRODUCT', '솔벤', 3, 'EA', 0, 0, 'AREA', 'AREA', 1, 1, 0, 1),
 ('UV-FLEXL', 'UV 조명후렉스',    'PRODUCT', 'UV',   2, 'EA', 0, 0, 'AREA', 'AREA', 1, 1, 0, 1),
 ('UV-FLEXN', 'UV 비조명후렉스',  'PRODUCT', 'UV',   2, 'EA', 0, 0, 'AREA', 'AREA', 1, 1, 0, 1);

-- 원단: 조명용 후렉스 13폭 (공용)
INSERT INTO items (item_code, item_name, item_type, category, category_id, unit, base_price, sales_price, pricing_method, is_active, is_sales_item, is_purchase_item, production_required, item_group, width_mm, specification) VALUES
 ('FLEXL-090','조명용 후렉스','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'조명용 후렉스',900, '90cm'),
 ('FLEXL-100','조명용 후렉스','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'조명용 후렉스',1000,'100cm'),
 ('FLEXL-110','조명용 후렉스','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'조명용 후렉스',1100,'110cm'),
 ('FLEXL-120','조명용 후렉스','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'조명용 후렉스',1200,'120cm'),
 ('FLEXL-130','조명용 후렉스','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'조명용 후렉스',1300,'130cm'),
 ('FLEXL-150','조명용 후렉스','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'조명용 후렉스',1500,'150cm'),
 ('FLEXL-160','조명용 후렉스','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'조명용 후렉스',1600,'160cm'),
 ('FLEXL-180','조명용 후렉스','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'조명용 후렉스',1800,'180cm'),
 ('FLEXL-200','조명용 후렉스','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'조명용 후렉스',2000,'200cm'),
 ('FLEXL-220','조명용 후렉스','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'조명용 후렉스',2200,'220cm'),
 ('FLEXL-250','조명용 후렉스','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'조명용 후렉스',2500,'250cm'),
 ('FLEXL-260','조명용 후렉스','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'조명용 후렉스',2600,'260cm'),
 ('FLEXL-320','조명용 후렉스','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'조명용 후렉스',3200,'320cm');

-- 원단: 비조명용 후렉스 12폭 (공용, 260 없음)
INSERT INTO items (item_code, item_name, item_type, category, category_id, unit, base_price, sales_price, pricing_method, is_active, is_sales_item, is_purchase_item, production_required, item_group, width_mm, specification) VALUES
 ('FLEXN-090','비조명용 후렉스','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'비조명용 후렉스',900, '90cm'),
 ('FLEXN-100','비조명용 후렉스','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'비조명용 후렉스',1000,'100cm'),
 ('FLEXN-110','비조명용 후렉스','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'비조명용 후렉스',1100,'110cm'),
 ('FLEXN-120','비조명용 후렉스','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'비조명용 후렉스',1200,'120cm'),
 ('FLEXN-130','비조명용 후렉스','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'비조명용 후렉스',1300,'130cm'),
 ('FLEXN-150','비조명용 후렉스','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'비조명용 후렉스',1500,'150cm'),
 ('FLEXN-160','비조명용 후렉스','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'비조명용 후렉스',1600,'160cm'),
 ('FLEXN-180','비조명용 후렉스','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'비조명용 후렉스',1800,'180cm'),
 ('FLEXN-200','비조명용 후렉스','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'비조명용 후렉스',2000,'200cm'),
 ('FLEXN-220','비조명용 후렉스','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'비조명용 후렉스',2200,'220cm'),
 ('FLEXN-250','비조명용 후렉스','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'비조명용 후렉스',2500,'250cm'),
 ('FLEXN-320','비조명용 후렉스','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'비조명용 후렉스',3200,'320cm');

-- 연결: 조명후렉스 제품(솔벤·UV)→조명용 후렉스, 비조명후렉스 제품→비조명용 후렉스 (공용)
INSERT INTO product_materials (product_item_id, material_item_id, is_default)
SELECT p.id, m.id, 0
FROM items p JOIN items m
  ON ( (p.item_code IN ('SV-FLEXL','UV-FLEXL') AND m.item_group='조명용 후렉스')
    OR (p.item_code IN ('SV-FLEXN','UV-FLEXN') AND m.item_group='비조명용 후렉스') )
WHERE p.item_code IN ('SV-FLEXL','SV-FLEXN','UV-FLEXL','UV-FLEXN');
