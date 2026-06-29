-- 0409: 가로등배너 표준규격 확대 — 60×160 폰지/매쉬 추가(실주문 3위 29건, 0360의 180/150에 이어). FIXED 변종.
-- 기존 TRB 속성과 동일(FIXED·pricing_profile null·sub_category '가로등배너'·매입X). 폰지/매쉬 폭매칭 자동차감.
INSERT INTO items (item_code, item_name, item_type, category, category_id, unit, base_price, sales_price, pricing_method, is_active, is_sales_item, is_purchase_item, production_required, item_group, specification, sub_category, deduction_method) VALUES
 ('TRB-PO-160','전사 가로등배너 폰지 60×160','PRODUCT','전사',1,'EA',0,0,'FIXED',1,1,0,1,'가로등배너','폰지 60×160','가로등배너','ROLL'),
 ('TRB-ME-160','전사 가로등배너 매쉬 60×160','PRODUCT','전사',1,'EA',0,0,'FIXED',1,1,0,1,'가로등배너','매쉬 60×160','가로등배너','ROLL');

INSERT INTO product_materials (product_item_id, material_item_id, is_default)
SELECT p.id, m.id, 0
FROM items p JOIN items m ON (
     (p.item_code='TRB-PO-160' AND m.item_group='폰지')
  OR (p.item_code='TRB-ME-160' AND m.item_group='매쉬') )
WHERE p.item_code IN ('TRB-PO-160','TRB-ME-160') AND m.item_type='MATERIAL';
