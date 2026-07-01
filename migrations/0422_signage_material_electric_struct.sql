-- 0422_signage_material_electric_struct.sql
-- 간판자재 Phase ②전기 + ③구조/부속 (매입기준). 모델=0421과 동일(원자재·간판자재·NONE·EA·매입전용).
-- 단가=매입 부가세별도. 0단가=매입단가 미확인(추후). base=템플릿 is_active=0, 변종 is_active=1.

-- spec_groups + values
INSERT INTO spec_groups (name,unit,sort_order,is_active) SELECT 'LED형광등형','',62,1 WHERE NOT EXISTS (SELECT 1 FROM spec_groups WHERE name='LED형광등형');
INSERT INTO spec_group_values (group_id,value_code,label,sort_order,is_active) SELECT (SELECT id FROM spec_groups WHERE name='LED형광등형'),'F28D','28W양면돌출',10,1 WHERE NOT EXISTS (SELECT 1 FROM spec_group_values WHERE group_id=(SELECT id FROM spec_groups WHERE name='LED형광등형') AND value_code='F28D');
INSERT INTO spec_group_values (group_id,value_code,label,sort_order,is_active) SELECT (SELECT id FROM spec_groups WHERE name='LED형광등형'),'F20S','20W단면',20,1 WHERE NOT EXISTS (SELECT 1 FROM spec_group_values WHERE group_id=(SELECT id FROM spec_groups WHERE name='LED형광등형') AND value_code='F20S');
INSERT INTO spec_group_values (group_id,value_code,label,sort_order,is_active) SELECT (SELECT id FROM spec_groups WHERE name='LED형광등형'),'F20W','20W웜',30,1 WHERE NOT EXISTS (SELECT 1 FROM spec_group_values WHERE group_id=(SELECT id FROM spec_groups WHERE name='LED형광등형') AND value_code='F20W');
INSERT INTO spec_group_values (group_id,value_code,label,sort_order,is_active) SELECT (SELECT id FROM spec_groups WHERE name='LED형광등형'),'F28D60','28W양면60cm',40,1 WHERE NOT EXISTS (SELECT 1 FROM spec_group_values WHERE group_id=(SELECT id FROM spec_groups WHERE name='LED형광등형') AND value_code='F28D60');
INSERT INTO spec_groups (name,unit,sort_order,is_active) SELECT 'SMPS와트','',63,1 WHERE NOT EXISTS (SELECT 1 FROM spec_groups WHERE name='SMPS와트');
INSERT INTO spec_group_values (group_id,value_code,label,sort_order,is_active) SELECT (SELECT id FROM spec_groups WHERE name='SMPS와트'),'W200','200wt',20,1 WHERE NOT EXISTS (SELECT 1 FROM spec_group_values WHERE group_id=(SELECT id FROM spec_groups WHERE name='SMPS와트') AND value_code='W200');
INSERT INTO spec_group_values (group_id,value_code,label,sort_order,is_active) SELECT (SELECT id FROM spec_groups WHERE name='SMPS와트'),'W300','300wt',30,1 WHERE NOT EXISTS (SELECT 1 FROM spec_group_values WHERE group_id=(SELECT id FROM spec_groups WHERE name='SMPS와트') AND value_code='W300');
INSERT INTO spec_group_values (group_id,value_code,label,sort_order,is_active) SELECT (SELECT id FROM spec_groups WHERE name='SMPS와트'),'W400','400wt',40,1 WHERE NOT EXISTS (SELECT 1 FROM spec_group_values WHERE group_id=(SELECT id FROM spec_groups WHERE name='SMPS와트') AND value_code='W400');
INSERT INTO spec_group_values (group_id,value_code,label,sort_order,is_active) SELECT (SELECT id FROM spec_groups WHERE name='SMPS와트'),'W500','500wt',50,1 WHERE NOT EXISTS (SELECT 1 FROM spec_group_values WHERE group_id=(SELECT id FROM spec_groups WHERE name='SMPS와트') AND value_code='W500');
INSERT INTO spec_groups (name,unit,sort_order,is_active) SELECT 'LED3구종류','',64,1 WHERE NOT EXISTS (SELECT 1 FROM spec_groups WHERE name='LED3구종류');
INSERT INTO spec_group_values (group_id,value_code,label,sort_order,is_active) SELECT (SELECT id FROM spec_groups WHERE name='LED3구종류'),'WH','백색',10,1 WHERE NOT EXISTS (SELECT 1 FROM spec_group_values WHERE group_id=(SELECT id FROM spec_groups WHERE name='LED3구종류') AND value_code='WH');
INSERT INTO spec_group_values (group_id,value_code,label,sort_order,is_active) SELECT (SELECT id FROM spec_groups WHERE name='LED3구종류'),'WM','웜',20,1 WHERE NOT EXISTS (SELECT 1 FROM spec_group_values WHERE group_id=(SELECT id FROM spec_groups WHERE name='LED3구종류') AND value_code='WM');
INSERT INTO spec_group_values (group_id,value_code,label,sort_order,is_active) SELECT (SELECT id FROM spec_groups WHERE name='LED3구종류'),'KPL','KPL',30,1 WHERE NOT EXISTS (SELECT 1 FROM spec_group_values WHERE group_id=(SELECT id FROM spec_groups WHERE name='LED3구종류') AND value_code='KPL');
INSERT INTO spec_group_values (group_id,value_code,label,sort_order,is_active) SELECT (SELECT id FROM spec_groups WHERE name='LED3구종류'),'JPL','JPL',40,1 WHERE NOT EXISTS (SELECT 1 FROM spec_group_values WHERE group_id=(SELECT id FROM spec_groups WHERE name='LED3구종류') AND value_code='JPL');
INSERT INTO spec_groups (name,unit,sort_order,is_active) SELECT 'LED투광기색','',65,1 WHERE NOT EXISTS (SELECT 1 FROM spec_groups WHERE name='LED투광기색');
INSERT INTO spec_group_values (group_id,value_code,label,sort_order,is_active) SELECT (SELECT id FROM spec_groups WHERE name='LED투광기색'),'WW','백색/백색',10,1 WHERE NOT EXISTS (SELECT 1 FROM spec_group_values WHERE group_id=(SELECT id FROM spec_groups WHERE name='LED투광기색') AND value_code='WW');
INSERT INTO spec_group_values (group_id,value_code,label,sort_order,is_active) SELECT (SELECT id FROM spec_groups WHERE name='LED투광기색'),'WM','백색/웜',20,1 WHERE NOT EXISTS (SELECT 1 FROM spec_group_values WHERE group_id=(SELECT id FROM spec_groups WHERE name='LED투광기색') AND value_code='WM');
INSERT INTO spec_group_values (group_id,value_code,label,sort_order,is_active) SELECT (SELECT id FROM spec_groups WHERE name='LED투광기색'),'BW','검정/백색',30,1 WHERE NOT EXISTS (SELECT 1 FROM spec_group_values WHERE group_id=(SELECT id FROM spec_groups WHERE name='LED투광기색') AND value_code='BW');
INSERT INTO spec_groups (name,unit,sort_order,is_active) SELECT 'KIV굵기','',66,1 WHERE NOT EXISTS (SELECT 1 FROM spec_groups WHERE name='KIV굵기');
INSERT INTO spec_group_values (group_id,value_code,label,sort_order,is_active) SELECT (SELECT id FROM spec_groups WHERE name='KIV굵기'),'K15','1.5sq',10,1 WHERE NOT EXISTS (SELECT 1 FROM spec_group_values WHERE group_id=(SELECT id FROM spec_groups WHERE name='KIV굵기') AND value_code='K15');
INSERT INTO spec_group_values (group_id,value_code,label,sort_order,is_active) SELECT (SELECT id FROM spec_groups WHERE name='KIV굵기'),'K25','2.5sq',20,1 WHERE NOT EXISTS (SELECT 1 FROM spec_group_values WHERE group_id=(SELECT id FROM spec_groups WHERE name='KIV굵기') AND value_code='K25');
INSERT INTO spec_group_values (group_id,value_code,label,sort_order,is_active) SELECT (SELECT id FROM spec_groups WHERE name='KIV굵기'),'K40','4.0sq',30,1 WHERE NOT EXISTS (SELECT 1 FROM spec_group_values WHERE group_id=(SELECT id FROM spec_groups WHERE name='KIV굵기') AND value_code='K40');
INSERT INTO spec_groups (name,unit,sort_order,is_active) SELECT '각파이프종류','',67,1 WHERE NOT EXISTS (SELECT 1 FROM spec_groups WHERE name='각파이프종류');
INSERT INTO spec_group_values (group_id,value_code,label,sort_order,is_active) SELECT (SELECT id FROM spec_groups WHERE name='각파이프종류'),'P15','15각',10,1 WHERE NOT EXISTS (SELECT 1 FROM spec_group_values WHERE group_id=(SELECT id FROM spec_groups WHERE name='각파이프종류') AND value_code='P15');
INSERT INTO spec_group_values (group_id,value_code,label,sort_order,is_active) SELECT (SELECT id FROM spec_groups WHERE name='각파이프종류'),'P19','19각',20,1 WHERE NOT EXISTS (SELECT 1 FROM spec_group_values WHERE group_id=(SELECT id FROM spec_groups WHERE name='각파이프종류') AND value_code='P19');
INSERT INTO spec_groups (name,unit,sort_order,is_active) SELECT '후판폭','',68,1 WHERE NOT EXISTS (SELECT 1 FROM spec_groups WHERE name='후판폭');
INSERT INTO spec_group_values (group_id,value_code,label,sort_order,is_active) SELECT (SELECT id FROM spec_groups WHERE name='후판폭'),'B90','90cm',10,1 WHERE NOT EXISTS (SELECT 1 FROM spec_group_values WHERE group_id=(SELECT id FROM spec_groups WHERE name='후판폭') AND value_code='B90');
INSERT INTO spec_group_values (group_id,value_code,label,sort_order,is_active) SELECT (SELECT id FROM spec_groups WHERE name='후판폭'),'B100','100cm',20,1 WHERE NOT EXISTS (SELECT 1 FROM spec_group_values WHERE group_id=(SELECT id FROM spec_groups WHERE name='후판폭') AND value_code='B100');
INSERT INTO spec_group_values (group_id,value_code,label,sort_order,is_active) SELECT (SELECT id FROM spec_groups WHERE name='후판폭'),'B120','120cm',30,1 WHERE NOT EXISTS (SELECT 1 FROM spec_group_values WHERE group_id=(SELECT id FROM spec_groups WHERE name='후판폭') AND value_code='B120');
INSERT INTO spec_group_values (group_id,value_code,label,sort_order,is_active) SELECT (SELECT id FROM spec_groups WHERE name='후판폭'),'B130','130cm',40,1 WHERE NOT EXISTS (SELECT 1 FROM spec_group_values WHERE group_id=(SELECT id FROM spec_groups WHERE name='후판폭') AND value_code='B130');
INSERT INTO spec_group_values (group_id,value_code,label,sort_order,is_active) SELECT (SELECT id FROM spec_groups WHERE name='후판폭'),'B170','170cm',50,1 WHERE NOT EXISTS (SELECT 1 FROM spec_group_values WHERE group_id=(SELECT id FROM spec_groups WHERE name='후판폭') AND value_code='B170');
INSERT INTO spec_groups (name,unit,sort_order,is_active) SELECT '발통규격','',69,1 WHERE NOT EXISTS (SELECT 1 FROM spec_groups WHERE name='발통규격');
INSERT INTO spec_group_values (group_id,value_code,label,sort_order,is_active) SELECT (SELECT id FROM spec_groups WHERE name='발통규격'),'F400','400mm',10,1 WHERE NOT EXISTS (SELECT 1 FROM spec_group_values WHERE group_id=(SELECT id FROM spec_groups WHERE name='발통규격') AND value_code='F400');
INSERT INTO spec_group_values (group_id,value_code,label,sort_order,is_active) SELECT (SELECT id FROM spec_groups WHERE name='발통규격'),'F500','500mm',20,1 WHERE NOT EXISTS (SELECT 1 FROM spec_group_values WHERE group_id=(SELECT id FROM spec_groups WHERE name='발통규격') AND value_code='F500');
INSERT INTO spec_group_values (group_id,value_code,label,sort_order,is_active) SELECT (SELECT id FROM spec_groups WHERE name='발통규격'),'F700','700mm',30,1 WHERE NOT EXISTS (SELECT 1 FROM spec_group_values WHERE group_id=(SELECT id FROM spec_groups WHERE name='발통규격') AND value_code='F700');
INSERT INTO spec_groups (name,unit,sort_order,is_active) SELECT '원형돌출Φ','',70,1 WHERE NOT EXISTS (SELECT 1 FROM spec_groups WHERE name='원형돌출Φ');
INSERT INTO spec_group_values (group_id,value_code,label,sort_order,is_active) SELECT (SELECT id FROM spec_groups WHERE name='원형돌출Φ'),'D500','500Φ',10,1 WHERE NOT EXISTS (SELECT 1 FROM spec_group_values WHERE group_id=(SELECT id FROM spec_groups WHERE name='원형돌출Φ') AND value_code='D500');
INSERT INTO spec_group_values (group_id,value_code,label,sort_order,is_active) SELECT (SELECT id FROM spec_groups WHERE name='원형돌출Φ'),'D600','600Φ',20,1 WHERE NOT EXISTS (SELECT 1 FROM spec_group_values WHERE group_id=(SELECT id FROM spec_groups WHERE name='원형돌출Φ') AND value_code='D600');
INSERT INTO spec_groups (name,unit,sort_order,is_active) SELECT '타카핀규격','',71,1 WHERE NOT EXISTS (SELECT 1 FROM spec_groups WHERE name='타카핀규격');
INSERT INTO spec_group_values (group_id,value_code,label,sort_order,is_active) SELECT (SELECT id FROM spec_groups WHERE name='타카핀규격'),'T4','4mm',10,1 WHERE NOT EXISTS (SELECT 1 FROM spec_group_values WHERE group_id=(SELECT id FROM spec_groups WHERE name='타카핀규격') AND value_code='T4');
INSERT INTO spec_group_values (group_id,value_code,label,sort_order,is_active) SELECT (SELECT id FROM spec_groups WHERE name='타카핀규격'),'T6','6mm',20,1 WHERE NOT EXISTS (SELECT 1 FROM spec_group_values WHERE group_id=(SELECT id FROM spec_groups WHERE name='타카핀규격') AND value_code='T6');
INSERT INTO spec_groups (name,unit,sort_order,is_active) SELECT '투광기파이프색','',72,1 WHERE NOT EXISTS (SELECT 1 FROM spec_groups WHERE name='투광기파이프색');
INSERT INTO spec_group_values (group_id,value_code,label,sort_order,is_active) SELECT (SELECT id FROM spec_groups WHERE name='투광기파이프색'),'PW','백색',10,1 WHERE NOT EXISTS (SELECT 1 FROM spec_group_values WHERE group_id=(SELECT id FROM spec_groups WHERE name='투광기파이프색') AND value_code='PW');
INSERT INTO spec_group_values (group_id,value_code,label,sort_order,is_active) SELECT (SELECT id FROM spec_groups WHERE name='투광기파이프색'),'PB','검정',20,1 WHERE NOT EXISTS (SELECT 1 FROM spec_group_values WHERE group_id=(SELECT id FROM spec_groups WHERE name='투광기파이프색') AND value_code='PB');

-- ■ LED형광등 (SGM-LEDF)
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value)
SELECT 'SGM-LEDF','LED형광등','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,0,0,'LED형광등',NULL,(SELECT id FROM spec_groups WHERE name='LED형광등형'),NULL
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-LEDF');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value)
SELECT 'SGM-LEDF-F28D','LED형광등 28W양면돌출','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,4000,'LED형광등',NULL,(SELECT id FROM spec_groups WHERE name='LED형광등형'),'F28D'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-LEDF-F28D');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value)
SELECT 'SGM-LEDF-F20S','LED형광등 20W단면','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,1700,'LED형광등',NULL,(SELECT id FROM spec_groups WHERE name='LED형광등형'),'F20S'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-LEDF-F20S');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value)
SELECT 'SGM-LEDF-F20W','LED형광등 20W웜','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,2200,'LED형광등',NULL,(SELECT id FROM spec_groups WHERE name='LED형광등형'),'F20W'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-LEDF-F20W');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value)
SELECT 'SGM-LEDF-F28D60','LED형광등 28W양면60cm','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,2900,'LED형광등',NULL,(SELECT id FROM spec_groups WHERE name='LED형광등형'),'F28D60'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-LEDF-F28D60');

-- ■ 외부용 SMPS(방수) (SGM-SMPS)
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value)
SELECT 'SGM-SMPS','외부용 SMPS(방수)','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,0,0,'외부용 SMPS(방수)','방수',(SELECT id FROM spec_groups WHERE name='SMPS와트'),NULL
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-SMPS');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value)
SELECT 'SGM-SMPS-W200','외부용 SMPS(방수) 200wt','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,13500,'외부용 SMPS(방수)','방수',(SELECT id FROM spec_groups WHERE name='SMPS와트'),'W200'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-SMPS-W200');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value)
SELECT 'SGM-SMPS-W300','외부용 SMPS(방수) 300wt','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,16000,'외부용 SMPS(방수)','방수',(SELECT id FROM spec_groups WHERE name='SMPS와트'),'W300'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-SMPS-W300');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value)
SELECT 'SGM-SMPS-W400','외부용 SMPS(방수) 400wt','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,26500,'외부용 SMPS(방수)','방수',(SELECT id FROM spec_groups WHERE name='SMPS와트'),'W400'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-SMPS-W400');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value)
SELECT 'SGM-SMPS-W500','외부용 SMPS(방수) 500wt','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,27000,'외부용 SMPS(방수)','방수',(SELECT id FROM spec_groups WHERE name='SMPS와트'),'W500'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-SMPS-W500');

-- ■ LED 3구 (SGM-LED3)
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value)
SELECT 'SGM-LED3','LED 3구','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,0,0,'LED 3구','1w',(SELECT id FROM spec_groups WHERE name='LED3구종류'),NULL
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-LED3');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value)
SELECT 'SGM-LED3-WH','LED 3구 백색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,175,'LED 3구','1w',(SELECT id FROM spec_groups WHERE name='LED3구종류'),'WH'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-LED3-WH');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value)
SELECT 'SGM-LED3-WM','LED 3구 백색/웜','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,175,'LED 3구','1w',(SELECT id FROM spec_groups WHERE name='LED3구종류'),'WM'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-LED3-WM');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value)
SELECT 'SGM-LED3-KPL','LED 3구 KPL','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,0,'LED 3구','1w',(SELECT id FROM spec_groups WHERE name='LED3구종류'),'KPL'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-LED3-KPL');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value)
SELECT 'SGM-LED3-JPL','LED 3구 JPL','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,0,'LED 3구','1w',(SELECT id FROM spec_groups WHERE name='LED3구종류'),'JPL'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-LED3-JPL');

-- ■ LED투광기 (SGM-LEDP)
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value)
SELECT 'SGM-LEDP','LED투광기','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,0,0,'LED투광기','35W',(SELECT id FROM spec_groups WHERE name='LED투광기색'),NULL
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-LEDP');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value)
SELECT 'SGM-LEDP-WW','LED투광기 백색/백색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,10500,'LED투광기','35W',(SELECT id FROM spec_groups WHERE name='LED투광기색'),'WW'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-LEDP-WW');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value)
SELECT 'SGM-LEDP-WM','LED투광기 백색/웜','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,10500,'LED투광기','35W',(SELECT id FROM spec_groups WHERE name='LED투광기색'),'WM'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-LEDP-WM');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value)
SELECT 'SGM-LEDP-BW','LED투광기 검정/백색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,10500,'LED투광기','35W',(SELECT id FROM spec_groups WHERE name='LED투광기색'),'BW'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-LEDP-BW');

-- ■ KIV 전선 (SGM-KIV)
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value)
SELECT 'SGM-KIV','KIV 전선','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,0,0,'KIV 전선','검정',(SELECT id FROM spec_groups WHERE name='KIV굵기'),NULL
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-KIV');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value)
SELECT 'SGM-KIV-K15','KIV 전선 1.5sq','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,0,'KIV 전선','검정',(SELECT id FROM spec_groups WHERE name='KIV굵기'),'K15'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-KIV-K15');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value)
SELECT 'SGM-KIV-K25','KIV 전선 2.5sq','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,0,'KIV 전선','검정',(SELECT id FROM spec_groups WHERE name='KIV굵기'),'K25'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-KIV-K25');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value)
SELECT 'SGM-KIV-K40','KIV 전선 4.0sq','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,0,'KIV 전선','검정',(SELECT id FROM spec_groups WHERE name='KIV굵기'),'K40'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-KIV-K40');

-- ■ LED 2P 전선 (SGM-LEDW) [단일]
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value)
SELECT 'SGM-LEDW','LED 2P 전선','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,44600,'LED 2P 전선','100m',NULL,NULL
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-LEDW');

-- ■ 각파이프 (SGM-PIPE)
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value)
SELECT 'SGM-PIPE','각파이프','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,0,0,'각파이프',NULL,(SELECT id FROM spec_groups WHERE name='각파이프종류'),NULL
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-PIPE');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value)
SELECT 'SGM-PIPE-P15','각파이프 15각','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,3850,'각파이프',NULL,(SELECT id FROM spec_groups WHERE name='각파이프종류'),'P15'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-PIPE-P15');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value)
SELECT 'SGM-PIPE-P19','각파이프 19각','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,4650,'각파이프',NULL,(SELECT id FROM spec_groups WHERE name='각파이프종류'),'P19'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-PIPE-P19');

-- ■ 간판 후판 (SGM-BOARD)
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value)
SELECT 'SGM-BOARD','간판 후판','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,0,0,'간판 후판',NULL,(SELECT id FROM spec_groups WHERE name='후판폭'),NULL
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-BOARD');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value)
SELECT 'SGM-BOARD-B90','간판 후판 90cm','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,54000,'간판 후판',NULL,(SELECT id FROM spec_groups WHERE name='후판폭'),'B90'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-BOARD-B90');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value)
SELECT 'SGM-BOARD-B100','간판 후판 100cm','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,60000,'간판 후판',NULL,(SELECT id FROM spec_groups WHERE name='후판폭'),'B100'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-BOARD-B100');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value)
SELECT 'SGM-BOARD-B120','간판 후판 120cm','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,72000,'간판 후판',NULL,(SELECT id FROM spec_groups WHERE name='후판폭'),'B120'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-BOARD-B120');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value)
SELECT 'SGM-BOARD-B130','간판 후판 130cm','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,81250,'간판 후판',NULL,(SELECT id FROM spec_groups WHERE name='후판폭'),'B130'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-BOARD-B130');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value)
SELECT 'SGM-BOARD-B170','간판 후판 170cm','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,106250,'간판 후판',NULL,(SELECT id FROM spec_groups WHERE name='후판폭'),'B170'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-BOARD-B170');

-- ■ 발통 (SGM-FOOT)
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value)
SELECT 'SGM-FOOT','발통','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,0,0,'발통',NULL,(SELECT id FROM spec_groups WHERE name='발통규격'),NULL
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-FOOT');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value)
SELECT 'SGM-FOOT-F400','발통 400mm','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,11210,'발통',NULL,(SELECT id FROM spec_groups WHERE name='발통규격'),'F400'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-FOOT-F400');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value)
SELECT 'SGM-FOOT-F500','발통 500mm','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,12390,'발통',NULL,(SELECT id FROM spec_groups WHERE name='발통규격'),'F500'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-FOOT-F500');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value)
SELECT 'SGM-FOOT-F700','발통 700mm','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,14750,'발통',NULL,(SELECT id FROM spec_groups WHERE name='발통규격'),'F700'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-FOOT-F700');

-- ■ 포인트원형돌출 (SGM-PRND)
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value)
SELECT 'SGM-PRND','포인트원형돌출','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,0,0,'포인트원형돌출',NULL,(SELECT id FROM spec_groups WHERE name='원형돌출Φ'),NULL
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-PRND');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value)
SELECT 'SGM-PRND-D500','포인트원형돌출 500Φ','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,44000,'포인트원형돌출',NULL,(SELECT id FROM spec_groups WHERE name='원형돌출Φ'),'D500'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-PRND-D500');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value)
SELECT 'SGM-PRND-D600','포인트원형돌출 600Φ','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,45500,'포인트원형돌출',NULL,(SELECT id FROM spec_groups WHERE name='원형돌출Φ'),'D600'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-PRND-D600');

-- ■ 스텐원형돌출 (SGM-SRND)
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value)
SELECT 'SGM-SRND','스텐원형돌출','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,0,0,'스텐원형돌출',NULL,(SELECT id FROM spec_groups WHERE name='원형돌출Φ'),NULL
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-SRND');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value)
SELECT 'SGM-SRND-D500','스텐원형돌출 500Φ','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,57000,'스텐원형돌출',NULL,(SELECT id FROM spec_groups WHERE name='원형돌출Φ'),'D500'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-SRND-D500');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value)
SELECT 'SGM-SRND-D600','스텐원형돌출 600Φ','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,59500,'스텐원형돌출',NULL,(SELECT id FROM spec_groups WHERE name='원형돌출Φ'),'D600'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-SRND-D600');

-- ■ 타카핀 (SGM-TACK)
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value)
SELECT 'SGM-TACK','타카핀','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,0,0,'타카핀',NULL,(SELECT id FROM spec_groups WHERE name='타카핀규격'),NULL
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-TACK');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value)
SELECT 'SGM-TACK-T4','타카핀 4mm','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,12000,'타카핀',NULL,(SELECT id FROM spec_groups WHERE name='타카핀규격'),'T4'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-TACK-T4');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value)
SELECT 'SGM-TACK-T6','타카핀 6mm','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,6500,'타카핀',NULL,(SELECT id FROM spec_groups WHERE name='타카핀규격'),'T6'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-TACK-T6');

-- ■ 투광기 파이프 (SGM-PPIPE)
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value)
SELECT 'SGM-PPIPE','투광기 파이프','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,0,0,'투광기 파이프','ㅡ자형 700mm',(SELECT id FROM spec_groups WHERE name='투광기파이프색'),NULL
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-PPIPE');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value)
SELECT 'SGM-PPIPE-PW','투광기 파이프 백색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,2400,'투광기 파이프','ㅡ자형 700mm',(SELECT id FROM spec_groups WHERE name='투광기파이프색'),'PW'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-PPIPE-PW');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value)
SELECT 'SGM-PPIPE-PB','투광기 파이프 검정','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,2400,'투광기 파이프','ㅡ자형 700mm',(SELECT id FROM spec_groups WHERE name='투광기파이프색'),'PB'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-PPIPE-PB');

-- ■ 알루미늄판 (SGM-ALP) [단일]
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value)
SELECT 'SGM-ALP','알루미늄판','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,19200,'알루미늄판','3*6 백색',NULL,NULL
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-ALP');

-- ■ 싸인탑날개 (SGM-STW) [단일]
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value)
SELECT 'SGM-STW','싸인탑날개','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,300,'싸인탑날개','1box-200ea',NULL,NULL
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-STW');

-- ■ 프레임타카핀 710 (SGM-FTACK) [단일]
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value)
SELECT 'SGM-FTACK','프레임타카핀 710','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,3400,'프레임타카핀 710',NULL,NULL,NULL
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-FTACK');

-- ■ 직결피스 (SGM-SCREW) [단일]
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value)
SELECT 'SGM-SCREW','직결피스','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,6100,'직결피스','1box',NULL,NULL
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-SCREW');

-- ■ 물본드 (SGM-BOND) [단일]
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value)
SELECT 'SGM-BOND','물본드','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,32000,'물본드',NULL,NULL,NULL
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-BOND');

-- ■ 돼지표본드 (SGM-PBOND) [단일]
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value)
SELECT 'SGM-PBOND','돼지표본드','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,26300,'돼지표본드','3kg',NULL,NULL
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-PBOND');

-- ■ 실리콘 (SGM-SIL) [단일]
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,is_active,base_price,item_group,specification,spec_group_id,spec_value)
SELECT 'SGM-SIL','실리콘','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'원자재','간판자재','FIXED',NULL,'EA','NONE',1,0,0,0,0,1,1,1500,'실리콘','백색',NULL,NULL
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SGM-SIL');
