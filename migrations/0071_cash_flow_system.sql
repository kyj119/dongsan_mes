-- ============================================================================
-- 캐시플로 관리 시스템 (고정비 / 대출 / 상환 스케줄)
-- ============================================================================

-- fixed_expenses: 반복 고정비 (임대료, 보험, 공과금, 리스 등)
CREATE TABLE IF NOT EXISTS fixed_expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('RENT','INSURANCE','UTILITY','LEASE','SALARY','TAX','OTHER')),
  amount REAL NOT NULL DEFAULT 0,
  frequency TEXT NOT NULL DEFAULT 'MONTHLY' CHECK(frequency IN ('MONTHLY','QUARTERLY','YEARLY')),
  payment_day INTEGER DEFAULT 1,
  start_date TEXT NOT NULL,
  end_date TEXT,
  counterpart_name TEXT,
  notes TEXT,
  is_active INTEGER DEFAULT 1,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- loans: 대출 계좌
CREATE TABLE IF NOT EXISTS loans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  loan_number TEXT,
  creditor TEXT NOT NULL,
  description TEXT,
  original_amount REAL NOT NULL,
  current_balance REAL NOT NULL,
  rate_type TEXT DEFAULT 'FIXED' CHECK(rate_type IN ('FIXED','VARIABLE')),
  current_rate REAL DEFAULT 0,
  repayment_type TEXT DEFAULT 'EQUAL_INSTALLMENT'
    CHECK(repayment_type IN ('EQUAL_PRINCIPAL','EQUAL_INSTALLMENT','BULLET','INTEREST_ONLY')),
  start_date TEXT NOT NULL,
  maturity_date TEXT NOT NULL,
  monthly_payment_day INTEGER DEFAULT 1,
  monthly_payment_amount REAL DEFAULT 0,
  notes TEXT,
  is_active INTEGER DEFAULT 1,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- loan_rate_history: 금리 변동 이력
CREATE TABLE IF NOT EXISTS loan_rate_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  loan_id INTEGER NOT NULL,
  effective_date TEXT NOT NULL,
  rate REAL NOT NULL,
  changed_by INTEGER,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by) REFERENCES users(id)
);

-- loan_payments: 상환 스케줄 + 실제 상환 기록
CREATE TABLE IF NOT EXISTS loan_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  loan_id INTEGER NOT NULL,
  payment_number INTEGER NOT NULL,
  scheduled_date TEXT NOT NULL,
  principal_amount REAL DEFAULT 0,
  interest_amount REAL DEFAULT 0,
  total_amount REAL DEFAULT 0,
  actual_paid_amount REAL,
  actual_paid_date TEXT,
  status TEXT DEFAULT 'SCHEDULED' CHECK(status IN ('SCHEDULED','PAID','OVERDUE','PARTIAL')),
  bank_transaction_id INTEGER,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE,
  FOREIGN KEY (bank_transaction_id) REFERENCES bank_transactions(id)
);

CREATE INDEX IF NOT EXISTS idx_fe_category ON fixed_expenses(category);
CREATE INDEX IF NOT EXISTS idx_fe_active ON fixed_expenses(is_active);
CREATE INDEX IF NOT EXISTS idx_loans_active ON loans(is_active);
CREATE INDEX IF NOT EXISTS idx_lp_loan ON loan_payments(loan_id);
CREATE INDEX IF NOT EXISTS idx_lp_date ON loan_payments(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_lp_status ON loan_payments(status);
CREATE INDEX IF NOT EXISTS idx_lrh_loan ON loan_rate_history(loan_id);
