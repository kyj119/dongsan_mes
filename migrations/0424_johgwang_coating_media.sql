-- 0424_johgwang_coating_media.sql
-- 조광미디어 코팅지 26종 (사용자 지정: 상품[GOODS]·미분류·ea·폭별). 최근 거래 개시로 전체 등록.
-- 모델: category=상품 · GOODS(매입+판매) · EA · deduction=NONE · base_price=0(조광 단가 추후).
-- 폭 옵션=spec_group 코팅지폭(주문 picker 폭 드롭다운). base=템플릿 is_active=0, 변종 is_active=1.
-- ⚠️ E2 캔버스(200g)=조광 코팅캔버스, 솔벤 캔버스원단(SVCV-127·케이엠테크)과 별개 품목.

INSERT INTO spec_groups (name,unit,sort_order,is_active) SELECT '코팅지폭','폭',70,1 WHERE NOT EXISTS (SELECT 1 FROM spec_groups WHERE name='코팅지폭');
INSERT INTO spec_group_values (group_id,value_code,label,sort_order,is_active) SELECT (SELECT id FROM spec_groups WHERE name='코팅지폭'),'P60','60폭',10,1 WHERE NOT EXISTS (SELECT 1 FROM spec_group_values WHERE group_id=(SELECT id FROM spec_groups WHERE name='코팅지폭') AND value_code='P60');
INSERT INTO spec_group_values (group_id,value_code,label,sort_order,is_active) SELECT (SELECT id FROM spec_groups WHERE name='코팅지폭'),'P90','90폭',20,1 WHERE NOT EXISTS (SELECT 1 FROM spec_group_values WHERE group_id=(SELECT id FROM spec_groups WHERE name='코팅지폭') AND value_code='P90');
INSERT INTO spec_group_values (group_id,value_code,label,sort_order,is_active) SELECT (SELECT id FROM spec_groups WHERE name='코팅지폭'),'P127','127폭',30,1 WHERE NOT EXISTS (SELECT 1 FROM spec_group_values WHERE group_id=(SELECT id FROM spec_groups WHERE name='코팅지폭') AND value_code='P127');
INSERT INTO spec_group_values (group_id,value_code,label,sort_order,is_active) SELECT (SELECT id FROM spec_groups WHERE name='코팅지폭'),'P152','152폭',40,1 WHERE NOT EXISTS (SELECT 1 FROM spec_group_values WHERE group_id=(SELECT id FROM spec_groups WHERE name='코팅지폭') AND value_code='P152');

-- ■ E4 엠보 무광(45m/200g) (JG-E4)
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'JG-E4','E4 엠보 무광(45m/200g)','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',0,0,'E4 엠보 무광(45m/200g)',NULL,(SELECT id FROM spec_groups WHERE name='코팅지폭'),NULL,datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='JG-E4');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'JG-E4-P60','E4 엠보 무광(45m/200g) 60폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'E4 엠보 무광(45m/200g)','60폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P60',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='JG-E4-P60');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'JG-E4-P90','E4 엠보 무광(45m/200g) 90폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'E4 엠보 무광(45m/200g)','90폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P90',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='JG-E4-P90');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'JG-E4-P127','E4 엠보 무광(45m/200g) 127폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'E4 엠보 무광(45m/200g)','127폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P127',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='JG-E4-P127');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'JG-E4-P152','E4 엠보 무광(45m/200g) 152폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'E4 엠보 무광(45m/200g)','152폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P152',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='JG-E4-P152');

-- ■ E26T 유광(45m/200g) (JG-E26T)
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'JG-E26T','E26T 유광(45m/200g)','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',0,0,'E26T 유광(45m/200g)',NULL,(SELECT id FROM spec_groups WHERE name='코팅지폭'),NULL,datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='JG-E26T');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'JG-E26T-P60','E26T 유광(45m/200g) 60폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'E26T 유광(45m/200g)','60폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P60',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='JG-E26T-P60');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'JG-E26T-P90','E26T 유광(45m/200g) 90폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'E26T 유광(45m/200g)','90폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P90',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='JG-E26T-P90');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'JG-E26T-P127','E26T 유광(45m/200g) 127폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'E26T 유광(45m/200g)','127폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P127',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='JG-E26T-P127');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'JG-E26T-P152','E26T 유광(45m/200g) 152폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'E26T 유광(45m/200g)','152폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P152',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='JG-E26T-P152');

-- ■ NJ4 엠보 무광(45m/180g) (JG-NJ4)
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'JG-NJ4','NJ4 엠보 무광(45m/180g)','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',0,0,'NJ4 엠보 무광(45m/180g)',NULL,(SELECT id FROM spec_groups WHERE name='코팅지폭'),NULL,datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='JG-NJ4');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'JG-NJ4-P60','NJ4 엠보 무광(45m/180g) 60폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'NJ4 엠보 무광(45m/180g)','60폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P60',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='JG-NJ4-P60');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'JG-NJ4-P90','NJ4 엠보 무광(45m/180g) 90폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'NJ4 엠보 무광(45m/180g)','90폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P90',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='JG-NJ4-P90');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'JG-NJ4-P127','NJ4 엠보 무광(45m/180g) 127폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'NJ4 엠보 무광(45m/180g)','127폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P127',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='JG-NJ4-P127');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'JG-NJ4-P152','NJ4 엠보 무광(45m/180g) 152폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'NJ4 엠보 무광(45m/180g)','152폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P152',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='JG-NJ4-P152');

-- ■ A26 양면코팅지(30m) (JG-A26)
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'JG-A26','A26 양면코팅지(30m)','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',0,0,'A26 양면코팅지(30m)',NULL,(SELECT id FROM spec_groups WHERE name='코팅지폭'),NULL,datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='JG-A26');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'JG-A26-P90','A26 양면코팅지(30m) 90폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'A26 양면코팅지(30m)','90폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P90',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='JG-A26-P90');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'JG-A26-P127','A26 양면코팅지(30m) 127폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'A26 양면코팅지(30m)','127폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P127',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='JG-A26-P127');

-- ■ C4 엠보UV 무광(200g) (JG-C4)
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'JG-C4','C4 엠보UV 무광(200g)','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',0,0,'C4 엠보UV 무광(200g)',NULL,(SELECT id FROM spec_groups WHERE name='코팅지폭'),NULL,datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='JG-C4');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'JG-C4-P90','C4 엠보UV 무광(200g) 90폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'C4 엠보UV 무광(200g)','90폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P90',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='JG-C4-P90');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'JG-C4-P127','C4 엠보UV 무광(200g) 127폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'C4 엠보UV 무광(200g)','127폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P127',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='JG-C4-P127');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'JG-C4-P152','C4 엠보UV 무광(200g) 152폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'C4 엠보UV 무광(200g)','152폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P152',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='JG-C4-P152');

-- ■ E16 완전무지(200g) (JG-E16)
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'JG-E16','E16 완전무지(200g)','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',0,0,'E16 완전무지(200g)',NULL,(SELECT id FROM spec_groups WHERE name='코팅지폭'),NULL,datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='JG-E16');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'JG-E16-P90','E16 완전무지(200g) 90폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'E16 완전무지(200g)','90폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P90',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='JG-E16-P90');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'JG-E16-P127','E16 완전무지(200g) 127폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'E16 완전무지(200g)','127폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P127',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='JG-E16-P127');

-- ■ E2 캔버스(200g) (JG-E2)
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'JG-E2','E2 캔버스(200g)','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',0,0,'E2 캔버스(200g)',NULL,(SELECT id FROM spec_groups WHERE name='코팅지폭'),NULL,datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='JG-E2');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'JG-E2-P60','E2 캔버스(200g) 60폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'E2 캔버스(200g)','60폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P60',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='JG-E2-P60');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'JG-E2-P127','E2 캔버스(200g) 127폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'E2 캔버스(200g)','127폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P127',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='JG-E2-P127');

-- ■ 자동용 코팅지 엠보(61m/120g) (JG-JD61)
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'JG-JD61','자동용 코팅지 엠보(61m/120g)','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',0,0,'자동용 코팅지 엠보(61m/120g)',NULL,(SELECT id FROM spec_groups WHERE name='코팅지폭'),NULL,datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='JG-JD61');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'JG-JD61-P90','자동용 코팅지 엠보(61m/120g) 90폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'자동용 코팅지 엠보(61m/120g)','90폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P90',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='JG-JD61-P90');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'JG-JD61-P127','자동용 코팅지 엠보(61m/120g) 127폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'자동용 코팅지 엠보(61m/120g)','127폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P127',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='JG-JD61-P127');

-- ■ 자동용 코팅지 엠보(45m/120g) (JG-JD45)
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'JG-JD45','자동용 코팅지 엠보(45m/120g)','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',0,0,'자동용 코팅지 엠보(45m/120g)',NULL,(SELECT id FROM spec_groups WHERE name='코팅지폭'),NULL,datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='JG-JD45');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'JG-JD45-P152','자동용 코팅지 엠보(45m/120g) 152폭','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'자동용 코팅지 엠보(45m/120g)','152폭',(SELECT id FROM spec_groups WHERE name='코팅지폭'),'P152',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='JG-JD45-P152');

-- ■ 뱌닥용 코팅지 (JG-BYADAK) [단일]
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'JG-BYADAK','뱌닥용 코팅지','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'뱌닥용 코팅지','127폭',NULL,NULL,datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='JG-BYADAK');

-- ■ 화이트보드코팅지 (JG-WBOARD) [단일]
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,specification,spec_group_id,spec_value,created_at,updated_at)
SELECT 'JG-WBOARD','화이트보드코팅지','GOODS',4,'상품',NULL,'FIXED','EA',1,1,0,0,0,1,'NONE',1,0,'화이트보드코팅지','127폭',NULL,NULL,datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='JG-WBOARD');
