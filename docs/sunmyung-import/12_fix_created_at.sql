-- 원장 기간 필터가 created_at 기준 → 실제 주문일로 보정 (import시각=07-15 문제 해결)
UPDATE orders SET created_at = order_date || ' 09:00:00'
WHERE entity_id=2 AND notes LIKE '선명 이관%' AND date(created_at)='2026-07-15';
UPDATE order_billing_groups SET created_at = COALESCE(accounting_date, billed_at) || ' 09:00:00'
WHERE order_id IN (SELECT id FROM orders WHERE entity_id=2 AND notes LIKE '선명 이관%') AND date(created_at)='2026-07-15';
