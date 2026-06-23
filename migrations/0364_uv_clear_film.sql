-- 0364: UV 클리어필름 — UV 출력 투명 윈도우필름. 제품 1(UV) + 원단 클리어필름(127/152 두 폭).
-- 중국산이라 제조코드 없음 → 원단명 '클리어필름'(내부코드 CLEAR-*). WAY(1/2/3WAY)=출력옵션(원단 동일, 제품/원단 미반영 — 관리방안 별도 결정).
-- 원단 yd dual(매입+판매), ROLL 폭매칭(출력폭→127/152, >152 타일/수동). 제품 AREA, UV전용 자체출력(매입X), 단가 보류(0).
INSERT INTO items (item_code, item_name, item_type, category, category_id, unit, base_price, sales_price, pricing_method, is_active, is_sales_item, is_purchase_item, production_required, item_group, width_mm, specification) VALUES
 ('CLEAR-127','클리어필름','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'클리어필름',1270,'127cm'),
 ('CLEAR-152','클리어필름','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'클리어필름',1520,'152cm');

INSERT INTO items (item_code, item_name, item_type, category, category_id, unit, base_price, sales_price, pricing_method, pricing_profile, is_active, is_sales_item, is_purchase_item, production_required) VALUES
 ('UV-CLEAR','UV 클리어필름','PRODUCT','UV',2,'EA',0,0,'AREA','AREA',1,1,0,1);

INSERT INTO product_materials (product_item_id, material_item_id, is_default)
SELECT p.id, m.id, 0
FROM items p JOIN items m ON (m.item_type='MATERIAL' AND m.item_group='클리어필름')
WHERE p.item_code='UV-CLEAR';
