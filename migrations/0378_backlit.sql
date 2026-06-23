-- 0378: 백릿(후면조명) 출력 — 수성/UV가 서로 다른 원단(공용매체 아님). 제조사 호홍.
-- 수성 백릿 → '수성 백릿-호홍'(90/127/150, 30m) / UV 백릿 → '멀티 백릿-호홍'(127 단폭, 30m). 각자 원단 폭매칭 ROLL 차감.
-- ※'와이드컬러(백릿)'=백릿 출력의 다른 이름(수성 백릿으로 커버). 소분류 '백릿' 신설(후가공 미연결). 단가 보류. (idempotent)

-- 소분류 '백릿' 신설
INSERT INTO pp_applicable_subcategories (group_name, subcat_name, sort_order, is_active)
SELECT '실사출력','백릿',26,1 WHERE NOT EXISTS (SELECT 1 FROM pp_applicable_subcategories WHERE subcat_name='백릿' AND group_name='실사출력');

-- 원단 (dual 매입+판매, yd, ROLL). spec=폭+롤길이(30m)
INSERT OR IGNORE INTO items (item_code, item_name, item_type, category, category_id, unit, base_price, sales_price, pricing_method, is_active, is_sales_item, is_purchase_item, production_required, item_group, width_mm, specification, deduction_method) VALUES
 ('BKLT-AQ-090','수성 백릿-호홍','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'수성 백릿-호홍',900, '90cm 30m','ROLL'),
 ('BKLT-AQ-127','수성 백릿-호홍','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'수성 백릿-호홍',1270,'127cm 30m','ROLL'),
 ('BKLT-AQ-150','수성 백릿-호홍','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'수성 백릿-호홍',1500,'150cm 30m','ROLL'),
 ('BKLT-UV-127','멀티 백릿-호홍','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'멀티 백릿-호홍',1270,'127cm 30m','ROLL');

-- 제품 (수성 백릿 / UV 백릿, AREA, 자체출력)
INSERT OR IGNORE INTO items (item_code, item_name, item_type, category, category_id, unit, base_price, sales_price, pricing_method, pricing_profile, is_active, is_sales_item, is_purchase_item, production_required, item_group, sub_category) VALUES
 ('AQ-BKLT','수성 백릿','PRODUCT','수성',(SELECT id FROM item_categories WHERE category_code='AQUEOUS'),'EA',0,0,'AREA','AREA',1,1,0,1,'백릿','백릿'),
 ('UV-BKLT','UV 백릿','PRODUCT','UV',2,'EA',0,0,'AREA','AREA',1,1,0,1,'백릿','백릿');

-- 연결: 수성 백릿→수성 백릿-호홍 / UV 백릿→멀티 백릿-호홍
INSERT INTO product_materials (product_item_id, material_item_id, is_default)
SELECT p.id, m.id, 0
FROM items p JOIN items m ON (
     (p.item_code='AQ-BKLT' AND m.item_group='수성 백릿-호홍')
  OR (p.item_code='UV-BKLT' AND m.item_group='멀티 백릿-호홍') )
WHERE p.item_code IN ('AQ-BKLT','UV-BKLT')
  AND NOT EXISTS (SELECT 1 FROM product_materials x WHERE x.product_item_id=p.id AND x.material_item_id=m.id);
