-- 0371: UV 뽀닥 + UV 고휘도반사 출력물 등록. 원단별/색상별 제품 분리(자동차감 정합).
-- 뽀닥: 원단 2(직물형/호일형 137 30m단일) → 제품 2(원단별 출력 분리). UV, AREA, ROLL 폭매칭.
-- 고휘도반사: 원단=프리즘반사시트 백색/노랑 × 94/122폭(50yd). ★색상은 차감엔진이 폭으로 못 고르므로 색별 제품+색별 원단그룹 분리. 백색제품→백색원단, 노랑제품→노랑원단.
-- 소분류 '뽀닥'/'고휘도반사' 신설(후가공 미연결=추후 지정). 단가 보류(0). (idempotent)

-- 소분류 신설
INSERT INTO pp_applicable_subcategories (group_name, subcat_name, sort_order, is_active)
SELECT '실사출력','뽀닥',23,1 WHERE NOT EXISTS (SELECT 1 FROM pp_applicable_subcategories WHERE subcat_name='뽀닥' AND group_name='실사출력');
INSERT INTO pp_applicable_subcategories (group_name, subcat_name, sort_order, is_active)
SELECT '실사출력','고휘도반사',24,1 WHERE NOT EXISTS (SELECT 1 FROM pp_applicable_subcategories WHERE subcat_name='고휘도반사' AND group_name='실사출력');

-- 원단 (MATERIAL, dual 매입+판매, yd, ROLL, 폭매칭. spec=폭+롤길이)
INSERT OR IGNORE INTO items (item_code, item_name, item_type, category, category_id, unit, base_price, sales_price, pricing_method, is_active, is_sales_item, is_purchase_item, production_required, item_group, width_mm, specification, deduction_method) VALUES
 ('PDK-J137','뽀닥시트 직물형','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'뽀닥시트 직물형',1370,'137cm 30m','ROLL'),
 ('PDK-F137','뽀닥시트 호일형','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'뽀닥시트 호일형',1370,'137cm 30m','ROLL'),
 ('PRM-W094','프리즘반사시트 백색','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'프리즘반사시트 백색',940, '94cm 50yd','ROLL'),
 ('PRM-W122','프리즘반사시트 백색','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'프리즘반사시트 백색',1220,'122cm 50yd','ROLL'),
 ('PRM-Y094','프리즘반사시트 노랑','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'프리즘반사시트 노랑',940, '94cm 50yd','ROLL'),
 ('PRM-Y122','프리즘반사시트 노랑','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'프리즘반사시트 노랑',1220,'122cm 50yd','ROLL');

-- 제품 (PRODUCT, UV, AREA, 자체출력=매입X, item_group묶음+spec변종)
INSERT OR IGNORE INTO items (item_code, item_name, item_type, category, category_id, unit, base_price, sales_price, pricing_method, pricing_profile, is_active, is_sales_item, is_purchase_item, production_required, item_group, specification, sub_category) VALUES
 ('UV-PDK-J','UV 뽀닥 직물형','PRODUCT','UV',2,'EA',0,0,'AREA','AREA',1,1,0,1,'뽀닥','직물형','뽀닥'),
 ('UV-PDK-F','UV 뽀닥 호일형','PRODUCT','UV',2,'EA',0,0,'AREA','AREA',1,1,0,1,'뽀닥','호일형','뽀닥'),
 ('UV-PRM-W','UV 고휘도반사 백색','PRODUCT','UV',2,'EA',0,0,'AREA','AREA',1,1,0,1,'고휘도반사','백색','고휘도반사'),
 ('UV-PRM-Y','UV 고휘도반사 노랑','PRODUCT','UV',2,'EA',0,0,'AREA','AREA',1,1,0,1,'고휘도반사','노랑','고휘도반사');

-- 연결: 제품 → 색상/원단별 그룹 (백색제품→백색원단, 노랑제품→노랑원단, 뽀닥은 형태별)
INSERT INTO product_materials (product_item_id, material_item_id, is_default)
SELECT p.id, m.id, 0
FROM items p JOIN items m ON (
     (p.item_code='UV-PDK-J' AND m.item_group='뽀닥시트 직물형')
  OR (p.item_code='UV-PDK-F' AND m.item_group='뽀닥시트 호일형')
  OR (p.item_code='UV-PRM-W' AND m.item_group='프리즘반사시트 백색')
  OR (p.item_code='UV-PRM-Y' AND m.item_group='프리즘반사시트 노랑') )
WHERE p.item_code IN ('UV-PDK-J','UV-PDK-F','UV-PRM-W','UV-PRM-Y')
  AND NOT EXISTS (SELECT 1 FROM product_materials x WHERE x.product_item_id=p.id AND x.material_item_id=m.id);
