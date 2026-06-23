-- 0372: 유통 시트 등록 — 사서 파는 시트(매입+판매 dual). 판매=주문 라인 직접선택(유통품목).
-- LC2000(보조시트 100, 간판 재단판매)·SPE030A(옥외랩핑 137, 상품판매) = 상품(GOODS, 출력X 순수판매).
-- SPC031G(투명시트 105/127/137/152, 전폭 상품판매 + 출력은 137만) = 원자재(dual). 출력제품은 인쇄방식 확인 후 0373. (idempotent)

-- LC2000 보조시트 — 상품(GOODS)
INSERT OR IGNORE INTO items (item_code, item_name, item_type, category, category_id, unit, base_price, sales_price, pricing_method, is_active, is_sales_item, is_purchase_item, production_required, item_group, width_mm, specification)
VALUES ('LC2000-100','보조시트 LC2000','GOODS','상품',(SELECT id FROM item_categories WHERE category_code='GOODS'),'yd',0,0,'FIXED',1,1,1,0,'보조시트 LC2000',1000,'100cm');

-- SPE030A 옥외 랩핑시트 — 상품(GOODS)
INSERT OR IGNORE INTO items (item_code, item_name, item_type, category, category_id, unit, base_price, sales_price, pricing_method, is_active, is_sales_item, is_purchase_item, production_required, item_group, width_mm, specification)
VALUES ('SPE030A-137','옥외 랩핑시트 SPE030A','GOODS','상품',(SELECT id FROM item_categories WHERE category_code='GOODS'),'yd',0,0,'FIXED',1,1,1,0,'옥외 랩핑시트 SPE030A',1370,'137cm');

-- SPC031G 투명시트 — 원자재(dual, 전폭 판매 + 137 출력)
INSERT OR IGNORE INTO items (item_code, item_name, item_type, category, category_id, unit, base_price, sales_price, pricing_method, is_active, is_sales_item, is_purchase_item, production_required, item_group, width_mm, specification, deduction_method) VALUES
 ('SPC031G-105','투명시트 SPC031G','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'투명시트 SPC031G',1050,'105cm','ROLL'),
 ('SPC031G-127','투명시트 SPC031G','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'투명시트 SPC031G',1270,'127cm','ROLL'),
 ('SPC031G-137','투명시트 SPC031G','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'투명시트 SPC031G',1370,'137cm','ROLL'),
 ('SPC031G-152','투명시트 SPC031G','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'투명시트 SPC031G',1520,'152cm','ROLL');
