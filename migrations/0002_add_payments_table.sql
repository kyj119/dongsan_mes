-- ============================================================================
-- ERP+MES System - Add Payments Table
-- Migration: 0002_add_payments_table.sql
-- Created: 2026-02-12
-- ============================================================================

-- Payments table (입금 관리)
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  payment_date DATE NOT NULL,                 -- 입금일
  amount REAL NOT NULL,                       -- 입금액
  payment_method TEXT,                        -- 입금 방법 (현금, 계좌이체, 카드 등)
  reference_number TEXT,                      -- 참조번호 (계좌이체 확인번호 등)
  notes TEXT,                                 -- 비고
  created_by INTEGER,                         -- 등록자
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_payments_client_id ON payments(client_id);
CREATE INDEX IF NOT EXISTS idx_payments_payment_date ON payments(payment_date);

-- ============================================================================
-- Add balance field to clients table
-- ============================================================================
-- Note: SQLite doesn't support ADD COLUMN IF NOT EXISTS in old versions
-- The balance field already exists in the original schema, so this is a note only
-- If needed to add: ALTER TABLE clients ADD COLUMN balance REAL DEFAULT 0;
