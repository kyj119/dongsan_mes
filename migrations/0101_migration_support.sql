-- 이카운트 → dongsan_mes 데이터 이관 지원
-- Migration: 0101_migration_support

-- 이관 작업 추적 로그
CREATE TABLE IF NOT EXISTS migration_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  migration_type TEXT NOT NULL,       -- 'clients', 'items', 'orders', 'payments', 'tax_invoices', 'opening_balances'
  status TEXT DEFAULT 'PENDING',      -- PENDING, RUNNING, COMPLETED, FAILED
  total_rows INTEGER DEFAULT 0,
  imported_rows INTEGER DEFAULT 0,
  skipped_rows INTEGER DEFAULT 0,
  error_rows INTEGER DEFAULT 0,
  errors_json TEXT,                   -- JSON array of error details
  started_at TEXT,
  completed_at TEXT,
  created_by INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 이카운트 주문번호 보관 (이중 운영 시 매칭용)
ALTER TABLE orders ADD COLUMN external_order_number TEXT;

-- 기초잔액 (이관 시점 미수금 잔액 기준점)
ALTER TABLE clients ADD COLUMN opening_balance REAL DEFAULT 0;
