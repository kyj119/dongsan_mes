-- 주문 취소 이유 기록
ALTER TABLE orders ADD COLUMN cancel_reason TEXT;
