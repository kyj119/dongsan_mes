-- 0357: 솔벤 매쉬(솔벤·UV 공용) 원단 9폭 + 제품 2(솔벤 매쉬/UV 매쉬). 솔벤현수막과 동일 패턴.
-- 원단 '솔벤 매쉬'(전사 깃발용 '매쉬'와 별개) 솔벤·UV 공용 차감. 제품2 공용 연결. dual, 전폭 차감, AREA.
INSERT INTO items (item_code, item_name, item_type, category, category_id, unit, base_price, sales_price, pricing_method, is_active, is_sales_item, is_purchase_item, production_required, item_group, width_mm, specification) VALUES
 ('SVM-060','솔벤 매쉬','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'솔벤 매쉬',600, '60cm'),
 ('SVM-127','솔벤 매쉬','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'솔벤 매쉬',1270,'127cm'),
 ('SVM-137','솔벤 매쉬','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'솔벤 매쉬',1370,'137cm'),
 ('SVM-160','솔벤 매쉬','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'솔벤 매쉬',1600,'160cm'),
 ('SVM-180','솔벤 매쉬','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'솔벤 매쉬',1800,'180cm'),
 ('SVM-200','솔벤 매쉬','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'솔벤 매쉬',2000,'200cm'),
 ('SVM-220','솔벤 매쉬','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'솔벤 매쉬',2200,'220cm'),
 ('SVM-250','솔벤 매쉬','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'솔벤 매쉬',2500,'250cm'),
 ('SVM-320','솔벤 매쉬','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'솔벤 매쉬',3200,'320cm');

INSERT INTO items (item_code, item_name, item_type, category, category_id, unit, base_price, sales_price, pricing_method, pricing_profile, is_active, is_sales_item, is_purchase_item, production_required) VALUES
 ('SV-MESH','솔벤 매쉬','PRODUCT','솔벤',3,'EA',0,0,'AREA','AREA',1,1,0,1),
 ('UV-MESH','UV 매쉬', 'PRODUCT','UV',  2,'EA',0,0,'AREA','AREA',1,1,0,1);

INSERT INTO product_materials (product_item_id, material_item_id, is_default)
SELECT p.id, m.id, 0
FROM items p JOIN items m ON (m.item_type='MATERIAL' AND m.item_group='솔벤 매쉬')
WHERE p.item_code IN ('SV-MESH','UV-MESH');
