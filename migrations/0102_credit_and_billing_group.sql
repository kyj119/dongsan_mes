-- 여신관리 + 사업자 분리(billing group) 지원
-- Migration: 0102_credit_and_billing_group

-- 1. 여신관리 필드 추가
ALTER TABLE clients ADD COLUMN credit_limit REAL DEFAULT 0;  -- 여신한도 (0 = 무제한)
ALTER TABLE clients ADD COLUMN credit_hold INTEGER DEFAULT 0; -- 주문 차단 (1 = 차단)

-- 2. 사업자 분리: billing_groups 테이블
CREATE TABLE IF NOT EXISTS billing_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_name TEXT NOT NULL,           -- 그룹명 (예: "A광고 그룹")
  notes TEXT,                         -- 메모
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 3. 거래처에 billing_group FK 추가
ALTER TABLE clients ADD COLUMN billing_group_id INTEGER REFERENCES billing_groups(id);

-- 4. 인덱스
CREATE INDEX IF NOT EXISTS idx_clients_billing_group ON clients(billing_group_id);
CREATE INDEX IF NOT EXISTS idx_clients_credit_hold ON clients(credit_hold);
