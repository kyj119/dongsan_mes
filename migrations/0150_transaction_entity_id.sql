-- 0150: 트랜잭션 테이블에 entity_id 일괄 추가 (멀티사업자)
-- SQLite 제약: ALTER TABLE ADD COLUMN에서 REFERENCES + DEFAULT 동시 불가 → DEFAULT만 사용
ALTER TABLE orders ADD COLUMN entity_id INTEGER DEFAULT 1;
ALTER TABLE payments ADD COLUMN entity_id INTEGER DEFAULT 1;
ALTER TABLE tax_invoices ADD COLUMN entity_id INTEGER DEFAULT 1;
ALTER TABLE purchase_orders ADD COLUMN entity_id INTEGER DEFAULT 1;
ALTER TABLE purchase_payments ADD COLUMN entity_id INTEGER DEFAULT 1;
ALTER TABLE cash_receipts ADD COLUMN entity_id INTEGER DEFAULT 1;
ALTER TABLE adjustments ADD COLUMN entity_id INTEGER DEFAULT 1;
ALTER TABLE payroll ADD COLUMN entity_id INTEGER DEFAULT 1;
ALTER TABLE payment_requests ADD COLUMN entity_id INTEGER DEFAULT 1;
ALTER TABLE inventory_transactions ADD COLUMN entity_id INTEGER DEFAULT 1;

-- 카드: 의뢰 법인 (NULL = 자체 생산)
ALTER TABLE cards ADD COLUMN requesting_entity_id INTEGER;

-- 이관 로그에 entity_id
ALTER TABLE migration_logs ADD COLUMN entity_id INTEGER;

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_orders_entity ON orders(entity_id);
CREATE INDEX IF NOT EXISTS idx_payments_entity ON payments(entity_id);
CREATE INDEX IF NOT EXISTS idx_tax_invoices_entity ON tax_invoices(entity_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_entity ON purchase_orders(entity_id);
CREATE INDEX IF NOT EXISTS idx_payroll_entity ON payroll(entity_id);
