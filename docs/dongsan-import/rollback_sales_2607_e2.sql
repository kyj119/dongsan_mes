-- 선명 2026-07 판매 적재 롤백 (2026-08-07)
-- ⚠️ 마커가 '선명 이관 2026-07' 로 **월·법인 분리**돼 있다. 다른 이관분은 안 지워진다.
DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관 2026-07%');
DELETE FROM order_billing_groups WHERE order_id IN (SELECT id FROM orders WHERE notes LIKE '선명 이관 2026-07%');
DELETE FROM orders WHERE notes LIKE '선명 이관 2026-07%';
