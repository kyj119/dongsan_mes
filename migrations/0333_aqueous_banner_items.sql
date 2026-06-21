-- 0333: 수성 현수막 세트 (단순 구조 모델 — 인쇄방식별 개별제품 + 폭별 원단 + 연결)
-- 용준님 결정 2026-06-21: 제품=수성 현수막(2코팅 출력)·게릴라 현수막(저밀도 출력).
--   원단 46폭(1코팅21 판매전용 / 2코팅24 / 저밀도1) = 매입+판매 겸업(dual flag), 폭별 재고.
--   제품↔원단 연결(product_materials) → 생산 시 autoDeductInventory 폭매칭·면적→yd 자동차감.
-- 멱등(DELETE 후 재생성). 코드: AQ-(제품)·AQ1/AQ2/AQD-(원단, 폭 cm 3자리).
DELETE FROM product_materials WHERE product_item_id IN (SELECT id FROM items WHERE item_code LIKE 'AQ-%') OR material_item_id IN (SELECT id FROM items WHERE item_code LIKE 'AQ1-%' OR item_code LIKE 'AQ2-%' OR item_code LIKE 'AQD-%');
DELETE FROM items WHERE item_code LIKE 'AQ-%' OR item_code LIKE 'AQ1-%' OR item_code LIKE 'AQ2-%' OR item_code LIKE 'AQD-%';
INSERT INTO items (item_code,item_name,item_type,category,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,is_active,unit) VALUES
('AQ-BANNER','수성 현수막','PRODUCT','수성',(SELECT id FROM item_categories WHERE category_code='AQUEOUS'),'AREA','AREA',1,0,1,1,'EA'),
('AQ-GERILLA','게릴라 현수막','PRODUCT','수성',(SELECT id FROM item_categories WHERE category_code='AQUEOUS'),'AREA','AREA',1,0,1,1,'EA');
INSERT INTO items (item_code,item_name,item_type,category,category_id,width_mm,is_sales_item,is_purchase_item,production_required,is_active,unit) VALUES
('AQ1-030','수성 현수막원단 1코팅 30폭','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),300,1,1,0,1,'yd'),
('AQ1-040','수성 현수막원단 1코팅 40폭','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),400,1,1,0,1,'yd'),
('AQ1-045','수성 현수막원단 1코팅 45폭','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),450,1,1,0,1,'yd'),
('AQ1-050','수성 현수막원단 1코팅 50폭','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),500,1,1,0,1,'yd'),
('AQ1-060','수성 현수막원단 1코팅 60폭','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),600,1,1,0,1,'yd'),
('AQ1-070','수성 현수막원단 1코팅 70폭','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),700,1,1,0,1,'yd'),
('AQ1-080','수성 현수막원단 1코팅 80폭','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),800,1,1,0,1,'yd'),
('AQ1-090','수성 현수막원단 1코팅 90폭','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),900,1,1,0,1,'yd'),
('AQ1-095','수성 현수막원단 1코팅 95폭','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),950,1,1,0,1,'yd'),
('AQ1-100','수성 현수막원단 1코팅 100폭','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),1000,1,1,0,1,'yd'),
('AQ1-105','수성 현수막원단 1코팅 105폭','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),1050,1,1,0,1,'yd'),
('AQ1-110','수성 현수막원단 1코팅 110폭','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),1100,1,1,0,1,'yd'),
('AQ1-120','수성 현수막원단 1코팅 120폭','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),1200,1,1,0,1,'yd'),
('AQ1-127','수성 현수막원단 1코팅 127폭','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),1270,1,1,0,1,'yd'),
('AQ1-130','수성 현수막원단 1코팅 130폭','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),1300,1,1,0,1,'yd'),
('AQ1-137','수성 현수막원단 1코팅 137폭','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),1370,1,1,0,1,'yd'),
('AQ1-140','수성 현수막원단 1코팅 140폭','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),1400,1,1,0,1,'yd'),
('AQ1-150','수성 현수막원단 1코팅 150폭','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),1500,1,1,0,1,'yd'),
('AQ1-160','수성 현수막원단 1코팅 160폭','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),1600,1,1,0,1,'yd'),
('AQ1-170','수성 현수막원단 1코팅 170폭','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),1700,1,1,0,1,'yd'),
('AQ1-180','수성 현수막원단 1코팅 180폭','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),1800,1,1,0,1,'yd');
INSERT INTO items (item_code,item_name,item_type,category,category_id,width_mm,is_sales_item,is_purchase_item,production_required,is_active,unit) VALUES
('AQ2-030','수성 현수막원단 2코팅 30폭','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),300,1,1,0,1,'yd'),
('AQ2-040','수성 현수막원단 2코팅 40폭','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),400,1,1,0,1,'yd'),
('AQ2-045','수성 현수막원단 2코팅 45폭','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),450,1,1,0,1,'yd'),
('AQ2-050','수성 현수막원단 2코팅 50폭','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),500,1,1,0,1,'yd'),
('AQ2-060','수성 현수막원단 2코팅 60폭','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),600,1,1,0,1,'yd'),
('AQ2-070','수성 현수막원단 2코팅 70폭','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),700,1,1,0,1,'yd'),
('AQ2-080','수성 현수막원단 2코팅 80폭','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),800,1,1,0,1,'yd'),
('AQ2-090','수성 현수막원단 2코팅 90폭','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),900,1,1,0,1,'yd'),
('AQ2-095','수성 현수막원단 2코팅 95폭','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),950,1,1,0,1,'yd'),
('AQ2-100','수성 현수막원단 2코팅 100폭','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),1000,1,1,0,1,'yd'),
('AQ2-105','수성 현수막원단 2코팅 105폭','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),1050,1,1,0,1,'yd'),
('AQ2-110','수성 현수막원단 2코팅 110폭','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),1100,1,1,0,1,'yd'),
('AQ2-120','수성 현수막원단 2코팅 120폭','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),1200,1,1,0,1,'yd'),
('AQ2-127','수성 현수막원단 2코팅 127폭','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),1270,1,1,0,1,'yd'),
('AQ2-130','수성 현수막원단 2코팅 130폭','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),1300,1,1,0,1,'yd'),
('AQ2-137','수성 현수막원단 2코팅 137폭','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),1370,1,1,0,1,'yd'),
('AQ2-140','수성 현수막원단 2코팅 140폭','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),1400,1,1,0,1,'yd'),
('AQ2-150','수성 현수막원단 2코팅 150폭','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),1500,1,1,0,1,'yd'),
('AQ2-160','수성 현수막원단 2코팅 160폭','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),1600,1,1,0,1,'yd'),
('AQ2-170','수성 현수막원단 2코팅 170폭','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),1700,1,1,0,1,'yd'),
('AQ2-180','수성 현수막원단 2코팅 180폭','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),1800,1,1,0,1,'yd'),
('AQ2-200','수성 현수막원단 2코팅 200폭','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),2000,1,1,0,1,'yd'),
('AQ2-250','수성 현수막원단 2코팅 250폭','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),2500,1,1,0,1,'yd'),
('AQ2-320','수성 현수막원단 2코팅 320폭','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),3200,1,1,0,1,'yd');
INSERT INTO items (item_code,item_name,item_type,category,category_id,width_mm,is_sales_item,is_purchase_item,production_required,is_active,unit) VALUES
('AQD-090','수성 현수막원단 저밀도 90폭','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),900,1,1,0,1,'yd');
INSERT INTO product_materials (product_item_id,material_item_id,is_default) SELECT (SELECT id FROM items WHERE item_code='AQ-BANNER'), id, 0 FROM items WHERE item_code LIKE 'AQ2-%';
INSERT INTO product_materials (product_item_id,material_item_id,is_default) SELECT (SELECT id FROM items WHERE item_code='AQ-GERILLA'), id, 1 FROM items WHERE item_code='AQD-090';
