-- ============================================================================
-- Migration 0043: 은행 거래내역 연동 (bank_accounts, bank_transactions)
-- ============================================================================

-- bank_accounts: 연결된 은행 계좌
CREATE TABLE IF NOT EXISTS bank_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bank_code TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  account_holder TEXT,
  connected_id TEXT,
  is_active INTEGER DEFAULT 1,
  last_synced_at DATETIME,
  last_synced_date TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- bank_transactions: 조회된 거래내역
CREATE TABLE IF NOT EXISTS bank_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bank_account_id INTEGER NOT NULL,
  transaction_date TEXT NOT NULL,
  transaction_time TEXT,
  transaction_type TEXT NOT NULL CHECK(transaction_type IN ('DEPOSIT','WITHDRAWAL')),
  amount REAL NOT NULL,
  balance_after REAL,
  counterpart_name TEXT,
  description TEXT,
  codef_transaction_id TEXT,
  match_status TEXT DEFAULT 'UNMATCHED' CHECK(match_status IN ('UNMATCHED','SUGGESTED','CONFIRMED','APPLIED','IGNORED')),
  matched_client_id INTEGER,
  matched_payment_id INTEGER,
  matched_by INTEGER,
  matched_at DATETIME,
  match_confidence REAL,
  match_reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id),
  FOREIGN KEY (matched_client_id) REFERENCES clients(id)
);

CREATE INDEX IF NOT EXISTS idx_bt_bank_account ON bank_transactions(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_bt_date ON bank_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_bt_status ON bank_transactions(match_status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bt_codef_id ON bank_transactions(bank_account_id, codef_transaction_id);
