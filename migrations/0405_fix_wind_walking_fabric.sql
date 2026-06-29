-- 0405: 윈드/워킹배너 원단 정정 — 니트 아님(사용자 확정), 전사 폰지/매쉬로 출력.
-- 0398/0399의 니트 단일(TRW/TRWK) 폐기(주문 미사용·당일 신규) → 폰지/매쉬 2제품 분리(폭매칭 정확, 자이언트 0401 동일) + 링크.
-- 형(S/F/H)=주문옵션 유지(별도). 단가 보류.
DELETE FROM items WHERE item_code IN ('TRW','TRWK');

INSERT INTO items (item_code, item_name, item_type, category, category_id, unit, base_price, sales_price, pricing_method, pricing_profile, is_active, is_sales_item, is_purchase_item, production_required, item_group, specification, sub_category, deduction_method) VALUES
 ('TRW-PO','전사 윈드배너 폰지','PRODUCT','전사',1,'EA',0,0,'AREA','AREA',1,1,0,1,'윈드배너','폰지','윈드배너','ROLL'),
 ('TRW-ME','전사 윈드배너 매쉬','PRODUCT','전사',1,'EA',0,0,'AREA','AREA',1,1,0,1,'윈드배너','매쉬','윈드배너','ROLL'),
 ('TRWK-PO','전사 워킹배너 폰지','PRODUCT','전사',1,'EA',0,0,'AREA','AREA',1,1,0,1,'워킹배너','폰지','워킹배너','ROLL'),
 ('TRWK-ME','전사 워킹배너 매쉬','PRODUCT','전사',1,'EA',0,0,'AREA','AREA',1,1,0,1,'워킹배너','매쉬','워킹배너','ROLL');

INSERT INTO product_materials (product_item_id, material_item_id, is_default)
SELECT p.id, m.id, 0
FROM items p JOIN items m ON (
     (p.item_code IN ('TRW-PO','TRWK-PO') AND m.item_group='폰지')
  OR (p.item_code IN ('TRW-ME','TRWK-ME') AND m.item_group='매쉬') )
WHERE p.item_code IN ('TRW-PO','TRW-ME','TRWK-PO','TRWK-ME')
  AND m.item_type='MATERIAL';
