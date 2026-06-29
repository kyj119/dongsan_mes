-- 0401: 전사 자이언트배너 — 전사 폰지/매쉬 2제품(폭매칭 정확 위해 원단별 분리, 깃발 0356 패턴) / AREA / 단가 보류.
-- 대형 거치대(빅폴/트라이폴)=부속 GOODS 주문라인(제품 미포함). 폰지/매쉬 원단 링크는 일괄 후속('폰지'/'매쉬' 그룹).
INSERT INTO items (item_code, item_name, item_type, category, category_id, unit, base_price, sales_price, pricing_method, pricing_profile, is_active, is_sales_item, is_purchase_item, production_required, item_group, specification, sub_category, deduction_method) VALUES
 ('TRGI-PO','전사 자이언트배너 폰지','PRODUCT','전사',1,'EA',0,0,'AREA','AREA',1,1,0,1,'자이언트배너','폰지','자이언트배너','ROLL'),
 ('TRGI-ME','전사 자이언트배너 매쉬','PRODUCT','전사',1,'EA',0,0,'AREA','AREA',1,1,0,1,'자이언트배너','매쉬','자이언트배너','ROLL');
