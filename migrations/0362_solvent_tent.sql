-- 0362: 솔벤 텐트천 — 공용매체(수성·솔벤 둘 다 텐트천 출력). 제품 1(솔벤) + 기존 텐트천 원단(TENT-*) 공유.
-- 수성 텐트천(AQ-TENT, 0346)과 동일 텐트천 원단 공유(인쇄방식만 다름 = 공용매체 원칙). 0357 솔벤매쉬와 동일 패턴.
-- AREA(규격 커스텀=주문 라인), 자체출력(매입X), 단가 보류(0). 사각족자봉 등 부속=주문 추가라인.
-- 폭매칭: 출력폭 → 텐트천 90/127/152/180 자동선택(>180은 타일/수동).
INSERT INTO items (item_code, item_name, item_type, category, category_id, unit, base_price, sales_price, pricing_method, pricing_profile, is_active, is_sales_item, is_purchase_item, production_required) VALUES
 ('SV-TENT','솔벤 텐트천','PRODUCT','솔벤',3,'EA',0,0,'AREA','AREA',1,1,0,1);

INSERT INTO product_materials (product_item_id, material_item_id, is_default)
SELECT p.id, m.id, 0
FROM items p JOIN items m ON (m.item_type='MATERIAL' AND m.item_group='텐트천')
WHERE p.item_code='SV-TENT';
