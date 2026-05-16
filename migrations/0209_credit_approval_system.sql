-- #69: 여신한도 초과 시 결재 연동
-- 주문에 여신 승인 상태 추가
ALTER TABLE orders ADD COLUMN credit_status TEXT;
-- NULL = 여신 체크 불필요/통과, 'PENDING' = 승인 대기, 'APPROVED' = 승인됨, 'REJECTED' = 거부됨

-- 여신 초과 승인 이력
CREATE TABLE IF NOT EXISTS credit_overrides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  client_id INTEGER NOT NULL REFERENCES clients(id),
  credit_limit REAL NOT NULL,
  balance_at_time REAL NOT NULL,
  order_amount REAL NOT NULL,
  approval_request_id INTEGER REFERENCES approval_requests(id),
  status TEXT NOT NULL DEFAULT 'PENDING',  -- PENDING | APPROVED | REJECTED
  approved_by INTEGER REFERENCES users(id),
  approved_at DATETIME,
  reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_credit_overrides_order ON credit_overrides(order_id);
CREATE INDEX IF NOT EXISTS idx_credit_overrides_client ON credit_overrides(client_id);
