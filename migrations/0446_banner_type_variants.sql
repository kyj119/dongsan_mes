-- 0446: 배너 형(S/F/H) = pp 주문옵션(0407) 폐기 → 품목 변종 승격 (사용자 결정 2026-07-06).
-- 근거: 형은 재단·봉제가 다른 제품 변형(원단·거치대는 동일) → 후가공 모델 부적합.
-- prod 실측: TYPE-S/F/H 주문라인 0건 · TRW*/TRWK* 주문 0건 → 데이터 이관 불요.
-- 모델(0428 패턴): spec_group '배너형'(S/F/H) + 기존 4제품(TRW-PO/ME·TRWK-PO/ME)=base 템플릿(is_active=0)
--   + 변종 10(윈드 폰지/매쉬×S/F=4, 워킹 폰지/매쉬×S/F/H=6). product_materials는 base에서 복사.
-- item_group '윈드배너'/'워킹배너' 유지(원단축이 이미 그룹 내 품목분리라 0428식 item_group=item_name 덮어쓰기 안 함). (idempotent)

-- 1) spec_group '배너형' + 값 S/F/H
INSERT INTO spec_groups (name,unit,sort_order,is_active) SELECT '배너형','형',85,1 WHERE NOT EXISTS (SELECT 1 FROM spec_groups WHERE name='배너형');
INSERT INTO spec_group_values (group_id,value_code,label,sort_order,is_active) SELECT (SELECT id FROM spec_groups WHERE name='배너형'),'S','S형',10,1 WHERE NOT EXISTS (SELECT 1 FROM spec_group_values WHERE group_id=(SELECT id FROM spec_groups WHERE name='배너형') AND value_code='S');
INSERT INTO spec_group_values (group_id,value_code,label,sort_order,is_active) SELECT (SELECT id FROM spec_groups WHERE name='배너형'),'F','F형',20,1 WHERE NOT EXISTS (SELECT 1 FROM spec_group_values WHERE group_id=(SELECT id FROM spec_groups WHERE name='배너형') AND value_code='F');
INSERT INTO spec_group_values (group_id,value_code,label,sort_order,is_active) SELECT (SELECT id FROM spec_groups WHERE name='배너형'),'H','H형',30,1 WHERE NOT EXISTS (SELECT 1 FROM spec_group_values WHERE group_id=(SELECT id FROM spec_groups WHERE name='배너형') AND value_code='H');

-- 2) 변종 10 신규 (base 필드 상속, specification=원단+형)
-- ■ 윈드배너 폰지 (TRW-PO) → S/F
INSERT INTO items (item_code,item_name,is_active,spec_group_id,spec_value,specification,item_group,item_type,category_id,subcategory_id,category,sub_category,unit,base_price,sales_price,is_sales_item,is_purchase_item,pricing_method,pricing_profile,width_mm,group_sort,is_favorite,production_required,deduction_method,sheet_spec,waste_factor,stock_mode,description,created_at,updated_at)
SELECT 'TRW-PO-S', item_name||' S형', 1, (SELECT id FROM spec_groups WHERE name='배너형'), 'S', specification||' S형', item_group, item_type,category_id,subcategory_id,category,sub_category,unit,base_price,sales_price,is_sales_item,is_purchase_item,pricing_method,pricing_profile,width_mm,group_sort,is_favorite,production_required,deduction_method,sheet_spec,waste_factor,stock_mode,description, datetime('now'), datetime('now')
FROM items WHERE item_code='TRW-PO' AND NOT EXISTS (SELECT 1 FROM items WHERE item_code='TRW-PO-S');
INSERT INTO items (item_code,item_name,is_active,spec_group_id,spec_value,specification,item_group,item_type,category_id,subcategory_id,category,sub_category,unit,base_price,sales_price,is_sales_item,is_purchase_item,pricing_method,pricing_profile,width_mm,group_sort,is_favorite,production_required,deduction_method,sheet_spec,waste_factor,stock_mode,description,created_at,updated_at)
SELECT 'TRW-PO-F', item_name||' F형', 1, (SELECT id FROM spec_groups WHERE name='배너형'), 'F', specification||' F형', item_group, item_type,category_id,subcategory_id,category,sub_category,unit,base_price,sales_price,is_sales_item,is_purchase_item,pricing_method,pricing_profile,width_mm,group_sort,is_favorite,production_required,deduction_method,sheet_spec,waste_factor,stock_mode,description, datetime('now'), datetime('now')
FROM items WHERE item_code='TRW-PO' AND NOT EXISTS (SELECT 1 FROM items WHERE item_code='TRW-PO-F');
-- ■ 윈드배너 매쉬 (TRW-ME) → S/F
INSERT INTO items (item_code,item_name,is_active,spec_group_id,spec_value,specification,item_group,item_type,category_id,subcategory_id,category,sub_category,unit,base_price,sales_price,is_sales_item,is_purchase_item,pricing_method,pricing_profile,width_mm,group_sort,is_favorite,production_required,deduction_method,sheet_spec,waste_factor,stock_mode,description,created_at,updated_at)
SELECT 'TRW-ME-S', item_name||' S형', 1, (SELECT id FROM spec_groups WHERE name='배너형'), 'S', specification||' S형', item_group, item_type,category_id,subcategory_id,category,sub_category,unit,base_price,sales_price,is_sales_item,is_purchase_item,pricing_method,pricing_profile,width_mm,group_sort,is_favorite,production_required,deduction_method,sheet_spec,waste_factor,stock_mode,description, datetime('now'), datetime('now')
FROM items WHERE item_code='TRW-ME' AND NOT EXISTS (SELECT 1 FROM items WHERE item_code='TRW-ME-S');
INSERT INTO items (item_code,item_name,is_active,spec_group_id,spec_value,specification,item_group,item_type,category_id,subcategory_id,category,sub_category,unit,base_price,sales_price,is_sales_item,is_purchase_item,pricing_method,pricing_profile,width_mm,group_sort,is_favorite,production_required,deduction_method,sheet_spec,waste_factor,stock_mode,description,created_at,updated_at)
SELECT 'TRW-ME-F', item_name||' F형', 1, (SELECT id FROM spec_groups WHERE name='배너형'), 'F', specification||' F형', item_group, item_type,category_id,subcategory_id,category,sub_category,unit,base_price,sales_price,is_sales_item,is_purchase_item,pricing_method,pricing_profile,width_mm,group_sort,is_favorite,production_required,deduction_method,sheet_spec,waste_factor,stock_mode,description, datetime('now'), datetime('now')
FROM items WHERE item_code='TRW-ME' AND NOT EXISTS (SELECT 1 FROM items WHERE item_code='TRW-ME-F');
-- ■ 워킹배너 폰지 (TRWK-PO) → S/F/H
INSERT INTO items (item_code,item_name,is_active,spec_group_id,spec_value,specification,item_group,item_type,category_id,subcategory_id,category,sub_category,unit,base_price,sales_price,is_sales_item,is_purchase_item,pricing_method,pricing_profile,width_mm,group_sort,is_favorite,production_required,deduction_method,sheet_spec,waste_factor,stock_mode,description,created_at,updated_at)
SELECT 'TRWK-PO-S', item_name||' S형', 1, (SELECT id FROM spec_groups WHERE name='배너형'), 'S', specification||' S형', item_group, item_type,category_id,subcategory_id,category,sub_category,unit,base_price,sales_price,is_sales_item,is_purchase_item,pricing_method,pricing_profile,width_mm,group_sort,is_favorite,production_required,deduction_method,sheet_spec,waste_factor,stock_mode,description, datetime('now'), datetime('now')
FROM items WHERE item_code='TRWK-PO' AND NOT EXISTS (SELECT 1 FROM items WHERE item_code='TRWK-PO-S');
INSERT INTO items (item_code,item_name,is_active,spec_group_id,spec_value,specification,item_group,item_type,category_id,subcategory_id,category,sub_category,unit,base_price,sales_price,is_sales_item,is_purchase_item,pricing_method,pricing_profile,width_mm,group_sort,is_favorite,production_required,deduction_method,sheet_spec,waste_factor,stock_mode,description,created_at,updated_at)
SELECT 'TRWK-PO-F', item_name||' F형', 1, (SELECT id FROM spec_groups WHERE name='배너형'), 'F', specification||' F형', item_group, item_type,category_id,subcategory_id,category,sub_category,unit,base_price,sales_price,is_sales_item,is_purchase_item,pricing_method,pricing_profile,width_mm,group_sort,is_favorite,production_required,deduction_method,sheet_spec,waste_factor,stock_mode,description, datetime('now'), datetime('now')
FROM items WHERE item_code='TRWK-PO' AND NOT EXISTS (SELECT 1 FROM items WHERE item_code='TRWK-PO-F');
INSERT INTO items (item_code,item_name,is_active,spec_group_id,spec_value,specification,item_group,item_type,category_id,subcategory_id,category,sub_category,unit,base_price,sales_price,is_sales_item,is_purchase_item,pricing_method,pricing_profile,width_mm,group_sort,is_favorite,production_required,deduction_method,sheet_spec,waste_factor,stock_mode,description,created_at,updated_at)
SELECT 'TRWK-PO-H', item_name||' H형', 1, (SELECT id FROM spec_groups WHERE name='배너형'), 'H', specification||' H형', item_group, item_type,category_id,subcategory_id,category,sub_category,unit,base_price,sales_price,is_sales_item,is_purchase_item,pricing_method,pricing_profile,width_mm,group_sort,is_favorite,production_required,deduction_method,sheet_spec,waste_factor,stock_mode,description, datetime('now'), datetime('now')
FROM items WHERE item_code='TRWK-PO' AND NOT EXISTS (SELECT 1 FROM items WHERE item_code='TRWK-PO-H');
-- ■ 워킹배너 매쉬 (TRWK-ME) → S/F/H
INSERT INTO items (item_code,item_name,is_active,spec_group_id,spec_value,specification,item_group,item_type,category_id,subcategory_id,category,sub_category,unit,base_price,sales_price,is_sales_item,is_purchase_item,pricing_method,pricing_profile,width_mm,group_sort,is_favorite,production_required,deduction_method,sheet_spec,waste_factor,stock_mode,description,created_at,updated_at)
SELECT 'TRWK-ME-S', item_name||' S형', 1, (SELECT id FROM spec_groups WHERE name='배너형'), 'S', specification||' S형', item_group, item_type,category_id,subcategory_id,category,sub_category,unit,base_price,sales_price,is_sales_item,is_purchase_item,pricing_method,pricing_profile,width_mm,group_sort,is_favorite,production_required,deduction_method,sheet_spec,waste_factor,stock_mode,description, datetime('now'), datetime('now')
FROM items WHERE item_code='TRWK-ME' AND NOT EXISTS (SELECT 1 FROM items WHERE item_code='TRWK-ME-S');
INSERT INTO items (item_code,item_name,is_active,spec_group_id,spec_value,specification,item_group,item_type,category_id,subcategory_id,category,sub_category,unit,base_price,sales_price,is_sales_item,is_purchase_item,pricing_method,pricing_profile,width_mm,group_sort,is_favorite,production_required,deduction_method,sheet_spec,waste_factor,stock_mode,description,created_at,updated_at)
SELECT 'TRWK-ME-F', item_name||' F형', 1, (SELECT id FROM spec_groups WHERE name='배너형'), 'F', specification||' F형', item_group, item_type,category_id,subcategory_id,category,sub_category,unit,base_price,sales_price,is_sales_item,is_purchase_item,pricing_method,pricing_profile,width_mm,group_sort,is_favorite,production_required,deduction_method,sheet_spec,waste_factor,stock_mode,description, datetime('now'), datetime('now')
FROM items WHERE item_code='TRWK-ME' AND NOT EXISTS (SELECT 1 FROM items WHERE item_code='TRWK-ME-F');
INSERT INTO items (item_code,item_name,is_active,spec_group_id,spec_value,specification,item_group,item_type,category_id,subcategory_id,category,sub_category,unit,base_price,sales_price,is_sales_item,is_purchase_item,pricing_method,pricing_profile,width_mm,group_sort,is_favorite,production_required,deduction_method,sheet_spec,waste_factor,stock_mode,description,created_at,updated_at)
SELECT 'TRWK-ME-H', item_name||' H형', 1, (SELECT id FROM spec_groups WHERE name='배너형'), 'H', specification||' H형', item_group, item_type,category_id,subcategory_id,category,sub_category,unit,base_price,sales_price,is_sales_item,is_purchase_item,pricing_method,pricing_profile,width_mm,group_sort,is_favorite,production_required,deduction_method,sheet_spec,waste_factor,stock_mode,description, datetime('now'), datetime('now')
FROM items WHERE item_code='TRWK-ME' AND NOT EXISTS (SELECT 1 FROM items WHERE item_code='TRWK-ME-H');

-- 3) product_materials 링크 복사 (base → 변종; 변종코드 = base코드 + '-X' 2글자)
INSERT INTO product_materials (product_item_id, material_item_id, is_default)
SELECT v.id, pm.material_item_id, pm.is_default
FROM items v
JOIN items b ON b.item_code = substr(v.item_code, 1, length(v.item_code)-2)
JOIN product_materials pm ON pm.product_item_id = b.id
WHERE v.item_code IN ('TRW-PO-S','TRW-PO-F','TRW-ME-S','TRW-ME-F','TRWK-PO-S','TRWK-PO-F','TRWK-PO-H','TRWK-ME-S','TRWK-ME-F','TRWK-ME-H')
  AND NOT EXISTS (SELECT 1 FROM product_materials x WHERE x.product_item_id=v.id AND x.material_item_id=pm.material_item_id);

-- 4) base 4종 → 변종 모품목 템플릿 (is_active=0 보존, 삭제금지 — 0434 규칙)
UPDATE items SET spec_group_id=(SELECT id FROM spec_groups WHERE name='배너형'), spec_value=NULL, is_active=0, updated_at=datetime('now')
WHERE item_code IN ('TRW-PO','TRW-ME','TRWK-PO','TRWK-ME');

-- 5) pp '형' 옵션 폐기 (주문 사용 0건 실측 → 링크·옵션 하드삭제, 0445 잠복 마커 교훈)
DELETE FROM pp_option_subcategories WHERE pp_option_id IN (SELECT id FROM post_processing_options WHERE pp_category='형');
DELETE FROM post_processing_options WHERE pp_category='형';
