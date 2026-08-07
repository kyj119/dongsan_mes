-- 수량/단가 교정 롤백 (2026-08-07)
UPDATE purchase_order_items SET quantity = 6498500, unit_price = 1 WHERE id = 3093;
UPDATE purchase_order_items SET quantity = 3498500, unit_price = 1 WHERE id = 3095;
UPDATE purchase_order_items SET quantity = 600000,  unit_price = 1 WHERE id = 3108;
UPDATE purchase_order_items SET quantity = 180000,  unit_price = 1 WHERE id = 3111;
UPDATE purchase_order_items SET quantity = 180000,  unit_price = 1 WHERE id = 3113;
