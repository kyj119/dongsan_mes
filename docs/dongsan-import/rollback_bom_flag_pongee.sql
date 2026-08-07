-- 기류 → 폰지 BOM 연결 롤백 (2026-08-07)
-- 적용 전 이 제품들은 product_materials 가 0행이었다.
DELETE FROM product_materials WHERE product_item_id IN (SELECT id FROM items WHERE item_code IN ('MBG-8', 'TGK-6', 'NHG-8', 'MGG-7', 'TGK-4-1', 'MBG-7-1', 'MJG-7G', 'TGK-8-1', 'NHG-7', 'TGK-SG45', 'MGG-8', 'NHG-7-1', 'MJG-7-1', 'MJG-8', 'SMG-5', 'SMG-4', 'NHG-7G', 'MBG-6'));
