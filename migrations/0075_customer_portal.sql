-- ============================================================================
-- 고객 포털 시스템
-- ============================================================================

-- client_accounts: 거래처 로그인 계정
CREATE TABLE IF NOT EXISTS client_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  login_id TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  is_active INTEGER DEFAULT 1,
  last_login_at DATETIME,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- portal_access_logs: 접근 이력
CREATE TABLE IF NOT EXISTS portal_access_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_account_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  details TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_account_id) REFERENCES client_accounts(id) ON DELETE CASCADE
);

-- portal_reorder_requests: 재주문 요청
CREATE TABLE IF NOT EXISTS portal_reorder_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_account_id INTEGER NOT NULL,
  client_id INTEGER NOT NULL,
  reference_order_id INTEGER,
  description TEXT,
  file_urls TEXT,                           -- JSON array
  status TEXT DEFAULT 'PENDING'
    CHECK(status IN ('PENDING','CONFIRMED','REJECTED')),
  handled_by INTEGER,
  handled_at DATETIME,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_account_id) REFERENCES client_accounts(id),
  FOREIGN KEY (client_id) REFERENCES clients(id),
  FOREIGN KEY (reference_order_id) REFERENCES orders(id),
  FOREIGN KEY (handled_by) REFERENCES users(id)
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_ca_client ON client_accounts(client_id);
CREATE INDEX IF NOT EXISTS idx_ca_login ON client_accounts(login_id);
CREATE INDEX IF NOT EXISTS idx_pal_account ON portal_access_logs(client_account_id);
CREATE INDEX IF NOT EXISTS idx_prr_client ON portal_reorder_requests(client_id);
CREATE INDEX IF NOT EXISTS idx_prr_status ON portal_reorder_requests(status);
