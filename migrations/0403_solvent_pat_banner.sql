-- 0403: 솔벤 패트배너 — 솔벤출력 패트원단(나투라/블랙아웃, 수성 패트 AQ-PAT와 별개 솔벤급) / AREA / 단가 보류.
-- ⚠️ 솔벤급 패트 원단 미등록(별도) → 폭매칭 차감 보류: 원단명·폭 확인 후 등록+product_materials 링크(후속).
INSERT INTO items (item_code, item_name, item_type, category, category_id, unit, base_price, sales_price, pricing_method, pricing_profile, is_active, is_sales_item, is_purchase_item, production_required, item_group, specification, sub_category, deduction_method) VALUES
 ('SV-PATB','솔벤 패트배너','PRODUCT','솔벤',3,'EA',0,0,'AREA','AREA',1,1,0,1,'솔벤패트배너','패트(솔벤)','솔벤패트배너','ROLL');
