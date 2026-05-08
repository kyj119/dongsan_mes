-- 주문 라인별 단위 원가 및 마진율
ALTER TABLE order_items ADD COLUMN unit_cost REAL DEFAULT 0;
ALTER TABLE order_items ADD COLUMN margin_rate REAL DEFAULT 0;
