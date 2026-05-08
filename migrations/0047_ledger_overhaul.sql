-- 원장 개편: 경리검증 + 이중잔액 + 세금계산서 발행방식 + 미수금 + 할인감액

-- 1. clients: 세금계산서 발행 방식 + 미수금 경고 기준일
ALTER TABLE clients ADD COLUMN invoice_method TEXT DEFAULT 'PER_ORDER';
ALTER TABLE clients ADD COLUMN overdue_alert_days INTEGER DEFAULT 30;

-- 2. orders: 경리 검증 (출고 후 매출 확정)
ALTER TABLE orders ADD COLUMN billing_status TEXT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN billed_at DATETIME DEFAULT NULL;
ALTER TABLE orders ADD COLUMN billed_by INTEGER DEFAULT NULL;
ALTER TABLE orders ADD COLUMN billed_amount INTEGER DEFAULT NULL;

-- 3. adjustments: 할인/감액 테이블
CREATE TABLE IF NOT EXISTS adjustments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  order_id INTEGER,
  type TEXT NOT NULL DEFAULT 'DISCOUNT',
  amount INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_adjustments_client ON adjustments(client_id);
CREATE INDEX IF NOT EXISTS idx_adjustments_order ON adjustments(order_id);
CREATE INDEX IF NOT EXISTS idx_orders_billing_status ON orders(billing_status);
