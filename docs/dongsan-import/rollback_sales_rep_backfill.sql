-- 담당자 소급 롤백 (2026-08-07) — 적용 전 전 주문이 NULL 이었다
UPDATE orders SET sales_rep_id = NULL;
