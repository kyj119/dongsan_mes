-- EP1852 상품 등록 롤백 (2026-08-07)
UPDATE purchase_order_items SET item_id = NULL WHERE id = 278;
UPDATE order_items SET item_id = NULL WHERE item_id = (SELECT id FROM items WHERE item_code='GDS-EQ-EP1852');
DELETE FROM items WHERE item_code = 'GDS-EQ-EP1852';
