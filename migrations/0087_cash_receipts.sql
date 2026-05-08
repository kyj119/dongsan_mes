-- 현금영수증 테이블
CREATE TABLE IF NOT EXISTS cash_receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_number TEXT NOT NULL UNIQUE,           -- 관리번호 (CR-YYYY-NNNN)
  receipt_type TEXT NOT NULL DEFAULT 'EXPENSE',  -- EXPENSE(지출증빙) / INCOME(소득공제)
  trade_type TEXT NOT NULL DEFAULT 'CONSUMER',   -- CONSUMER(개인) / BUSINESS(사업자)
  identity_type TEXT NOT NULL DEFAULT 'PHONE',   -- PHONE / CARD / BRN / RESIDENT
  identity_number TEXT NOT NULL,                 -- 식별번호 (휴대폰/카드/사업자번호/주민번호)

  client_id INTEGER REFERENCES clients(id),
  order_id INTEGER REFERENCES orders(id),

  trade_date TEXT NOT NULL,                      -- 거래일 YYYY-MM-DD
  supply_amount INTEGER NOT NULL DEFAULT 0,      -- 공급가액
  tax_amount INTEGER NOT NULL DEFAULT 0,         -- 부가세
  total_amount INTEGER NOT NULL DEFAULT 0,       -- 합계금액
  service_amount INTEGER NOT NULL DEFAULT 0,     -- 봉사료
  item_name TEXT,                                -- 품목명

  status TEXT NOT NULL DEFAULT 'DRAFT',          -- DRAFT, ISSUED, FAILED, CANCELLED, NTS_SUCCESS, NTS_FAILED
  provider_name TEXT,                            -- 'popbill'
  provider_response TEXT,                        -- JSON raw response
  provider_receipt_id TEXT,                      -- 팝빌 반환 ID
  nts_approval_number TEXT,                      -- 국세청 승인번호
  nts_result_code TEXT,
  nts_result_message TEXT,

  issued_at TEXT,
  issued_by INTEGER REFERENCES users(id),
  cancelled_at TEXT,
  cancel_reason TEXT,
  notes TEXT,

  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cash_receipts_status ON cash_receipts(status);
CREATE INDEX IF NOT EXISTS idx_cash_receipts_client ON cash_receipts(client_id);
CREATE INDEX IF NOT EXISTS idx_cash_receipts_trade_date ON cash_receipts(trade_date);
CREATE INDEX IF NOT EXISTS idx_cash_receipts_receipt_number ON cash_receipts(receipt_number);
