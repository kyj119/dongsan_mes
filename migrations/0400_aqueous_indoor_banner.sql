-- 0400: 수성 실내배너 — 수성출력 패트원단 / AREA / 단가 보류 / 일자형 거치대=부속 GOODS 라인.
-- 실내 60×180 표준이나 AREA로 통일(자유규격, 표준은 주문 입력). 패트 원단 링크는 일괄 후속(0344 '패트배너 30M 호홍').
INSERT INTO items (item_code, item_name, item_type, category, category_id, unit, base_price, sales_price, pricing_method, pricing_profile, is_active, is_sales_item, is_purchase_item, production_required, item_group, specification, sub_category, deduction_method) VALUES
 ('AQ-INB','수성 실내배너','PRODUCT','수성',15,'EA',0,0,'AREA','AREA',1,1,0,1,'실내배너','패트','실내배너','ROLL');
