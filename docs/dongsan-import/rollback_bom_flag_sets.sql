-- 태극기 세트 BOM 롤백 (2026-08-07)
DELETE FROM product_materials
WHERE product_item_id IN (SELECT id FROM items WHERE item_code IN ('GDS-FBSET','GDS-JIGWANSET'));
