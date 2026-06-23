-- 0363: UV 엠보시트 — UV 출력 윈도우필름. 제품 1(UV) + 원단 EP115(100/122 두 폭). WAY=출력옵션(제품 미반영).
-- ★EP115 dual(매입+판매) 2용도: ①UV 엠보시트로 출력(자동차감) ②출력 없이 재단만 판매 → EP115 자재를 주문 라인에 직접(유통품목, 규격=재단치수).
-- 원단 yd, ROLL 폭매칭(출력폭→100/122 자동선택, >122 타일/수동). 제품 AREA, 자체출력(매입X), 단가 보류(0).
INSERT INTO items (item_code, item_name, item_type, category, category_id, unit, base_price, sales_price, pricing_method, is_active, is_sales_item, is_purchase_item, production_required, item_group, width_mm, specification) VALUES
 ('EP115-100','엠보시트 EP115','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'엠보시트 EP115',1000,'100cm'),
 ('EP115-122','엠보시트 EP115','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'엠보시트 EP115',1220,'122cm');

INSERT INTO items (item_code, item_name, item_type, category, category_id, unit, base_price, sales_price, pricing_method, pricing_profile, is_active, is_sales_item, is_purchase_item, production_required) VALUES
 ('UV-EMBO','UV 엠보시트','PRODUCT','UV',2,'EA',0,0,'AREA','AREA',1,1,0,1);

-- 연결: UV 엠보시트 → EP115 두 폭 (폭매칭 ROLL)
INSERT INTO product_materials (product_item_id, material_item_id, is_default)
SELECT p.id, m.id, 0
FROM items p JOIN items m ON (m.item_type='MATERIAL' AND m.item_group='엠보시트 EP115')
WHERE p.item_code='UV-EMBO';
