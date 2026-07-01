-- 0426_hwajin_prime_goods.sql
-- 화진물산 + 프라임젯 코팅지/원단 상품 (사용자 지정: 상품[GOODS]·미분류·ea·폭별). 매입 상품.
-- 모델=조광(0424)과 동일: category=상품·GOODS·EA·NONE·base_price=0(단가=매입 B프로세스). spec_group 코팅지폭 재사용.
-- ⚠️ -프라임 원단상품(합성지/PVC켈/패트배너/수성백릿)은 기존 출력 원단/제품과 별개(매입 상품 관점, 사용자 확정).

INSERT INTO spec_groups (name,unit,sort_order,is_active) SELECT '코팅지폭','폭',70,1 WHERE NOT EXISTS (SELECT 1 FROM spec_groups WHERE name='코팅지폭');
INSERT INTO spec_group_values (group_id,value_code,label,sort_order,is_active) SELECT (SELECT id FROM spec_groups WHERE name='코팅지폭'),'P60','60폭',10,1 WHERE NOT EXISTS (SELECT 1 FROM spec_group_values WHERE group_id=(SELECT id FROM spec_groups WHERE name='코팅지폭') AND value_code='P60');
INSERT INTO spec_group_values (group_id,value_code,label,sort_order,is_active) SELECT (SELECT id FROM spec_groups WHERE name='코팅지폭'),'P90','90폭',20,1 WHERE NOT EXISTS (SELECT 1 FROM spec_group_values WHERE group_id=(SELECT id FROM spec_groups WHERE name='코팅지폭') AND value_code='P90');
INSERT INTO spec_group_values (group_id,value_code,label,sort_order,is_active) SELECT (SELECT id FROM spec_groups WHERE name='코팅지폭'),'P127','127폭',30,1 WHERE NOT EXISTS (SELECT 1 FROM spec_group_values WHERE group_id=(SELECT id FROM spec_groups WHERE name='코팅지폭') AND value_code='P127');
INSERT INTO spec_group_values (group_id,value_code,label,sort_order,is_active) SELECT (SELECT id FROM spec_groups WHERE name='코팅지폭'),'P152','152폭',40,1 WHERE NOT EXISTS (SELECT 1 FROM spec_group_values WHERE group_id=(SELECT id FROM spec_groups WHERE name='코팅지폭') AND value_code='P152');

-- ===== 화진물산 =====
-- ■ 양면코팅지(30m) (HJ-YMSIDE)
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'HJ-YMSIDE','양면코팅지(30m)','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',0,0,'양면코팅지(30m)',NULL,(SELECT id FROM spec_groups WHERE name='코팅지폭'),NULL,datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='HJ-YMSIDE');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'HJ-YMSIDE-P90','양면코팅지(30m) 90폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'양면코팅지(30m)','90폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P90',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='HJ-YMSIDE-P90');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'HJ-YMSIDE-P127','양면코팅지(30m) 127폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'양면코팅지(30m)','127폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P127',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='HJ-YMSIDE-P127');
-- ■ 무광코팅지 일반엠보(45m/180g) (HJ-MGILBO)
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'HJ-MGILBO','무광코팅지 일반엠보(45m/180g)','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',0,0,'무광코팅지 일반엠보(45m/180g)',NULL,(SELECT id FROM spec_groups WHERE name='코팅지폭'),NULL,datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='HJ-MGILBO');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'HJ-MGILBO-P60','무광코팅지 일반엠보(45m/180g) 60폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'무광코팅지 일반엠보(45m/180g)','60폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P60',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='HJ-MGILBO-P60');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'HJ-MGILBO-P90','무광코팅지 일반엠보(45m/180g) 90폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'무광코팅지 일반엠보(45m/180g)','90폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P90',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='HJ-MGILBO-P90');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'HJ-MGILBO-P127','무광코팅지 일반엠보(45m/180g) 127폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'무광코팅지 일반엠보(45m/180g)','127폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P127',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='HJ-MGILBO-P127');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'HJ-MGILBO-P152','무광코팅지 일반엠보(45m/180g) 152폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'무광코팅지 일반엠보(45m/180g)','152폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P152',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='HJ-MGILBO-P152');
-- ■ 무광코팅지 자동엠보 보급형(61m/120g) (HJ-MGAUTOB)
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'HJ-MGAUTOB','무광코팅지 자동엠보 보급형(61m/120g)','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',0,0,'무광코팅지 자동엠보 보급형(61m/120g)',NULL,(SELECT id FROM spec_groups WHERE name='코팅지폭'),NULL,datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='HJ-MGAUTOB');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'HJ-MGAUTOB-P90','무광코팅지 자동엠보 보급형(61m/120g) 90폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'무광코팅지 자동엠보 보급형(61m/120g)','90폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P90',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='HJ-MGAUTOB-P90');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'HJ-MGAUTOB-P127','무광코팅지 자동엠보 보급형(61m/120g) 127폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'무광코팅지 자동엠보 보급형(61m/120g)','127폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P127',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='HJ-MGAUTOB-P127');
-- ■ 무광코팅지 자동엠보(45m/120g) (HJ-MGAUTO)
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'HJ-MGAUTO','무광코팅지 자동엠보(45m/120g)','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',0,0,'무광코팅지 자동엠보(45m/120g)',NULL,(SELECT id FROM spec_groups WHERE name='코팅지폭'),NULL,datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='HJ-MGAUTO');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'HJ-MGAUTO-P60','무광코팅지 자동엠보(45m/120g) 60폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'무광코팅지 자동엠보(45m/120g)','60폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P60',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='HJ-MGAUTO-P60');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'HJ-MGAUTO-P90','무광코팅지 자동엠보(45m/120g) 90폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'무광코팅지 자동엠보(45m/120g)','90폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P90',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='HJ-MGAUTO-P90');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'HJ-MGAUTO-P127','무광코팅지 자동엠보(45m/120g) 127폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'무광코팅지 자동엠보(45m/120g)','127폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P127',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='HJ-MGAUTO-P127');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'HJ-MGAUTO-P152','무광코팅지 자동엠보(45m/120g) 152폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'무광코팅지 자동엠보(45m/120g)','152폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P152',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='HJ-MGAUTO-P152');
-- ■ UV엠보(45m/180g) (HJ-UVEMB)
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'HJ-UVEMB','UV엠보(45m/180g)','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',0,0,'UV엠보(45m/180g)',NULL,(SELECT id FROM spec_groups WHERE name='코팅지폭'),NULL,datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='HJ-UVEMB');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'HJ-UVEMB-P90','UV엠보(45m/180g) 90폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'UV엠보(45m/180g)','90폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P90',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='HJ-UVEMB-P90');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'HJ-UVEMB-P127','UV엠보(45m/180g) 127폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'UV엠보(45m/180g)','127폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P127',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='HJ-UVEMB-P127');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'HJ-UVEMB-P152','UV엠보(45m/180g) 152폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'UV엠보(45m/180g)','152폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P152',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='HJ-UVEMB-P152');
-- ■ 유광코팅지 자동(45m/120g) (HJ-YGAUTO)
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'HJ-YGAUTO','유광코팅지 자동(45m/120g)','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',0,0,'유광코팅지 자동(45m/120g)',NULL,(SELECT id FROM spec_groups WHERE name='코팅지폭'),NULL,datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='HJ-YGAUTO');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'HJ-YGAUTO-P60','유광코팅지 자동(45m/120g) 60폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'유광코팅지 자동(45m/120g)','60폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P60',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='HJ-YGAUTO-P60');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'HJ-YGAUTO-P90','유광코팅지 자동(45m/120g) 90폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'유광코팅지 자동(45m/120g)','90폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P90',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='HJ-YGAUTO-P90');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'HJ-YGAUTO-P127','유광코팅지 자동(45m/120g) 127폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'유광코팅지 자동(45m/120g)','127폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P127',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='HJ-YGAUTO-P127');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'HJ-YGAUTO-P152','유광코팅지 자동(45m/120g) 152폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'유광코팅지 자동(45m/120g)','152폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P152',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='HJ-YGAUTO-P152');
-- ■ 유광코팅지 일반(45m/180g) (HJ-YGILB)
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'HJ-YGILB','유광코팅지 일반(45m/180g)','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',0,0,'유광코팅지 일반(45m/180g)',NULL,(SELECT id FROM spec_groups WHERE name='코팅지폭'),NULL,datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='HJ-YGILB');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'HJ-YGILB-P60','유광코팅지 일반(45m/180g) 60폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'유광코팅지 일반(45m/180g)','60폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P60',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='HJ-YGILB-P60');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'HJ-YGILB-P90','유광코팅지 일반(45m/180g) 90폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'유광코팅지 일반(45m/180g)','90폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P90',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='HJ-YGILB-P90');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'HJ-YGILB-P127','유광코팅지 일반(45m/180g) 127폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'유광코팅지 일반(45m/180g)','127폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P127',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='HJ-YGILB-P127');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'HJ-YGILB-P152','유광코팅지 일반(45m/180g) 152폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'유광코팅지 일반(45m/180g)','152폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P152',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='HJ-YGILB-P152');
-- ■ UV유광(45m/180g) (HJ-UVYG)
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'HJ-UVYG','UV유광(45m/180g)','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',0,0,'UV유광(45m/180g)',NULL,(SELECT id FROM spec_groups WHERE name='코팅지폭'),NULL,datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='HJ-UVYG');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'HJ-UVYG-P90','UV유광(45m/180g) 90폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'UV유광(45m/180g)','90폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P90',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='HJ-UVYG-P90');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'HJ-UVYG-P127','UV유광(45m/180g) 127폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'UV유광(45m/180g)','127폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P127',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='HJ-UVYG-P127');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'HJ-UVYG-P152','UV유광(45m/180g) 152폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'UV유광(45m/180g)','152폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P152',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='HJ-UVYG-P152');
-- ■ 바닥용코팅지(30m) (HJ-BADAK) [단일]
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'HJ-BADAK','바닥용코팅지(30m)','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'바닥용코팅지(30m)','127폭',NULL,NULL,datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='HJ-BADAK');

-- ===== 프라임젯 =====
-- ■ 합성지-프라임 (PJ-HAP)
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'PJ-HAP','합성지-프라임','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',0,0,'합성지-프라임',NULL,(SELECT id FROM spec_groups WHERE name='코팅지폭'),NULL,datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='PJ-HAP');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'PJ-HAP-P60','합성지-프라임 60폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'합성지-프라임','60폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P60',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='PJ-HAP-P60');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'PJ-HAP-P90','합성지-프라임 90폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'합성지-프라임','90폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P90',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='PJ-HAP-P90');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'PJ-HAP-P127','합성지-프라임 127폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'합성지-프라임','127폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P127',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='PJ-HAP-P127');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'PJ-HAP-P152','합성지-프라임 152폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'합성지-프라임','152폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P152',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='PJ-HAP-P152');
-- ■ 합성지 그레이-프라임 (PJ-HAPGR)
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'PJ-HAPGR','합성지 그레이-프라임','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',0,0,'합성지 그레이-프라임',NULL,(SELECT id FROM spec_groups WHERE name='코팅지폭'),NULL,datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='PJ-HAPGR');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'PJ-HAPGR-P60','합성지 그레이-프라임 60폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'합성지 그레이-프라임','60폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P60',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='PJ-HAPGR-P60');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'PJ-HAPGR-P90','합성지 그레이-프라임 90폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'합성지 그레이-프라임','90폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P90',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='PJ-HAPGR-P90');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'PJ-HAPGR-P127','합성지 그레이-프라임 127폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'합성지 그레이-프라임','127폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P127',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='PJ-HAPGR-P127');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'PJ-HAPGR-P152','합성지 그레이-프라임 152폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'합성지 그레이-프라임','152폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P152',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='PJ-HAPGR-P152');
-- ■ PVC(켈)-프라임 (PJ-KEL)
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'PJ-KEL','PVC(켈)-프라임','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',0,0,'PVC(켈)-프라임',NULL,(SELECT id FROM spec_groups WHERE name='코팅지폭'),NULL,datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='PJ-KEL');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'PJ-KEL-P60','PVC(켈)-프라임 60폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'PVC(켈)-프라임','60폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P60',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='PJ-KEL-P60');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'PJ-KEL-P90','PVC(켈)-프라임 90폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'PVC(켈)-프라임','90폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P90',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='PJ-KEL-P90');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'PJ-KEL-P127','PVC(켈)-프라임 127폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'PVC(켈)-프라임','127폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P127',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='PJ-KEL-P127');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'PJ-KEL-P152','PVC(켈)-프라임 152폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'PVC(켈)-프라임','152폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P152',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='PJ-KEL-P152');
-- ■ PVC(켈) 그레이-프라임 (PJ-KELGR)
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'PJ-KELGR','PVC(켈) 그레이-프라임','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',0,0,'PVC(켈) 그레이-프라임',NULL,(SELECT id FROM spec_groups WHERE name='코팅지폭'),NULL,datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='PJ-KELGR');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'PJ-KELGR-P60','PVC(켈) 그레이-프라임 60폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'PVC(켈) 그레이-프라임','60폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P60',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='PJ-KELGR-P60');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'PJ-KELGR-P90','PVC(켈) 그레이-프라임 90폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'PVC(켈) 그레이-프라임','90폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P90',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='PJ-KELGR-P90');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'PJ-KELGR-P127','PVC(켈) 그레이-프라임 127폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'PVC(켈) 그레이-프라임','127폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P127',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='PJ-KELGR-P127');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'PJ-KELGR-P152','PVC(켈) 그레이-프라임 152폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'PVC(켈) 그레이-프라임','152폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P152',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='PJ-KELGR-P152');
-- ■ 패트배너-프라임 (PJ-PAT)
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'PJ-PAT','패트배너-프라임','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',0,0,'패트배너-프라임',NULL,(SELECT id FROM spec_groups WHERE name='코팅지폭'),NULL,datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='PJ-PAT');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'PJ-PAT-P60','패트배너-프라임 60폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'패트배너-프라임','60폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P60',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='PJ-PAT-P60');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'PJ-PAT-P90','패트배너-프라임 90폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'패트배너-프라임','90폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P90',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='PJ-PAT-P90');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'PJ-PAT-P127','패트배너-프라임 127폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'패트배너-프라임','127폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P127',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='PJ-PAT-P127');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'PJ-PAT-P152','패트배너-프라임 152폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'패트배너-프라임','152폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P152',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='PJ-PAT-P152');
-- ■ 수성 백릿-프라임 (PJ-BACKLIT)
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'PJ-BACKLIT','수성 백릿-프라임','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',0,0,'수성 백릿-프라임',NULL,(SELECT id FROM spec_groups WHERE name='코팅지폭'),NULL,datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='PJ-BACKLIT');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'PJ-BACKLIT-P90','수성 백릿-프라임 90폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'수성 백릿-프라임','90폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P90',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='PJ-BACKLIT-P90');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'PJ-BACKLIT-P127','수성 백릿-프라임 127폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'수성 백릿-프라임','127폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P127',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='PJ-BACKLIT-P127');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'PJ-BACKLIT-P152','수성 백릿-프라임 152폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'수성 백릿-프라임','152폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P152',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='PJ-BACKLIT-P152');
-- ■ 무광인화지 (PJ-MUINH) [단일]
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'PJ-MUINH','무광인화지','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'무광인화지','127폭',NULL,NULL,datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='PJ-MUINH');
