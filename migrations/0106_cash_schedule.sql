-- 자금계획 캘린더 — 입출금 예정 추적
-- Migration: 0103_cash_schedule

-- 1. 거래처에 결제조건 추가
ALTER TABLE clients ADD COLUMN payment_terms_days INTEGER DEFAULT 30;
ALTER TABLE clients ADD COLUMN payment_method TEXT;

-- 2. 자금 예정 테이블
CREATE TABLE IF NOT EXISTS cash_schedule (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  schedule_date TEXT NOT NULL,           -- 예정일 (YYYY-MM-DD)
  flow_type TEXT NOT NULL,               -- 'IN'(입금예정) / 'OUT'(출금예정)
  source_type TEXT NOT NULL,             -- 'ORDER' / 'PURCHASE' / 'FIXED' / 'TAX' / 'PAYROLL' / 'LOAN' / 'OTHER'
  source_id INTEGER,                     -- 참조 ID (order_id 등)
  client_id INTEGER,                     -- 거래처 (해당 시)
  amount REAL NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'PENDING',         -- PENDING / PARTIAL / DONE / OVERDUE / CANCELLED
  actual_date TEXT,                      -- 실제 입출금일
  actual_amount REAL,                    -- 실제 금액
  bank_transaction_id INTEGER,           -- 은행 거래내역 매칭 시
  notes TEXT,
  created_by INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cash_schedule_date ON cash_schedule(schedule_date);
CREATE INDEX IF NOT EXISTS idx_cash_schedule_status ON cash_schedule(status);
CREATE INDEX IF NOT EXISTS idx_cash_schedule_source ON cash_schedule(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_cash_schedule_flow ON cash_schedule(flow_type, schedule_date);
