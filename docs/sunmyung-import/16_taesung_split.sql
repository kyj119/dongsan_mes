-- 태성애드텍(2382) 5월까지 선명(entity2)에서 수금 → 복귀+E3→E2. 6월분만 동산청주 유지.
UPDATE order_billing_groups SET entity_id=2 WHERE order_id IN (SELECT id FROM orders WHERE client_id=2382 AND entity_id=3 AND order_date < '2026-06-01');
UPDATE orders SET entity_id=2, order_number='E2'||substr(order_number,3) WHERE client_id=2382 AND entity_id=3 AND order_date < '2026-06-01';
UPDATE payments SET entity_id=2 WHERE client_id=2382 AND entity_id=3 AND payment_date < '2026-06-01';
