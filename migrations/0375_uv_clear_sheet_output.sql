-- 0375: UV 투명시트 출력 제품 — SPC031G 투명시트에 UV 출력. (0373→0375 리넘버: 바로빌 0373과 충돌, 내용·prod적용 불변) ★출력은 137폭만 → SPC031G-137 단일 연결(자동차감 137 고정).
-- 105/127/152폭은 판매(재단)만(0372 원자재 dual), 출력 substrate는 137뿐. UV, AREA, 자체출력. 소분류=시트. (idempotent)
INSERT OR IGNORE INTO items (item_code, item_name, item_type, category, category_id, unit, base_price, sales_price, pricing_method, pricing_profile, is_active, is_sales_item, is_purchase_item, production_required, item_group, sub_category)
VALUES ('UV-SPC031G','UV 투명시트','PRODUCT','UV',2,'EA',0,0,'AREA','AREA',1,1,0,1,'투명시트','시트');

-- 연결: UV 투명시트 → SPC031G 137폭만
INSERT INTO product_materials (product_item_id, material_item_id, is_default)
SELECT p.id, m.id, 0
FROM items p JOIN items m ON m.item_code='SPC031G-137'
WHERE p.item_code='UV-SPC031G'
  AND NOT EXISTS (SELECT 1 FROM product_materials x WHERE x.product_item_id=p.id AND x.material_item_id=m.id);
