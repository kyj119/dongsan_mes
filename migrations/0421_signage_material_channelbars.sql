-- 0421_signage_material_channelbars.sql
-- 간판 사업부 자재 Phase ① 채널바류 (매입기준·선명 매입내역)
-- 모델: category=원자재 · sub_category=간판자재 · item_type=MATERIAL · deduction=NONE(간판BOM 보류=수동) · EA · 매입전용
-- 변종: spec_group(간판색상 × 간판바규격). base=템플릿(is_active=0), 변종=실매입분(is_active=1). 색상 단가동일·규격 단가차등.
-- 단가=매입 부가세별도. 색상 팔레트 14색 전체 정의(신색은 운영 중 변종생성).

-- spec_groups
INSERT INTO spec_groups (name,unit,sort_order,is_active) SELECT '간판색상','색',60,1 WHERE NOT EXISTS (SELECT 1 FROM spec_groups WHERE name='간판색상');
INSERT INTO spec_groups (name,unit,sort_order,is_active) SELECT '간판바규격','mm',61,1 WHERE NOT EXISTS (SELECT 1 FROM spec_groups WHERE name='간판바규격');

-- 간판색상 값
INSERT INTO spec_group_values (group_id,value_code,label,sort_order,is_active) SELECT (SELECT id FROM spec_groups WHERE name='간판색상'),'BK','흑색',10,1 WHERE NOT EXISTS (SELECT 1 FROM spec_group_values WHERE group_id=(SELECT id FROM spec_groups WHERE name='간판색상') AND value_code='BK');
INSERT INTO spec_group_values (group_id,value_code,label,sort_order,is_active) SELECT (SELECT id FROM spec_groups WHERE name='간판색상'),'WH','백색',20,1 WHERE NOT EXISTS (SELECT 1 FROM spec_group_values WHERE group_id=(SELECT id FROM spec_groups WHERE name='간판색상') AND value_code='WH');
INSERT INTO spec_group_values (group_id,value_code,label,sort_order,is_active) SELECT (SELECT id FROM spec_groups WHERE name='간판색상'),'GN','녹색',30,1 WHERE NOT EXISTS (SELECT 1 FROM spec_group_values WHERE group_id=(SELECT id FROM spec_groups WHERE name='간판색상') AND value_code='GN');
INSERT INTO spec_group_values (group_id,value_code,label,sort_order,is_active) SELECT (SELECT id FROM spec_groups WHERE name='간판색상'),'YL','황색',40,1 WHERE NOT EXISTS (SELECT 1 FROM spec_group_values WHERE group_id=(SELECT id FROM spec_groups WHERE name='간판색상') AND value_code='YL');
INSERT INTO spec_group_values (group_id,value_code,label,sort_order,is_active) SELECT (SELECT id FROM spec_groups WHERE name='간판색상'),'OR','주황색',50,1 WHERE NOT EXISTS (SELECT 1 FROM spec_group_values WHERE group_id=(SELECT id FROM spec_groups WHERE name='간판색상') AND value_code='OR');
INSERT INTO spec_group_values (group_id,value_code,label,sort_order,is_active) SELECT (SELECT id FROM spec_groups WHERE name='간판색상'),'NB','진청색',60,1 WHERE NOT EXISTS (SELECT 1 FROM spec_group_values WHERE group_id=(SELECT id FROM spec_groups WHERE name='간판색상') AND value_code='NB');
INSERT INTO spec_group_values (group_id,value_code,label,sort_order,is_active) SELECT (SELECT id FROM spec_groups WHERE name='간판색상'),'LB','연청색',70,1 WHERE NOT EXISTS (SELECT 1 FROM spec_group_values WHERE group_id=(SELECT id FROM spec_groups WHERE name='간판색상') AND value_code='LB');
INSERT INTO spec_group_values (group_id,value_code,label,sort_order,is_active) SELECT (SELECT id FROM spec_groups WHERE name='간판색상'),'BR','밤색',80,1 WHERE NOT EXISTS (SELECT 1 FROM spec_group_values WHERE group_id=(SELECT id FROM spec_groups WHERE name='간판색상') AND value_code='BR');
INSERT INTO spec_group_values (group_id,value_code,label,sort_order,is_active) SELECT (SELECT id FROM spec_groups WHERE name='간판색상'),'DG','진회색',90,1 WHERE NOT EXISTS (SELECT 1 FROM spec_group_values WHERE group_id=(SELECT id FROM spec_groups WHERE name='간판색상') AND value_code='DG');
INSERT INTO spec_group_values (group_id,value_code,label,sort_order,is_active) SELECT (SELECT id FROM spec_groups WHERE name='간판색상'),'LG','연회색',100,1 WHERE NOT EXISTS (SELECT 1 FROM spec_group_values WHERE group_id=(SELECT id FROM spec_groups WHERE name='간판색상') AND value_code='LG');
INSERT INTO spec_group_values (group_id,value_code,label,sort_order,is_active) SELECT (SELECT id FROM spec_groups WHERE name='간판색상'),'DP','진핑크',110,1 WHERE NOT EXISTS (SELECT 1 FROM spec_group_values WHERE group_id=(SELECT id FROM spec_groups WHERE name='간판색상') AND value_code='DP');
INSERT INTO spec_group_values (group_id,value_code,label,sort_order,is_active) SELECT (SELECT id FROM spec_groups WHERE name='간판색상'),'LP','연핑크',120,1 WHERE NOT EXISTS (SELECT 1 FROM spec_group_values WHERE group_id=(SELECT id FROM spec_groups WHERE name='간판색상') AND value_code='LP');
INSERT INTO spec_group_values (group_id,value_code,label,sort_order,is_active) SELECT (SELECT id FROM spec_groups WHERE name='간판색상'),'YG','연두',130,1 WHERE NOT EXISTS (SELECT 1 FROM spec_group_values WHERE group_id=(SELECT id FROM spec_groups WHERE name='간판색상') AND value_code='YG');
INSERT INTO spec_group_values (group_id,value_code,label,sort_order,is_active) SELECT (SELECT id FROM spec_groups WHERE name='간판색상'),'RD','적색',140,1 WHERE NOT EXISTS (SELECT 1 FROM spec_group_values WHERE group_id=(SELECT id FROM spec_groups WHERE name='간판색상') AND value_code='RD');

-- 간판바규격 값
INSERT INTO spec_group_values (group_id,value_code,label,sort_order,is_active) SELECT (SELECT id FROM spec_groups WHERE name='간판바규격'),'R150','150mm',10,1 WHERE NOT EXISTS (SELECT 1 FROM spec_group_values WHERE group_id=(SELECT id FROM spec_groups WHERE name='간판바규격') AND value_code='R150');
INSERT INTO spec_group_values (group_id,value_code,label,sort_order,is_active) SELECT (SELECT id FROM spec_groups WHERE name='간판바규격'),'R200','200mm',20,1 WHERE NOT EXISTS (SELECT 1 FROM spec_group_values WHERE group_id=(SELECT id FROM spec_groups WHERE name='간판바규격') AND value_code='R200');
INSERT INTO spec_group_values (group_id,value_code,label,sort_order,is_active) SELECT (SELECT id FROM spec_groups WHERE name='간판바규격'),'R250','250mm',30,1 WHERE NOT EXISTS (SELECT 1 FROM spec_group_values WHERE group_id=(SELECT id FROM spec_groups WHERE name='간판바규격') AND value_code='R250');
INSERT INTO spec_group_values (group_id,value_code,label,sort_order,is_active) SELECT (SELECT id FROM spec_groups WHERE name='간판바규격'),'R300','300mm',40,1 WHERE NOT EXISTS (SELECT 1 FROM spec_group_values WHERE group_id=(SELECT id FROM spec_groups WHERE name='간판바규격') AND value_code='R300');
INSERT INTO spec_group_values (group_id,value_code,label,sort_order,is_active) SELECT (SELECT id FROM spec_groups WHERE name='간판바규격'),'R400','400mm',50,1 WHERE NOT EXISTS (SELECT 1 FROM spec_group_values WHERE group_id=(SELECT id FROM spec_groups WHERE name='간판바규격') AND value_code='R400');

-- ■ 입체바 (SGM-IPB)
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-IPB','입체바','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,0,4800,'입체바','80mm*3m',(SELECT id FROM spec_groups WHERE name='간판색상'),NULL,NULL,NULL
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-IPB');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-IPB-BK','입체바 흑색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,4800,'입체바','80mm*3m',(SELECT id FROM spec_groups WHERE name='간판색상'),'BK',NULL,NULL
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-IPB-BK');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-IPB-WH','입체바 백색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,4800,'입체바','80mm*3m',(SELECT id FROM spec_groups WHERE name='간판색상'),'WH',NULL,NULL
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-IPB-WH');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-IPB-NB','입체바 진청색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,4800,'입체바','80mm*3m',(SELECT id FROM spec_groups WHERE name='간판색상'),'NB',NULL,NULL
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-IPB-NB');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-IPB-YL','입체바 황색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,4800,'입체바','80mm*3m',(SELECT id FROM spec_groups WHERE name='간판색상'),'YL',NULL,NULL
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-IPB-YL');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-IPB-GN','입체바 녹색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,4800,'입체바','80mm*3m',(SELECT id FROM spec_groups WHERE name='간판색상'),'GN',NULL,NULL
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-IPB-GN');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-IPB-OR','입체바 주황색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,4800,'입체바','80mm*3m',(SELECT id FROM spec_groups WHERE name='간판색상'),'OR',NULL,NULL
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-IPB-OR');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-IPB-BR','입체바 밤색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,4800,'입체바','80mm*3m',(SELECT id FROM spec_groups WHERE name='간판색상'),'BR',NULL,NULL
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-IPB-BR');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-IPB-DP','입체바 진핑크','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,4800,'입체바','80mm*3m',(SELECT id FROM spec_groups WHERE name='간판색상'),'DP',NULL,NULL
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-IPB-DP');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-IPB-LB','입체바 연청색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,4800,'입체바','80mm*3m',(SELECT id FROM spec_groups WHERE name='간판색상'),'LB',NULL,NULL
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-IPB-LB');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-IPB-DG','입체바 진회색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,4800,'입체바','80mm*3m',(SELECT id FROM spec_groups WHERE name='간판색상'),'DG',NULL,NULL
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-IPB-DG');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-IPB-LG','입체바 연회색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,4800,'입체바','80mm*3m',(SELECT id FROM spec_groups WHERE name='간판색상'),'LG',NULL,NULL
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-IPB-LG');

-- ■ 캡바 (SGM-KPB)
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-KPB','캡바','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,0,2050,'캡바','25mm*3m',(SELECT id FROM spec_groups WHERE name='간판색상'),NULL,NULL,NULL
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-KPB');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-KPB-BK','캡바 흑색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,2050,'캡바','25mm*3m',(SELECT id FROM spec_groups WHERE name='간판색상'),'BK',NULL,NULL
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-KPB-BK');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-KPB-WH','캡바 백색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,2050,'캡바','25mm*3m',(SELECT id FROM spec_groups WHERE name='간판색상'),'WH',NULL,NULL
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-KPB-WH');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-KPB-NB','캡바 진청색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,2050,'캡바','25mm*3m',(SELECT id FROM spec_groups WHERE name='간판색상'),'NB',NULL,NULL
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-KPB-NB');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-KPB-OR','캡바 주황색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,2050,'캡바','25mm*3m',(SELECT id FROM spec_groups WHERE name='간판색상'),'OR',NULL,NULL
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-KPB-OR');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-KPB-BR','캡바 밤색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,2050,'캡바','25mm*3m',(SELECT id FROM spec_groups WHERE name='간판색상'),'BR',NULL,NULL
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-KPB-BR');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-KPB-DG','캡바 진회색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,2050,'캡바','25mm*3m',(SELECT id FROM spec_groups WHERE name='간판색상'),'DG',NULL,NULL
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-KPB-DG');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-KPB-YL','캡바 황색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,2050,'캡바','25mm*3m',(SELECT id FROM spec_groups WHERE name='간판색상'),'YL',NULL,NULL
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-KPB-YL');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-KPB-GN','캡바 녹색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,2050,'캡바','25mm*3m',(SELECT id FROM spec_groups WHERE name='간판색상'),'GN',NULL,NULL
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-KPB-GN');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-KPB-RD','캡바 적색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,2050,'캡바','25mm*3m',(SELECT id FROM spec_groups WHERE name='간판색상'),'RD',NULL,NULL
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-KPB-RD');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-KPB-LB','캡바 연청색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,2050,'캡바','25mm*3m',(SELECT id FROM spec_groups WHERE name='간판색상'),'LB',NULL,NULL
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-KPB-LB');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-KPB-DP','캡바 진핑크','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,2050,'캡바','25mm*3m',(SELECT id FROM spec_groups WHERE name='간판색상'),'DP',NULL,NULL
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-KPB-DP');

-- ■ 트러스바 날개 (SGM-TRW)
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-TRW','트러스바 날개','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,0,31700,'트러스바 날개',NULL,(SELECT id FROM spec_groups WHERE name='간판색상'),NULL,NULL,NULL
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-TRW');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-TRW-BK','트러스바 날개 흑색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,31700,'트러스바 날개',NULL,(SELECT id FROM spec_groups WHERE name='간판색상'),'BK',NULL,NULL
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-TRW-BK');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-TRW-WH','트러스바 날개 백색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,31700,'트러스바 날개',NULL,(SELECT id FROM spec_groups WHERE name='간판색상'),'WH',NULL,NULL
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-TRW-WH');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-TRW-DG','트러스바 날개 진회색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,31700,'트러스바 날개',NULL,(SELECT id FROM spec_groups WHERE name='간판색상'),'DG',NULL,NULL
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-TRW-DG');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-TRW-LG','트러스바 날개 연회색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,31700,'트러스바 날개',NULL,(SELECT id FROM spec_groups WHERE name='간판색상'),'LG',NULL,NULL
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-TRW-LG');

-- ■ 하바 (SGM-HB)
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-HB','하바','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,0,26200,'하바',NULL,(SELECT id FROM spec_groups WHERE name='간판색상'),NULL,NULL,NULL
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-HB');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-HB-BK','하바 흑색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,26200,'하바',NULL,(SELECT id FROM spec_groups WHERE name='간판색상'),'BK',NULL,NULL
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-HB-BK');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-HB-WH','하바 백색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,26200,'하바',NULL,(SELECT id FROM spec_groups WHERE name='간판색상'),'WH',NULL,NULL
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-HB-WH');

-- ■ 카바 (SGM-CB)
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-CB','카바','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,0,11600,'카바',NULL,(SELECT id FROM spec_groups WHERE name='간판색상'),NULL,NULL,NULL
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-CB');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-CB-BK','카바 흑색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,11600,'카바',NULL,(SELECT id FROM spec_groups WHERE name='간판색상'),'BK',NULL,NULL
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-CB-BK');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-CB-WH','카바 백색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,11600,'카바',NULL,(SELECT id FROM spec_groups WHERE name='간판색상'),'WH',NULL,NULL
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-CB-WH');

-- ■ 상바 (SGM-SB)
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-SB','상바','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,25200,'상바',NULL,NULL,NULL,NULL,NULL
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-SB');

-- ■ 채널 보강대 (SGM-CRF)
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-CRF','채널 보강대','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,29400,'채널 보강대',NULL,NULL,NULL,NULL,NULL
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-CRF');

-- ■ 채널 지지대 (SGM-CSP)
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-CSP','채널 지지대','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,210,'채널 지지대','72mm',NULL,NULL,NULL,NULL
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-CSP');

-- ■ 트러스바 보강대 (SGM-TRF)
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-TRF','트러스바 보강대','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,330,'트러스바 보강대','200mm',NULL,NULL,NULL,NULL
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-TRF');

-- ■ 상코너 (SGM-SC)
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-SC','상코너','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,400,'상코너',NULL,NULL,NULL,NULL,NULL
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-SC');

-- ■ 하코너 (SGM-HC)
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-HC','하코너','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,400,'하코너',NULL,NULL,NULL,NULL,NULL
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-HC');

-- ■ 트러스바 (SGM-TRB)
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-TRB','트러스바','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,0,0,'트러스바',NULL,(SELECT id FROM spec_groups WHERE name='간판색상'),NULL,(SELECT id FROM spec_groups WHERE name='간판바규격'),NULL
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-TRB');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-TRB-R150-BK','트러스바 150mm 흑색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,63400,'트러스바','150mm',(SELECT id FROM spec_groups WHERE name='간판색상'),'BK',(SELECT id FROM spec_groups WHERE name='간판바규격'),'R150'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-TRB-R150-BK');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-TRB-R150-WH','트러스바 150mm 백색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,63400,'트러스바','150mm',(SELECT id FROM spec_groups WHERE name='간판색상'),'WH',(SELECT id FROM spec_groups WHERE name='간판바규격'),'R150'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-TRB-R150-WH');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-TRB-R150-LG','트러스바 150mm 연회색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,63400,'트러스바','150mm',(SELECT id FROM spec_groups WHERE name='간판색상'),'LG',(SELECT id FROM spec_groups WHERE name='간판바규격'),'R150'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-TRB-R150-LG');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-TRB-R150-DG','트러스바 150mm 진회색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,63400,'트러스바','150mm',(SELECT id FROM spec_groups WHERE name='간판색상'),'DG',(SELECT id FROM spec_groups WHERE name='간판바규격'),'R150'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-TRB-R150-DG');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-TRB-R200-BK','트러스바 200mm 흑색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,85000,'트러스바','200mm',(SELECT id FROM spec_groups WHERE name='간판색상'),'BK',(SELECT id FROM spec_groups WHERE name='간판바규격'),'R200'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-TRB-R200-BK');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-TRB-R200-WH','트러스바 200mm 백색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,85000,'트러스바','200mm',(SELECT id FROM spec_groups WHERE name='간판색상'),'WH',(SELECT id FROM spec_groups WHERE name='간판바규격'),'R200'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-TRB-R200-WH');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-TRB-R200-LG','트러스바 200mm 연회색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,85000,'트러스바','200mm',(SELECT id FROM spec_groups WHERE name='간판색상'),'LG',(SELECT id FROM spec_groups WHERE name='간판바규격'),'R200'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-TRB-R200-LG');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-TRB-R200-DG','트러스바 200mm 진회색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,85000,'트러스바','200mm',(SELECT id FROM spec_groups WHERE name='간판색상'),'DG',(SELECT id FROM spec_groups WHERE name='간판바규격'),'R200'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-TRB-R200-DG');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-TRB-R300-BK','트러스바 300mm 흑색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,180300,'트러스바','300mm',(SELECT id FROM spec_groups WHERE name='간판색상'),'BK',(SELECT id FROM spec_groups WHERE name='간판바규격'),'R300'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-TRB-R300-BK');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-TRB-R300-WH','트러스바 300mm 백색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,180300,'트러스바','300mm',(SELECT id FROM spec_groups WHERE name='간판색상'),'WH',(SELECT id FROM spec_groups WHERE name='간판바규격'),'R300'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-TRB-R300-WH');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-TRB-R300-LG','트러스바 300mm 연회색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,180300,'트러스바','300mm',(SELECT id FROM spec_groups WHERE name='간판색상'),'LG',(SELECT id FROM spec_groups WHERE name='간판바규격'),'R300'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-TRB-R300-LG');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-TRB-R300-DG','트러스바 300mm 진회색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,180300,'트러스바','300mm',(SELECT id FROM spec_groups WHERE name='간판색상'),'DG',(SELECT id FROM spec_groups WHERE name='간판바규격'),'R300'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-TRB-R300-DG');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-TRB-R400-BK','트러스바 400mm 흑색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,242500,'트러스바','400mm',(SELECT id FROM spec_groups WHERE name='간판색상'),'BK',(SELECT id FROM spec_groups WHERE name='간판바규격'),'R400'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-TRB-R400-BK');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-TRB-R400-WH','트러스바 400mm 백색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,242500,'트러스바','400mm',(SELECT id FROM spec_groups WHERE name='간판색상'),'WH',(SELECT id FROM spec_groups WHERE name='간판바규격'),'R400'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-TRB-R400-WH');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-TRB-R400-LG','트러스바 400mm 연회색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,242500,'트러스바','400mm',(SELECT id FROM spec_groups WHERE name='간판색상'),'LG',(SELECT id FROM spec_groups WHERE name='간판바규격'),'R400'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-TRB-R400-LG');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-TRB-R400-DG','트러스바 400mm 진회색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,242500,'트러스바','400mm',(SELECT id FROM spec_groups WHERE name='간판색상'),'DG',(SELECT id FROM spec_groups WHERE name='간판바규격'),'R400'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-TRB-R400-DG');

-- ■ 채널바 옆마구리 (SGM-CSM)
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-CSM','채널바 옆마구리','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,0,0,'채널바 옆마구리',NULL,(SELECT id FROM spec_groups WHERE name='간판색상'),NULL,(SELECT id FROM spec_groups WHERE name='간판바규격'),NULL
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-CSM');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-CSM-R150-BK','채널바 옆마구리 150mm 흑색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,2050,'채널바 옆마구리','150mm',(SELECT id FROM spec_groups WHERE name='간판색상'),'BK',(SELECT id FROM spec_groups WHERE name='간판바규격'),'R150'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-CSM-R150-BK');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-CSM-R150-WH','채널바 옆마구리 150mm 백색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,2050,'채널바 옆마구리','150mm',(SELECT id FROM spec_groups WHERE name='간판색상'),'WH',(SELECT id FROM spec_groups WHERE name='간판바규격'),'R150'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-CSM-R150-WH');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-CSM-R150-LG','채널바 옆마구리 150mm 연회색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,2050,'채널바 옆마구리','150mm',(SELECT id FROM spec_groups WHERE name='간판색상'),'LG',(SELECT id FROM spec_groups WHERE name='간판바규격'),'R150'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-CSM-R150-LG');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-CSM-R200-BK','채널바 옆마구리 200mm 흑색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,2250,'채널바 옆마구리','200mm',(SELECT id FROM spec_groups WHERE name='간판색상'),'BK',(SELECT id FROM spec_groups WHERE name='간판바규격'),'R200'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-CSM-R200-BK');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-CSM-R200-WH','채널바 옆마구리 200mm 백색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,2250,'채널바 옆마구리','200mm',(SELECT id FROM spec_groups WHERE name='간판색상'),'WH',(SELECT id FROM spec_groups WHERE name='간판바규격'),'R200'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-CSM-R200-WH');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-CSM-R200-LG','채널바 옆마구리 200mm 연회색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,2250,'채널바 옆마구리','200mm',(SELECT id FROM spec_groups WHERE name='간판색상'),'LG',(SELECT id FROM spec_groups WHERE name='간판바규격'),'R200'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-CSM-R200-LG');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-CSM-R250-BK','채널바 옆마구리 250mm 흑색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,2450,'채널바 옆마구리','250mm',(SELECT id FROM spec_groups WHERE name='간판색상'),'BK',(SELECT id FROM spec_groups WHERE name='간판바규격'),'R250'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-CSM-R250-BK');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-CSM-R250-WH','채널바 옆마구리 250mm 백색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,2450,'채널바 옆마구리','250mm',(SELECT id FROM spec_groups WHERE name='간판색상'),'WH',(SELECT id FROM spec_groups WHERE name='간판바규격'),'R250'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-CSM-R250-WH');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-CSM-R250-LG','채널바 옆마구리 250mm 연회색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,2450,'채널바 옆마구리','250mm',(SELECT id FROM spec_groups WHERE name='간판색상'),'LG',(SELECT id FROM spec_groups WHERE name='간판바규격'),'R250'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-CSM-R250-LG');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-CSM-R300-BK','채널바 옆마구리 300mm 흑색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,2800,'채널바 옆마구리','300mm',(SELECT id FROM spec_groups WHERE name='간판색상'),'BK',(SELECT id FROM spec_groups WHERE name='간판바규격'),'R300'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-CSM-R300-BK');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-CSM-R300-WH','채널바 옆마구리 300mm 백색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,2800,'채널바 옆마구리','300mm',(SELECT id FROM spec_groups WHERE name='간판색상'),'WH',(SELECT id FROM spec_groups WHERE name='간판바규격'),'R300'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-CSM-R300-WH');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-CSM-R300-LG','채널바 옆마구리 300mm 연회색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,2800,'채널바 옆마구리','300mm',(SELECT id FROM spec_groups WHERE name='간판색상'),'LG',(SELECT id FROM spec_groups WHERE name='간판바규격'),'R300'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-CSM-R300-LG');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-CSM-R400-BK','채널바 옆마구리 400mm 흑색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,3850,'채널바 옆마구리','400mm',(SELECT id FROM spec_groups WHERE name='간판색상'),'BK',(SELECT id FROM spec_groups WHERE name='간판바규격'),'R400'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-CSM-R400-BK');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-CSM-R400-WH','채널바 옆마구리 400mm 백색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,3850,'채널바 옆마구리','400mm',(SELECT id FROM spec_groups WHERE name='간판색상'),'WH',(SELECT id FROM spec_groups WHERE name='간판바규격'),'R400'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-CSM-R400-WH');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-CSM-R400-LG','채널바 옆마구리 400mm 연회색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,3850,'채널바 옆마구리','400mm',(SELECT id FROM spec_groups WHERE name='간판색상'),'LG',(SELECT id FROM spec_groups WHERE name='간판바규격'),'R400'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-CSM-R400-LG');

-- ■ 트러스바 옆마구리 (SGM-TSM)
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-TSM','트러스바 옆마구리','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,0,0,'트러스바 옆마구리',NULL,(SELECT id FROM spec_groups WHERE name='간판색상'),NULL,(SELECT id FROM spec_groups WHERE name='간판바규격'),NULL
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-TSM');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-TSM-R150-BK','트러스바 옆마구리 150mm 흑색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,2450,'트러스바 옆마구리','150mm',(SELECT id FROM spec_groups WHERE name='간판색상'),'BK',(SELECT id FROM spec_groups WHERE name='간판바규격'),'R150'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-TSM-R150-BK');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-TSM-R150-WH','트러스바 옆마구리 150mm 백색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,2450,'트러스바 옆마구리','150mm',(SELECT id FROM spec_groups WHERE name='간판색상'),'WH',(SELECT id FROM spec_groups WHERE name='간판바규격'),'R150'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-TSM-R150-WH');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-TSM-R150-LG','트러스바 옆마구리 150mm 연회색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,2450,'트러스바 옆마구리','150mm',(SELECT id FROM spec_groups WHERE name='간판색상'),'LG',(SELECT id FROM spec_groups WHERE name='간판바규격'),'R150'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-TSM-R150-LG');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-TSM-R150-DG','트러스바 옆마구리 150mm 진회색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,2450,'트러스바 옆마구리','150mm',(SELECT id FROM spec_groups WHERE name='간판색상'),'DG',(SELECT id FROM spec_groups WHERE name='간판바규격'),'R150'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-TSM-R150-DG');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-TSM-R200-BK','트러스바 옆마구리 200mm 흑색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,2450,'트러스바 옆마구리','200mm',(SELECT id FROM spec_groups WHERE name='간판색상'),'BK',(SELECT id FROM spec_groups WHERE name='간판바규격'),'R200'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-TSM-R200-BK');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-TSM-R200-WH','트러스바 옆마구리 200mm 백색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,2450,'트러스바 옆마구리','200mm',(SELECT id FROM spec_groups WHERE name='간판색상'),'WH',(SELECT id FROM spec_groups WHERE name='간판바규격'),'R200'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-TSM-R200-WH');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-TSM-R200-LG','트러스바 옆마구리 200mm 연회색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,2450,'트러스바 옆마구리','200mm',(SELECT id FROM spec_groups WHERE name='간판색상'),'LG',(SELECT id FROM spec_groups WHERE name='간판바규격'),'R200'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-TSM-R200-LG');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-TSM-R200-DG','트러스바 옆마구리 200mm 진회색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,2450,'트러스바 옆마구리','200mm',(SELECT id FROM spec_groups WHERE name='간판색상'),'DG',(SELECT id FROM spec_groups WHERE name='간판바규격'),'R200'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-TSM-R200-DG');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-TSM-R250-BK','트러스바 옆마구리 250mm 흑색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,2450,'트러스바 옆마구리','250mm',(SELECT id FROM spec_groups WHERE name='간판색상'),'BK',(SELECT id FROM spec_groups WHERE name='간판바규격'),'R250'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-TSM-R250-BK');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-TSM-R250-WH','트러스바 옆마구리 250mm 백색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,2450,'트러스바 옆마구리','250mm',(SELECT id FROM spec_groups WHERE name='간판색상'),'WH',(SELECT id FROM spec_groups WHERE name='간판바규격'),'R250'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-TSM-R250-WH');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-TSM-R250-LG','트러스바 옆마구리 250mm 연회색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,2450,'트러스바 옆마구리','250mm',(SELECT id FROM spec_groups WHERE name='간판색상'),'LG',(SELECT id FROM spec_groups WHERE name='간판바규격'),'R250'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-TSM-R250-LG');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-TSM-R250-DG','트러스바 옆마구리 250mm 진회색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,2450,'트러스바 옆마구리','250mm',(SELECT id FROM spec_groups WHERE name='간판색상'),'DG',(SELECT id FROM spec_groups WHERE name='간판바규격'),'R250'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-TSM-R250-DG');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-TSM-R300-BK','트러스바 옆마구리 300mm 흑색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,2450,'트러스바 옆마구리','300mm',(SELECT id FROM spec_groups WHERE name='간판색상'),'BK',(SELECT id FROM spec_groups WHERE name='간판바규격'),'R300'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-TSM-R300-BK');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-TSM-R300-WH','트러스바 옆마구리 300mm 백색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,2450,'트러스바 옆마구리','300mm',(SELECT id FROM spec_groups WHERE name='간판색상'),'WH',(SELECT id FROM spec_groups WHERE name='간판바규격'),'R300'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-TSM-R300-WH');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-TSM-R300-LG','트러스바 옆마구리 300mm 연회색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,2450,'트러스바 옆마구리','300mm',(SELECT id FROM spec_groups WHERE name='간판색상'),'LG',(SELECT id FROM spec_groups WHERE name='간판바규격'),'R300'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-TSM-R300-LG');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-TSM-R300-DG','트러스바 옆마구리 300mm 진회색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,2450,'트러스바 옆마구리','300mm',(SELECT id FROM spec_groups WHERE name='간판색상'),'DG',(SELECT id FROM spec_groups WHERE name='간판바규격'),'R300'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-TSM-R300-DG');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-TSM-R400-BK','트러스바 옆마구리 400mm 흑색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,2450,'트러스바 옆마구리','400mm',(SELECT id FROM spec_groups WHERE name='간판색상'),'BK',(SELECT id FROM spec_groups WHERE name='간판바규격'),'R400'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-TSM-R400-BK');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-TSM-R400-WH','트러스바 옆마구리 400mm 백색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,2450,'트러스바 옆마구리','400mm',(SELECT id FROM spec_groups WHERE name='간판색상'),'WH',(SELECT id FROM spec_groups WHERE name='간판바규격'),'R400'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-TSM-R400-WH');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-TSM-R400-LG','트러스바 옆마구리 400mm 연회색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,2450,'트러스바 옆마구리','400mm',(SELECT id FROM spec_groups WHERE name='간판색상'),'LG',(SELECT id FROM spec_groups WHERE name='간판바규격'),'R400'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-TSM-R400-LG');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value,spec_group_id2,spec_value2)
SELECT 'SGM-TSM-R400-DG','트러스바 옆마구리 400mm 진회색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,2450,'트러스바 옆마구리','400mm',(SELECT id FROM spec_groups WHERE name='간판색상'),'DG',(SELECT id FROM spec_groups WHERE name='간판바규격'),'R400'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-TSM-R400-DG');
