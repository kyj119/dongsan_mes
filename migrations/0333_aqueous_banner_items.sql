-- 0333: 수성 현수막 세트 (단순 구조 — 인쇄방식별 개별제품 + 폭별원단 + 연결). 폭은 width_mm(이름엔 미표기).
-- 제품=수성 현수막(2코팅)·게릴라 현수막(저밀도). 원단=매입+판매 겸업(dual), 폭별 재고. product_materials 연결→autoDeductInventory.
DELETE FROM product_materials WHERE product_item_id IN (SELECT id FROM items WHERE item_code LIKE 'AQ-%') OR material_item_id IN (SELECT id FROM items WHERE item_code LIKE 'AQ1-%' OR item_code LIKE 'AQ2-%' OR item_code LIKE 'AQD-%');
DELETE FROM items WHERE item_code LIKE 'AQ-%' OR item_code LIKE 'AQ1-%' OR item_code LIKE 'AQ2-%' OR item_code LIKE 'AQD-%';
INSERT INTO items (item_code,item_name,item_type,category,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,is_active,unit) VALUES
('AQ-BANNER','수성 현수막','PRODUCT','수성',(SELECT id FROM item_categories WHERE category_code='AQUEOUS'),'AREA','AREA',1,0,1,1,'EA'),
('AQ-GERILLA','게릴라 현수막','PRODUCT','수성',(SELECT id FROM item_categories WHERE category_code='AQUEOUS'),'AREA','AREA',1,0,1,1,'EA');
INSERT INTO items (item_code,item_name,item_type,category,category_id,width_mm,item_group,is_sales_item,is_purchase_item,production_required,is_active,unit) VALUES
('AQ1-030','수성 현수막원단 1코팅','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),300,'수성 현수막원단 1코팅',1,1,0,1,'yd'),
('AQ1-040','수성 현수막원단 1코팅','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),400,'수성 현수막원단 1코팅',1,1,0,1,'yd'),
('AQ1-045','수성 현수막원단 1코팅','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),450,'수성 현수막원단 1코팅',1,1,0,1,'yd'),
('AQ1-050','수성 현수막원단 1코팅','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),500,'수성 현수막원단 1코팅',1,1,0,1,'yd'),
('AQ1-060','수성 현수막원단 1코팅','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),600,'수성 현수막원단 1코팅',1,1,0,1,'yd'),
('AQ1-070','수성 현수막원단 1코팅','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),700,'수성 현수막원단 1코팅',1,1,0,1,'yd'),
('AQ1-080','수성 현수막원단 1코팅','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),800,'수성 현수막원단 1코팅',1,1,0,1,'yd'),
('AQ1-090','수성 현수막원단 1코팅','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),900,'수성 현수막원단 1코팅',1,1,0,1,'yd'),
('AQ1-095','수성 현수막원단 1코팅','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),950,'수성 현수막원단 1코팅',1,1,0,1,'yd'),
('AQ1-100','수성 현수막원단 1코팅','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),1000,'수성 현수막원단 1코팅',1,1,0,1,'yd'),
('AQ1-105','수성 현수막원단 1코팅','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),1050,'수성 현수막원단 1코팅',1,1,0,1,'yd'),
('AQ1-110','수성 현수막원단 1코팅','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),1100,'수성 현수막원단 1코팅',1,1,0,1,'yd'),
('AQ1-120','수성 현수막원단 1코팅','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),1200,'수성 현수막원단 1코팅',1,1,0,1,'yd'),
('AQ1-127','수성 현수막원단 1코팅','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),1270,'수성 현수막원단 1코팅',1,1,0,1,'yd'),
('AQ1-130','수성 현수막원단 1코팅','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),1300,'수성 현수막원단 1코팅',1,1,0,1,'yd'),
('AQ1-137','수성 현수막원단 1코팅','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),1370,'수성 현수막원단 1코팅',1,1,0,1,'yd'),
('AQ1-140','수성 현수막원단 1코팅','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),1400,'수성 현수막원단 1코팅',1,1,0,1,'yd'),
('AQ1-150','수성 현수막원단 1코팅','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),1500,'수성 현수막원단 1코팅',1,1,0,1,'yd'),
('AQ1-160','수성 현수막원단 1코팅','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),1600,'수성 현수막원단 1코팅',1,1,0,1,'yd'),
('AQ1-170','수성 현수막원단 1코팅','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),1700,'수성 현수막원단 1코팅',1,1,0,1,'yd'),
('AQ1-180','수성 현수막원단 1코팅','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),1800,'수성 현수막원단 1코팅',1,1,0,1,'yd');
INSERT INTO items (item_code,item_name,item_type,category,category_id,width_mm,item_group,is_sales_item,is_purchase_item,production_required,is_active,unit) VALUES
('AQ2-030','수성 현수막원단 2코팅','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),300,'수성 현수막원단 2코팅',1,1,0,1,'yd'),
('AQ2-040','수성 현수막원단 2코팅','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),400,'수성 현수막원단 2코팅',1,1,0,1,'yd'),
('AQ2-045','수성 현수막원단 2코팅','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),450,'수성 현수막원단 2코팅',1,1,0,1,'yd'),
('AQ2-050','수성 현수막원단 2코팅','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),500,'수성 현수막원단 2코팅',1,1,0,1,'yd'),
('AQ2-060','수성 현수막원단 2코팅','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),600,'수성 현수막원단 2코팅',1,1,0,1,'yd'),
('AQ2-070','수성 현수막원단 2코팅','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),700,'수성 현수막원단 2코팅',1,1,0,1,'yd'),
('AQ2-080','수성 현수막원단 2코팅','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),800,'수성 현수막원단 2코팅',1,1,0,1,'yd'),
('AQ2-090','수성 현수막원단 2코팅','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),900,'수성 현수막원단 2코팅',1,1,0,1,'yd'),
('AQ2-095','수성 현수막원단 2코팅','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),950,'수성 현수막원단 2코팅',1,1,0,1,'yd'),
('AQ2-100','수성 현수막원단 2코팅','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),1000,'수성 현수막원단 2코팅',1,1,0,1,'yd'),
('AQ2-105','수성 현수막원단 2코팅','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),1050,'수성 현수막원단 2코팅',1,1,0,1,'yd'),
('AQ2-110','수성 현수막원단 2코팅','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),1100,'수성 현수막원단 2코팅',1,1,0,1,'yd'),
('AQ2-120','수성 현수막원단 2코팅','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),1200,'수성 현수막원단 2코팅',1,1,0,1,'yd'),
('AQ2-127','수성 현수막원단 2코팅','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),1270,'수성 현수막원단 2코팅',1,1,0,1,'yd'),
('AQ2-130','수성 현수막원단 2코팅','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),1300,'수성 현수막원단 2코팅',1,1,0,1,'yd'),
('AQ2-137','수성 현수막원단 2코팅','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),1370,'수성 현수막원단 2코팅',1,1,0,1,'yd'),
('AQ2-140','수성 현수막원단 2코팅','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),1400,'수성 현수막원단 2코팅',1,1,0,1,'yd'),
('AQ2-150','수성 현수막원단 2코팅','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),1500,'수성 현수막원단 2코팅',1,1,0,1,'yd'),
('AQ2-160','수성 현수막원단 2코팅','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),1600,'수성 현수막원단 2코팅',1,1,0,1,'yd'),
('AQ2-170','수성 현수막원단 2코팅','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),1700,'수성 현수막원단 2코팅',1,1,0,1,'yd'),
('AQ2-180','수성 현수막원단 2코팅','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),1800,'수성 현수막원단 2코팅',1,1,0,1,'yd'),
('AQ2-200','수성 현수막원단 2코팅','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),2000,'수성 현수막원단 2코팅',1,1,0,1,'yd'),
('AQ2-250','수성 현수막원단 2코팅','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),2500,'수성 현수막원단 2코팅',1,1,0,1,'yd'),
('AQ2-320','수성 현수막원단 2코팅','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),3200,'수성 현수막원단 2코팅',1,1,0,1,'yd');
INSERT INTO items (item_code,item_name,item_type,category,category_id,width_mm,item_group,is_sales_item,is_purchase_item,production_required,is_active,unit) VALUES
('AQD-090','수성 현수막원단 저밀도','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),900,'수성 현수막원단 저밀도',1,1,0,1,'yd');
INSERT INTO product_materials (product_item_id,material_item_id,is_default) SELECT (SELECT id FROM items WHERE item_code='AQ-BANNER'), id, 0 FROM items WHERE item_code LIKE 'AQ2-%';
INSERT INTO product_materials (product_item_id,material_item_id,is_default) SELECT (SELECT id FROM items WHERE item_code='AQ-GERILLA'), id, 1 FROM items WHERE item_code='AQD-090';
