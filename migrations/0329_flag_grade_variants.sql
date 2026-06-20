-- 0329: 호수 변종 전개 (태극기·새마을기·무재해기·노인회기·민방위기·만국기)
-- base별 실제 주문 호수만(빈도 3+). 특수호수 4-1/7-1/8-1 그룹값 보강.
-- 전부 is_active=0 staged. spec_group_id=호수. 단가(base_price)=호수별, 후속.
-- 게양용/대형/영구용=base 통합(게양방식 후속 옵션). 깃발(P-0035)=이름확인 보류.

-- 1) 호수 그룹값 보강 (특수호수 등)
INSERT INTO spec_group_values (group_id, value_code, label, sort_order, is_active)
SELECT (SELECT id FROM spec_groups WHERE name='호수'), '1HO', '1호', 10, 1
WHERE NOT EXISTS (SELECT 1 FROM spec_group_values sgv JOIN spec_groups sg ON sgv.group_id=sg.id WHERE sg.name='호수' AND sgv.value_code='1HO');
INSERT INTO spec_group_values (group_id, value_code, label, sort_order, is_active)
SELECT (SELECT id FROM spec_groups WHERE name='호수'), '2HO', '2호', 20, 1
WHERE NOT EXISTS (SELECT 1 FROM spec_group_values sgv JOIN spec_groups sg ON sgv.group_id=sg.id WHERE sg.name='호수' AND sgv.value_code='2HO');
INSERT INTO spec_group_values (group_id, value_code, label, sort_order, is_active)
SELECT (SELECT id FROM spec_groups WHERE name='호수'), '3HO', '3호', 30, 1
WHERE NOT EXISTS (SELECT 1 FROM spec_group_values sgv JOIN spec_groups sg ON sgv.group_id=sg.id WHERE sg.name='호수' AND sgv.value_code='3HO');
INSERT INTO spec_group_values (group_id, value_code, label, sort_order, is_active)
SELECT (SELECT id FROM spec_groups WHERE name='호수'), '4HO', '4호', 40, 1
WHERE NOT EXISTS (SELECT 1 FROM spec_group_values sgv JOIN spec_groups sg ON sgv.group_id=sg.id WHERE sg.name='호수' AND sgv.value_code='4HO');
INSERT INTO spec_group_values (group_id, value_code, label, sort_order, is_active)
SELECT (SELECT id FROM spec_groups WHERE name='호수'), '4HO1', '4-1호', 41, 1
WHERE NOT EXISTS (SELECT 1 FROM spec_group_values sgv JOIN spec_groups sg ON sgv.group_id=sg.id WHERE sg.name='호수' AND sgv.value_code='4HO1');
INSERT INTO spec_group_values (group_id, value_code, label, sort_order, is_active)
SELECT (SELECT id FROM spec_groups WHERE name='호수'), '5HO', '5호', 50, 1
WHERE NOT EXISTS (SELECT 1 FROM spec_group_values sgv JOIN spec_groups sg ON sgv.group_id=sg.id WHERE sg.name='호수' AND sgv.value_code='5HO');
INSERT INTO spec_group_values (group_id, value_code, label, sort_order, is_active)
SELECT (SELECT id FROM spec_groups WHERE name='호수'), '6HO', '6호', 60, 1
WHERE NOT EXISTS (SELECT 1 FROM spec_group_values sgv JOIN spec_groups sg ON sgv.group_id=sg.id WHERE sg.name='호수' AND sgv.value_code='6HO');
INSERT INTO spec_group_values (group_id, value_code, label, sort_order, is_active)
SELECT (SELECT id FROM spec_groups WHERE name='호수'), '7HO', '7호', 70, 1
WHERE NOT EXISTS (SELECT 1 FROM spec_group_values sgv JOIN spec_groups sg ON sgv.group_id=sg.id WHERE sg.name='호수' AND sgv.value_code='7HO');
INSERT INTO spec_group_values (group_id, value_code, label, sort_order, is_active)
SELECT (SELECT id FROM spec_groups WHERE name='호수'), '7HO1', '7-1호', 71, 1
WHERE NOT EXISTS (SELECT 1 FROM spec_group_values sgv JOIN spec_groups sg ON sgv.group_id=sg.id WHERE sg.name='호수' AND sgv.value_code='7HO1');
INSERT INTO spec_group_values (group_id, value_code, label, sort_order, is_active)
SELECT (SELECT id FROM spec_groups WHERE name='호수'), '8HO', '8호', 80, 1
WHERE NOT EXISTS (SELECT 1 FROM spec_group_values sgv JOIN spec_groups sg ON sgv.group_id=sg.id WHERE sg.name='호수' AND sgv.value_code='8HO');
INSERT INTO spec_group_values (group_id, value_code, label, sort_order, is_active)
SELECT (SELECT id FROM spec_groups WHERE name='호수'), '8HO1', '8-1호', 81, 1
WHERE NOT EXISTS (SELECT 1 FROM spec_group_values sgv JOIN spec_groups sg ON sgv.group_id=sg.id WHERE sg.name='호수' AND sgv.value_code='8HO1');
INSERT INTO spec_group_values (group_id, value_code, label, sort_order, is_active)
SELECT (SELECT id FROM spec_groups WHERE name='호수'), '9HO', '9호', 90, 1
WHERE NOT EXISTS (SELECT 1 FROM spec_group_values sgv JOIN spec_groups sg ON sgv.group_id=sg.id WHERE sg.name='호수' AND sgv.value_code='9HO');

-- 태극기 (P-0033): 1호, 2호, 3호, 4호, 4-1호, 5호, 6호, 7호, 7-1호, 8호, 8-1호, 9호
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active,spec_group_id,item_group)
SELECT 'P-0033','태극기','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0,(SELECT id FROM spec_groups WHERE name='호수'),'태극기'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0033');
UPDATE items SET spec_group_id=(SELECT id FROM spec_groups WHERE name='호수'), item_group='태극기' WHERE item_code='P-0033' AND spec_group_id IS NULL;
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active,spec_group_id,spec_value,item_group)
SELECT 'P-0033-1HO','태극기 1호','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0,(SELECT id FROM spec_groups WHERE name='호수'),'1HO','태극기'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0033-1HO');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active,spec_group_id,spec_value,item_group)
SELECT 'P-0033-2HO','태극기 2호','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0,(SELECT id FROM spec_groups WHERE name='호수'),'2HO','태극기'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0033-2HO');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active,spec_group_id,spec_value,item_group)
SELECT 'P-0033-3HO','태극기 3호','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0,(SELECT id FROM spec_groups WHERE name='호수'),'3HO','태극기'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0033-3HO');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active,spec_group_id,spec_value,item_group)
SELECT 'P-0033-4HO','태극기 4호','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0,(SELECT id FROM spec_groups WHERE name='호수'),'4HO','태극기'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0033-4HO');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active,spec_group_id,spec_value,item_group)
SELECT 'P-0033-4HO1','태극기 4-1호','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0,(SELECT id FROM spec_groups WHERE name='호수'),'4HO1','태극기'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0033-4HO1');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active,spec_group_id,spec_value,item_group)
SELECT 'P-0033-5HO','태극기 5호','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0,(SELECT id FROM spec_groups WHERE name='호수'),'5HO','태극기'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0033-5HO');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active,spec_group_id,spec_value,item_group)
SELECT 'P-0033-6HO','태극기 6호','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0,(SELECT id FROM spec_groups WHERE name='호수'),'6HO','태극기'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0033-6HO');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active,spec_group_id,spec_value,item_group)
SELECT 'P-0033-7HO','태극기 7호','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0,(SELECT id FROM spec_groups WHERE name='호수'),'7HO','태극기'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0033-7HO');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active,spec_group_id,spec_value,item_group)
SELECT 'P-0033-7HO1','태극기 7-1호','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0,(SELECT id FROM spec_groups WHERE name='호수'),'7HO1','태극기'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0033-7HO1');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active,spec_group_id,spec_value,item_group)
SELECT 'P-0033-8HO','태극기 8호','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0,(SELECT id FROM spec_groups WHERE name='호수'),'8HO','태극기'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0033-8HO');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active,spec_group_id,spec_value,item_group)
SELECT 'P-0033-8HO1','태극기 8-1호','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0,(SELECT id FROM spec_groups WHERE name='호수'),'8HO1','태극기'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0033-8HO1');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active,spec_group_id,spec_value,item_group)
SELECT 'P-0033-9HO','태극기 9호','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0,(SELECT id FROM spec_groups WHERE name='호수'),'9HO','태극기'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0033-9HO');

-- 새마을기 (P-0039): 4호, 7호, 7-1호, 8호
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active,spec_group_id,item_group)
SELECT 'P-0039','새마을기','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0,(SELECT id FROM spec_groups WHERE name='호수'),'새마을기'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0039');
UPDATE items SET spec_group_id=(SELECT id FROM spec_groups WHERE name='호수'), item_group='새마을기' WHERE item_code='P-0039' AND spec_group_id IS NULL;
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active,spec_group_id,spec_value,item_group)
SELECT 'P-0039-4HO','새마을기 4호','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0,(SELECT id FROM spec_groups WHERE name='호수'),'4HO','새마을기'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0039-4HO');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active,spec_group_id,spec_value,item_group)
SELECT 'P-0039-7HO','새마을기 7호','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0,(SELECT id FROM spec_groups WHERE name='호수'),'7HO','새마을기'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0039-7HO');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active,spec_group_id,spec_value,item_group)
SELECT 'P-0039-7HO1','새마을기 7-1호','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0,(SELECT id FROM spec_groups WHERE name='호수'),'7HO1','새마을기'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0039-7HO1');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active,spec_group_id,spec_value,item_group)
SELECT 'P-0039-8HO','새마을기 8호','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0,(SELECT id FROM spec_groups WHERE name='호수'),'8HO','새마을기'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0039-8HO');

-- 무재해기 (P-0060): 7호, 7-1호, 8호
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active,spec_group_id,item_group)
SELECT 'P-0060','무재해기','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0,(SELECT id FROM spec_groups WHERE name='호수'),'무재해기'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0060');
UPDATE items SET spec_group_id=(SELECT id FROM spec_groups WHERE name='호수'), item_group='무재해기' WHERE item_code='P-0060' AND spec_group_id IS NULL;
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active,spec_group_id,spec_value,item_group)
SELECT 'P-0060-7HO','무재해기 7호','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0,(SELECT id FROM spec_groups WHERE name='호수'),'7HO','무재해기'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0060-7HO');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active,spec_group_id,spec_value,item_group)
SELECT 'P-0060-7HO1','무재해기 7-1호','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0,(SELECT id FROM spec_groups WHERE name='호수'),'7HO1','무재해기'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0060-7HO1');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active,spec_group_id,spec_value,item_group)
SELECT 'P-0060-8HO','무재해기 8호','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0,(SELECT id FROM spec_groups WHERE name='호수'),'8HO','무재해기'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0060-8HO');

-- 노인회기 (P-0044): 7호, 7-1호, 8호
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active,spec_group_id,item_group)
SELECT 'P-0044','노인회기','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0,(SELECT id FROM spec_groups WHERE name='호수'),'노인회기'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0044');
UPDATE items SET spec_group_id=(SELECT id FROM spec_groups WHERE name='호수'), item_group='노인회기' WHERE item_code='P-0044' AND spec_group_id IS NULL;
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active,spec_group_id,spec_value,item_group)
SELECT 'P-0044-7HO','노인회기 7호','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0,(SELECT id FROM spec_groups WHERE name='호수'),'7HO','노인회기'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0044-7HO');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active,spec_group_id,spec_value,item_group)
SELECT 'P-0044-7HO1','노인회기 7-1호','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0,(SELECT id FROM spec_groups WHERE name='호수'),'7HO1','노인회기'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0044-7HO1');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active,spec_group_id,spec_value,item_group)
SELECT 'P-0044-8HO','노인회기 8호','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0,(SELECT id FROM spec_groups WHERE name='호수'),'8HO','노인회기'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0044-8HO');

-- 민방위기 (P-0050): 7호, 7-1호
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active,spec_group_id,item_group)
SELECT 'P-0050','민방위기','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0,(SELECT id FROM spec_groups WHERE name='호수'),'민방위기'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0050');
UPDATE items SET spec_group_id=(SELECT id FROM spec_groups WHERE name='호수'), item_group='민방위기' WHERE item_code='P-0050' AND spec_group_id IS NULL;
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active,spec_group_id,spec_value,item_group)
SELECT 'P-0050-7HO','민방위기 7호','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0,(SELECT id FROM spec_groups WHERE name='호수'),'7HO','민방위기'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0050-7HO');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active,spec_group_id,spec_value,item_group)
SELECT 'P-0050-7HO1','민방위기 7-1호','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0,(SELECT id FROM spec_groups WHERE name='호수'),'7HO1','민방위기'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0050-7HO1');

-- 만국기 (P-0048): 7호, 8호
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active,spec_group_id,item_group)
SELECT 'P-0048','만국기','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0,(SELECT id FROM spec_groups WHERE name='호수'),'만국기'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0048');
UPDATE items SET spec_group_id=(SELECT id FROM spec_groups WHERE name='호수'), item_group='만국기' WHERE item_code='P-0048' AND spec_group_id IS NULL;
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active,spec_group_id,spec_value,item_group)
SELECT 'P-0048-7HO','만국기 7호','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0,(SELECT id FROM spec_groups WHERE name='호수'),'7HO','만국기'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0048-7HO');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active,spec_group_id,spec_value,item_group)
SELECT 'P-0048-8HO','만국기 8호','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0,(SELECT id FROM spec_groups WHERE name='호수'),'8HO','만국기'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0048-8HO');
