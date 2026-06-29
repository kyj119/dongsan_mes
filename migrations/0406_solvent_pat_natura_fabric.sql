-- 0406: 솔벤 패트배너 원단 — 나투라(솔벤급 패트, 수성 '패트배너 30M 호홍'과 별개) 2폭 + SV-PATB 링크.
-- 폭 60·127cm(사용자 확정). 롤길이 미상(후속 보강 가능, 폭매칭 차감엔 무관). dual 매입+판매, yd.
INSERT INTO items (item_code, item_name, item_type, category, category_id, unit, base_price, sales_price, pricing_method, is_active, is_sales_item, is_purchase_item, production_required, item_group, width_mm, specification) VALUES
 ('NAT-060','나투라 솔벤패트','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'나투라 솔벤패트',600,'60cm'),
 ('NAT-127','나투라 솔벤패트','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'나투라 솔벤패트',1270,'127cm');

INSERT INTO product_materials (product_item_id, material_item_id, is_default)
SELECT p.id, m.id, 0
FROM items p JOIN items m ON (p.item_code='SV-PATB' AND m.item_group='나투라 솔벤패트')
WHERE p.item_code='SV-PATB' AND m.item_type='MATERIAL';
