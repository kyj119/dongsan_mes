-- 0356: 전사 직접출력 제품 — 깃발/만장기(원단별 3) + 어구실명제(매쉬). 전사 분류, AREA, 원단 자동차감.
-- 깃발·만장기는 폰지/샤틴/매쉬 다 사용 → 폭매칭 정확 위해 원단별 제품 분리(후렉스/시트 방식).
-- 어구실명제=매쉬 고정. 전사(TRANSFER id1) 인쇄, 자체출력 PRODUCT(AREA, 판매), 원단(폰지/샤틴/매쉬) 폭매칭 차감.
INSERT INTO items (item_code, item_name, item_type, category, category_id, unit, base_price, sales_price, pricing_method, pricing_profile, is_active, is_sales_item, is_purchase_item, production_required, item_group, specification) VALUES
 ('TRG-PO','전사 깃발 폰지','PRODUCT','전사',1,'EA',0,0,'AREA','AREA',1,1,0,1,'깃발','폰지'),
 ('TRG-SA','전사 깃발 샤틴','PRODUCT','전사',1,'EA',0,0,'AREA','AREA',1,1,0,1,'깃발','샤틴'),
 ('TRG-ME','전사 깃발 매쉬','PRODUCT','전사',1,'EA',0,0,'AREA','AREA',1,1,0,1,'깃발','매쉬'),
 ('TRM-PO','전사 만장기 폰지','PRODUCT','전사',1,'EA',0,0,'AREA','AREA',1,1,0,1,'만장기','폰지'),
 ('TRM-SA','전사 만장기 샤틴','PRODUCT','전사',1,'EA',0,0,'AREA','AREA',1,1,0,1,'만장기','샤틴'),
 ('TRM-ME','전사 만장기 매쉬','PRODUCT','전사',1,'EA',0,0,'AREA','AREA',1,1,0,1,'만장기','매쉬'),
 ('TRE-ME','전사 어구실명제','PRODUCT','전사',1,'EA',0,0,'AREA','AREA',1,1,0,1,'어구실명제','매쉬');

INSERT INTO product_materials (product_item_id, material_item_id, is_default)
SELECT p.id, m.id, 0
FROM items p JOIN items m ON (
     (p.item_code IN ('TRG-PO','TRM-PO') AND m.item_group='폰지')
  OR (p.item_code IN ('TRG-SA','TRM-SA') AND m.item_group='샤틴')
  OR (p.item_code IN ('TRG-ME','TRM-ME','TRE-ME') AND m.item_group='매쉬') )
WHERE p.item_code IN ('TRG-PO','TRG-SA','TRG-ME','TRM-PO','TRM-SA','TRM-ME','TRE-ME');
