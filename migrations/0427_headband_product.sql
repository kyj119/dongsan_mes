-- 0427_headband_product.sql
-- 머리띠 (사용자: 자체제작 제품·규격/색상 미정·출력·단가 개당FIXED). 어깨띠(AQ-SASH) 미러, 단, FIXED.
-- 규격/색상은 주문 시 입력. 원단 자동차감은 원단 확정 후 연결(현재 NONE).
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_sales_item,is_purchase_item,production_required,group_sort,is_favorite,waste_factor,stock_mode,is_active,base_price,item_group,created_at,updated_at)
SELECT 'AQ-HEADBAND','수성 머리띠','PRODUCT',15,'수성','머리띠','FIXED','FIXED','EA','NONE',1,0,1,0,0,1,'CONTINUOUS',1,0,'수성 머리띠',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='AQ-HEADBAND');
