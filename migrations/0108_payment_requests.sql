-- 지출결의서 + 계좌이체 연동
-- Migration: 0105_payment_requests

CREATE TABLE IF NOT EXISTS payment_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_number TEXT NOT NULL UNIQUE,   -- PR-YYYYMMDD-NNN
  request_date TEXT NOT NULL,
  request_type TEXT NOT NULL,            -- 'PURCHASE'(매입) / 'EXPENSE'(경비) / 'OTHER'
  recipient_client_id INTEGER,           -- 지급 대상 거래처
  recipient_name TEXT NOT NULL,          -- 지급처명
  recipient_account TEXT,                -- 계좌번호
  recipient_bank TEXT,                   -- 은행
  amount REAL NOT NULL,
  description TEXT NOT NULL,             -- 지급 사유
  related_po_id INTEGER,                 -- 연결 발주서
  status TEXT DEFAULT 'DRAFT',           -- DRAFT / PENDING / APPROVED / PAID / REJECTED / CANCELLED
  approved_by INTEGER,
  approved_at TEXT,
  paid_at TEXT,
  paid_by INTEGER,
  bank_transaction_id INTEGER,
  attachment_url TEXT,
  notes TEXT,
  reject_reason TEXT,
  created_by INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payment_requests_status ON payment_requests(status);
CREATE INDEX IF NOT EXISTS idx_payment_requests_date ON payment_requests(request_date);
CREATE INDEX IF NOT EXISTS idx_payment_requests_po ON payment_requests(related_po_id);
