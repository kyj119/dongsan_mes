-- 「수량 X 단가」 교정 2차 롤백 (2026-08-07)
UPDATE purchase_order_items SET quantity = 100, unit_price = 80000    WHERE id = 3096;
UPDATE purchase_order_items SET quantity = 130, unit_price = 31660    WHERE id = 3101;
UPDATE purchase_order_items SET quantity = 230, unit_price = 33380    WHERE id = 3104;
UPDATE purchase_order_items SET quantity = 1,   unit_price = 10598000 WHERE id = 3099;
