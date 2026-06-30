-- 0411: 철제배너 거치대 3 SKU (사용방법별 — 실외거치대/실외물통SET/실내거치대, 판매내역 21라인 기반·사용자 확정).
-- GOODS 상품(category_id=4), 매입+판매, 생산X, 단가 보류. item_group='배너 부속품'(0410 부속품과 동일 묶음).
INSERT INTO items (item_code, item_name, item_type, category, category_id, unit, base_price, sales_price, pricing_method, is_active, is_sales_item, is_purchase_item, production_required, item_group) VALUES
 ('ACC-026','실외 철제배너 거치대(TSO)','GOODS','상품',4,'EA',0,0,'FIXED',1,1,1,0,'배너 부속품'),
 ('ACC-027','실외 철제배너 물통SET(TSO)','GOODS','상품',4,'EA',0,0,'FIXED',1,1,1,0,'배너 부속품'),
 ('ACC-028','실내 철제배너 거치대(TS/SD-T)','GOODS','상품',4,'EA',0,0,'FIXED',1,1,1,0,'배너 부속품');
