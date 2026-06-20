-- 0328: 판재두께 변종 전개 (포맥스·아크릴·자작나무·스카시·광학산PC·폼보드)
-- base별 실제 주문 두께만(빈도 3+). base=템플릿(spec_value NULL), 변종=두께별 독립품목.
-- 전부 is_active=0 staged. spec_group_id=판재두께. 단가(base_price)는 후속.
-- 비파괴: NOT EXISTS 가드. 변종 코드 = {base}-{두께}.

-- 1) 판재두께 그룹값 보강 (base별 실제 두께 union)
INSERT INTO spec_group_values (group_id, value_code, label, sort_order, is_active)
SELECT (SELECT id FROM spec_groups WHERE name='판재두께'), '1T', '1T', 1, 1
WHERE NOT EXISTS (SELECT 1 FROM spec_group_values sgv JOIN spec_groups sg ON sgv.group_id=sg.id WHERE sg.name='판재두께' AND sgv.value_code='1T');
INSERT INTO spec_group_values (group_id, value_code, label, sort_order, is_active)
SELECT (SELECT id FROM spec_groups WHERE name='판재두께'), '2T', '2T', 2, 1
WHERE NOT EXISTS (SELECT 1 FROM spec_group_values sgv JOIN spec_groups sg ON sgv.group_id=sg.id WHERE sg.name='판재두께' AND sgv.value_code='2T');
INSERT INTO spec_group_values (group_id, value_code, label, sort_order, is_active)
SELECT (SELECT id FROM spec_groups WHERE name='판재두께'), '3T', '3T', 3, 1
WHERE NOT EXISTS (SELECT 1 FROM spec_group_values sgv JOIN spec_groups sg ON sgv.group_id=sg.id WHERE sg.name='판재두께' AND sgv.value_code='3T');
INSERT INTO spec_group_values (group_id, value_code, label, sort_order, is_active)
SELECT (SELECT id FROM spec_groups WHERE name='판재두께'), '5T', '5T', 5, 1
WHERE NOT EXISTS (SELECT 1 FROM spec_group_values sgv JOIN spec_groups sg ON sgv.group_id=sg.id WHERE sg.name='판재두께' AND sgv.value_code='5T');
INSERT INTO spec_group_values (group_id, value_code, label, sort_order, is_active)
SELECT (SELECT id FROM spec_groups WHERE name='판재두께'), '6T', '6T', 6, 1
WHERE NOT EXISTS (SELECT 1 FROM spec_group_values sgv JOIN spec_groups sg ON sgv.group_id=sg.id WHERE sg.name='판재두께' AND sgv.value_code='6T');
INSERT INTO spec_group_values (group_id, value_code, label, sort_order, is_active)
SELECT (SELECT id FROM spec_groups WHERE name='판재두께'), '8T', '8T', 8, 1
WHERE NOT EXISTS (SELECT 1 FROM spec_group_values sgv JOIN spec_groups sg ON sgv.group_id=sg.id WHERE sg.name='판재두께' AND sgv.value_code='8T');
INSERT INTO spec_group_values (group_id, value_code, label, sort_order, is_active)
SELECT (SELECT id FROM spec_groups WHERE name='판재두께'), '9T', '9T', 9, 1
WHERE NOT EXISTS (SELECT 1 FROM spec_group_values sgv JOIN spec_groups sg ON sgv.group_id=sg.id WHERE sg.name='판재두께' AND sgv.value_code='9T');
INSERT INTO spec_group_values (group_id, value_code, label, sort_order, is_active)
SELECT (SELECT id FROM spec_groups WHERE name='판재두께'), '10T', '10T', 10, 1
WHERE NOT EXISTS (SELECT 1 FROM spec_group_values sgv JOIN spec_groups sg ON sgv.group_id=sg.id WHERE sg.name='판재두께' AND sgv.value_code='10T');
INSERT INTO spec_group_values (group_id, value_code, label, sort_order, is_active)
SELECT (SELECT id FROM spec_groups WHERE name='판재두께'), '12T', '12T', 12, 1
WHERE NOT EXISTS (SELECT 1 FROM spec_group_values sgv JOIN spec_groups sg ON sgv.group_id=sg.id WHERE sg.name='판재두께' AND sgv.value_code='12T');
INSERT INTO spec_group_values (group_id, value_code, label, sort_order, is_active)
SELECT (SELECT id FROM spec_groups WHERE name='판재두께'), '20T', '20T', 20, 1
WHERE NOT EXISTS (SELECT 1 FROM spec_group_values sgv JOIN spec_groups sg ON sgv.group_id=sg.id WHERE sg.name='판재두께' AND sgv.value_code='20T');
INSERT INTO spec_group_values (group_id, value_code, label, sort_order, is_active)
SELECT (SELECT id FROM spec_groups WHERE name='판재두께'), '30T', '30T', 30, 1
WHERE NOT EXISTS (SELECT 1 FROM spec_group_values sgv JOIN spec_groups sg ON sgv.group_id=sg.id WHERE sg.name='판재두께' AND sgv.value_code='30T');

-- 포맥스 출력 (P-0133): 1T, 2T, 3T, 5T, 8T, 10T
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active,spec_group_id,item_group)
SELECT 'P-0133','포맥스 출력','PRODUCT',(SELECT id FROM item_categories WHERE category_name='판재출력'),'AREA','AREA',1,0,1,'EA',0,(SELECT id FROM spec_groups WHERE name='판재두께'),'포맥스 출력'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0133');
UPDATE items SET spec_group_id=(SELECT id FROM spec_groups WHERE name='판재두께'), item_group='포맥스 출력' WHERE item_code='P-0133' AND spec_group_id IS NULL;
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active,spec_group_id,spec_value,item_group)
SELECT 'P-0133-1T','포맥스 출력 1T','PRODUCT',(SELECT id FROM item_categories WHERE category_name='판재출력'),'AREA','AREA',1,0,1,'EA',0,(SELECT id FROM spec_groups WHERE name='판재두께'),'1T','포맥스 출력'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0133-1T');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active,spec_group_id,spec_value,item_group)
SELECT 'P-0133-2T','포맥스 출력 2T','PRODUCT',(SELECT id FROM item_categories WHERE category_name='판재출력'),'AREA','AREA',1,0,1,'EA',0,(SELECT id FROM spec_groups WHERE name='판재두께'),'2T','포맥스 출력'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0133-2T');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active,spec_group_id,spec_value,item_group)
SELECT 'P-0133-3T','포맥스 출력 3T','PRODUCT',(SELECT id FROM item_categories WHERE category_name='판재출력'),'AREA','AREA',1,0,1,'EA',0,(SELECT id FROM spec_groups WHERE name='판재두께'),'3T','포맥스 출력'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0133-3T');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active,spec_group_id,spec_value,item_group)
SELECT 'P-0133-5T','포맥스 출력 5T','PRODUCT',(SELECT id FROM item_categories WHERE category_name='판재출력'),'AREA','AREA',1,0,1,'EA',0,(SELECT id FROM spec_groups WHERE name='판재두께'),'5T','포맥스 출력'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0133-5T');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active,spec_group_id,spec_value,item_group)
SELECT 'P-0133-8T','포맥스 출력 8T','PRODUCT',(SELECT id FROM item_categories WHERE category_name='판재출력'),'AREA','AREA',1,0,1,'EA',0,(SELECT id FROM spec_groups WHERE name='판재두께'),'8T','포맥스 출력'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0133-8T');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active,spec_group_id,spec_value,item_group)
SELECT 'P-0133-10T','포맥스 출력 10T','PRODUCT',(SELECT id FROM item_categories WHERE category_name='판재출력'),'AREA','AREA',1,0,1,'EA',0,(SELECT id FROM spec_groups WHERE name='판재두께'),'10T','포맥스 출력'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0133-10T');

-- 아크릴 출력 (P-0135): 2T, 3T, 5T, 10T
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active,spec_group_id,item_group)
SELECT 'P-0135','아크릴 출력','PRODUCT',(SELECT id FROM item_categories WHERE category_name='판재출력'),'AREA','AREA',1,0,1,'EA',0,(SELECT id FROM spec_groups WHERE name='판재두께'),'아크릴 출력'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0135');
UPDATE items SET spec_group_id=(SELECT id FROM spec_groups WHERE name='판재두께'), item_group='아크릴 출력' WHERE item_code='P-0135' AND spec_group_id IS NULL;
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active,spec_group_id,spec_value,item_group)
SELECT 'P-0135-2T','아크릴 출력 2T','PRODUCT',(SELECT id FROM item_categories WHERE category_name='판재출력'),'AREA','AREA',1,0,1,'EA',0,(SELECT id FROM spec_groups WHERE name='판재두께'),'2T','아크릴 출력'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0135-2T');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active,spec_group_id,spec_value,item_group)
SELECT 'P-0135-3T','아크릴 출력 3T','PRODUCT',(SELECT id FROM item_categories WHERE category_name='판재출력'),'AREA','AREA',1,0,1,'EA',0,(SELECT id FROM spec_groups WHERE name='판재두께'),'3T','아크릴 출력'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0135-3T');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active,spec_group_id,spec_value,item_group)
SELECT 'P-0135-5T','아크릴 출력 5T','PRODUCT',(SELECT id FROM item_categories WHERE category_name='판재출력'),'AREA','AREA',1,0,1,'EA',0,(SELECT id FROM spec_groups WHERE name='판재두께'),'5T','아크릴 출력'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0135-5T');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active,spec_group_id,spec_value,item_group)
SELECT 'P-0135-10T','아크릴 출력 10T','PRODUCT',(SELECT id FROM item_categories WHERE category_name='판재출력'),'AREA','AREA',1,0,1,'EA',0,(SELECT id FROM spec_groups WHERE name='판재두께'),'10T','아크릴 출력'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0135-10T');

-- 자작나무 출력 (P-0077): 6T, 9T, 12T
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active,spec_group_id,item_group)
SELECT 'P-0077','자작나무 출력','PRODUCT',(SELECT id FROM item_categories WHERE category_name='판재출력'),'AREA','AREA',1,0,1,'EA',0,(SELECT id FROM spec_groups WHERE name='판재두께'),'자작나무 출력'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0077');
UPDATE items SET spec_group_id=(SELECT id FROM spec_groups WHERE name='판재두께'), item_group='자작나무 출력' WHERE item_code='P-0077' AND spec_group_id IS NULL;
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active,spec_group_id,spec_value,item_group)
SELECT 'P-0077-6T','자작나무 출력 6T','PRODUCT',(SELECT id FROM item_categories WHERE category_name='판재출력'),'AREA','AREA',1,0,1,'EA',0,(SELECT id FROM spec_groups WHERE name='판재두께'),'6T','자작나무 출력'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0077-6T');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active,spec_group_id,spec_value,item_group)
SELECT 'P-0077-9T','자작나무 출력 9T','PRODUCT',(SELECT id FROM item_categories WHERE category_name='판재출력'),'AREA','AREA',1,0,1,'EA',0,(SELECT id FROM spec_groups WHERE name='판재두께'),'9T','자작나무 출력'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0077-9T');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active,spec_group_id,spec_value,item_group)
SELECT 'P-0077-12T','자작나무 출력 12T','PRODUCT',(SELECT id FROM item_categories WHERE category_name='판재출력'),'AREA','AREA',1,0,1,'EA',0,(SELECT id FROM spec_groups WHERE name='판재두께'),'12T','자작나무 출력'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0077-12T');

-- 스카시 포맥스 출력 (P-0143): 10T, 20T, 30T
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active,spec_group_id,item_group)
SELECT 'P-0143','스카시 포맥스 출력','PRODUCT',(SELECT id FROM item_categories WHERE category_name='판재출력'),'AREA','AREA',1,0,1,'EA',0,(SELECT id FROM spec_groups WHERE name='판재두께'),'스카시 포맥스 출력'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0143');
UPDATE items SET spec_group_id=(SELECT id FROM spec_groups WHERE name='판재두께'), item_group='스카시 포맥스 출력' WHERE item_code='P-0143' AND spec_group_id IS NULL;
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active,spec_group_id,spec_value,item_group)
SELECT 'P-0143-10T','스카시 포맥스 출력 10T','PRODUCT',(SELECT id FROM item_categories WHERE category_name='판재출력'),'AREA','AREA',1,0,1,'EA',0,(SELECT id FROM spec_groups WHERE name='판재두께'),'10T','스카시 포맥스 출력'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0143-10T');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active,spec_group_id,spec_value,item_group)
SELECT 'P-0143-20T','스카시 포맥스 출력 20T','PRODUCT',(SELECT id FROM item_categories WHERE category_name='판재출력'),'AREA','AREA',1,0,1,'EA',0,(SELECT id FROM spec_groups WHERE name='판재두께'),'20T','스카시 포맥스 출력'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0143-20T');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active,spec_group_id,spec_value,item_group)
SELECT 'P-0143-30T','스카시 포맥스 출력 30T','PRODUCT',(SELECT id FROM item_categories WHERE category_name='판재출력'),'AREA','AREA',1,0,1,'EA',0,(SELECT id FROM spec_groups WHERE name='판재두께'),'30T','스카시 포맥스 출력'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0143-30T');

-- 광학산PC 출력 (P-0102): 2T, 3T
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active,spec_group_id,item_group)
SELECT 'P-0102','광학산PC 출력','PRODUCT',(SELECT id FROM item_categories WHERE category_name='판재출력'),'AREA','AREA',1,0,1,'EA',0,(SELECT id FROM spec_groups WHERE name='판재두께'),'광학산PC 출력'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0102');
UPDATE items SET spec_group_id=(SELECT id FROM spec_groups WHERE name='판재두께'), item_group='광학산PC 출력' WHERE item_code='P-0102' AND spec_group_id IS NULL;
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active,spec_group_id,spec_value,item_group)
SELECT 'P-0102-2T','광학산PC 출력 2T','PRODUCT',(SELECT id FROM item_categories WHERE category_name='판재출력'),'AREA','AREA',1,0,1,'EA',0,(SELECT id FROM spec_groups WHERE name='판재두께'),'2T','광학산PC 출력'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0102-2T');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active,spec_group_id,spec_value,item_group)
SELECT 'P-0102-3T','광학산PC 출력 3T','PRODUCT',(SELECT id FROM item_categories WHERE category_name='판재출력'),'AREA','AREA',1,0,1,'EA',0,(SELECT id FROM spec_groups WHERE name='판재두께'),'3T','광학산PC 출력'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0102-3T');

-- 폼보드 출력 (P-0134): 5T
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active,spec_group_id,item_group)
SELECT 'P-0134','폼보드 출력','PRODUCT',(SELECT id FROM item_categories WHERE category_name='판재출력'),'AREA','AREA',1,0,1,'EA',0,(SELECT id FROM spec_groups WHERE name='판재두께'),'폼보드 출력'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0134');
UPDATE items SET spec_group_id=(SELECT id FROM spec_groups WHERE name='판재두께'), item_group='폼보드 출력' WHERE item_code='P-0134' AND spec_group_id IS NULL;
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active,spec_group_id,spec_value,item_group)
SELECT 'P-0134-5T','폼보드 출력 5T','PRODUCT',(SELECT id FROM item_categories WHERE category_name='판재출력'),'AREA','AREA',1,0,1,'EA',0,(SELECT id FROM spec_groups WHERE name='판재두께'),'5T','폼보드 출력'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0134-5T');
