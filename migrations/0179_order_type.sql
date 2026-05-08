-- order_type: 주문 유형 (PRODUCTION=제작, DISTRIBUTION=유통)
ALTER TABLE orders ADD COLUMN order_type TEXT NOT NULL DEFAULT 'PRODUCTION';
CREATE INDEX IF NOT EXISTS idx_orders_order_type ON orders(order_type);
