-- 0361: 랩핑시트 — 솔벤·UV 공용매체. 제품 2(솔벤/UV) + 원단 1(LD59HTG 137 단일폭). 0357 솔벤매쉬와 동일 패턴.
-- 랩핑시트=점착 래핑필름 출력물, 솔벤·UV 둘 다 출력 → 제품 분리(폭매칭 정합)·원단 공유(같은 재고 차감).
-- 원단명 LD59HTG, 137cm 단일폭(width_mm 1370). dual 매입+판매, yd, ROLL(기본). 규격은 주문 라인(AREA, 커스텀). 단가 보류(0).
INSERT INTO items (item_code, item_name, item_type, category, category_id, unit, base_price, sales_price, pricing_method, is_active, is_sales_item, is_purchase_item, production_required, item_group, width_mm, specification) VALUES
 ('LD59HTG-137','랩핑시트 LD59HTG','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'랩핑시트 LD59HTG',1370,'137cm');

INSERT INTO items (item_code, item_name, item_type, category, category_id, unit, base_price, sales_price, pricing_method, pricing_profile, is_active, is_sales_item, is_purchase_item, production_required) VALUES
 ('SV-WRAP','솔벤 랩핑시트','PRODUCT','솔벤',3,'EA',0,0,'AREA','AREA',1,1,0,1),
 ('UV-WRAP','UV 랩핑시트', 'PRODUCT','UV',  2,'EA',0,0,'AREA','AREA',1,1,0,1);

-- 연결: 솔벤·UV 랩핑시트 → 랩핑시트 LD59HTG 공유 (137 단일폭, 폭매칭 ROLL)
INSERT INTO product_materials (product_item_id, material_item_id, is_default)
SELECT p.id, m.id, 0
FROM items p JOIN items m ON (m.item_type='MATERIAL' AND m.item_group='랩핑시트 LD59HTG')
WHERE p.item_code IN ('SV-WRAP','UV-WRAP');
