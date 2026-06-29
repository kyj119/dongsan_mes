-- 0408: 전사 태극기배너 + 외국기배너 — 전사 인쇄(폰지 단일, 사용자 확정), AREA, 단가 보류. 형 없음(깃발류).
-- 거치대 등 부속=주문 추가 라인. 폰지 원단(5폭) 폭매칭 자동차감. 태극기배너=나염 태극기(태극기 분류)와 별개=전사 인쇄.
INSERT INTO items (item_code, item_name, item_type, category, category_id, unit, base_price, sales_price, pricing_method, pricing_profile, is_active, is_sales_item, is_purchase_item, production_required, item_group, specification, sub_category, deduction_method) VALUES
 ('TRTB','전사 태극기배너','PRODUCT','전사',1,'EA',0,0,'AREA','AREA',1,1,0,1,'태극기배너','폰지','태극기배너','ROLL'),
 ('TRFB','전사 외국기배너','PRODUCT','전사',1,'EA',0,0,'AREA','AREA',1,1,0,1,'외국기배너','폰지','외국기배너','ROLL');

INSERT INTO product_materials (product_item_id, material_item_id, is_default)
SELECT p.id, m.id, 0
FROM items p JOIN items m ON (p.item_code IN ('TRTB','TRFB') AND m.item_group='폰지')
WHERE p.item_code IN ('TRTB','TRFB') AND m.item_type='MATERIAL';
