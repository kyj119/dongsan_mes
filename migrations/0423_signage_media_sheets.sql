-- 0423_signage_media_sheets.sql
-- 원단/시트 (매입기준·선명 매입내역). 사용자 분류 확정:
--  · 도안지 = 간판 제작 원자재
--  · LT40계열(LT4071M/LT4080M/LT4510)·LC6770P·SPT031M = 조명용 시트, 간판제작+원자재판매 → 원자재 dual
--  · LW2800M = 판매만 → 상품(GOODS)
--  · SPT031M = 출력에도 사용 → 출력 제품은 인쇄방식 확인 후 후속(여기선 원자재 dual만)
-- 단가=매입 부가세별도(롤 단가). unit=롤(롤 단위 매입/판매). deduction=NONE(수동).
-- 미러천·무광인화지 = 보류(사용자).

-- 도안지 (원자재, 간판 제작용)
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,specification,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,created_at,updated_at)
SELECT 'RM-DOAN','도안지','MATERIAL',5,'원자재','간판자재','FIXED','롤','125폭',1,0,0,0,0,1,'NONE',1,29000,'도안지',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='RM-DOAN');

-- 조명시트 원자재 dual (간판제작 + 판매)
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,specification,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,created_at,updated_at)
SELECT 'LT4071M','조명시트 LT4071M','MATERIAL',5,'원자재','간판자재','FIXED','롤','122폭',1,1,0,0,0,1,'NONE',1,210600,'조명시트',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='LT4071M');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,specification,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,created_at,updated_at)
SELECT 'LT4080M','조명시트 LT4080M','MATERIAL',5,'원자재','간판자재','FIXED','롤','122폭',1,1,0,0,0,1,'NONE',1,210600,'조명시트',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='LT4080M');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,specification,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,created_at,updated_at)
SELECT 'LT4510','조명시트 LT4510','MATERIAL',5,'원자재','간판자재','FIXED','롤','122폭',1,1,0,0,0,1,'NONE',1,210600,'조명시트',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='LT4510');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,specification,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,created_at,updated_at)
SELECT 'LC6770P','조명시트 LC6770P','MATERIAL',5,'원자재','간판자재','FIXED','롤','122폭/50m',1,1,0,0,0,1,'NONE',1,199500,'조명시트',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='LC6770P');
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,specification,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,created_at,updated_at)
SELECT 'SPT031M','조명시트 SPT031M','MATERIAL',5,'원자재','간판자재','FIXED','롤','137폭',1,1,0,0,0,1,'NONE',1,221820,'조명시트',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SPT031M');

-- LW2800M = 판매만 → 상품(GOODS)
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,unit,specification,is_purchase_item,is_sales_item,production_required,group_sort,is_favorite,waste_factor,deduction_method,is_active,base_price,item_group,created_at,updated_at)
SELECT 'LW2800M','조명시트 LW2800M','GOODS',4,'상품',NULL,'FIXED','롤','137폭',1,1,0,0,0,1,'NONE',1,145280,'조명시트',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='LW2800M');
