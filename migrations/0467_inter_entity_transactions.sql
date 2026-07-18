-- 0467: 법인간 거래 (inter-entity transactions) — 회계허브 탭
-- 대납·자금대여·상환·내부거래대금·계산서이전 기록 + 법인간 채권채무 잔액 파생.
-- 방향 규약: 돈(가치)이 from → to 로 흘렀다. 잔액 = Σ(A→B) − Σ(B→A) (affects_balance=1만).
-- FK 미사용(D1 FK 컬럼 제거 불가 함정 회피). spec: docs/superpowers/specs/2026-07-18-inter-entity-transactions.md

CREATE TABLE IF NOT EXISTS inter_entity_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_date TEXT NOT NULL,
  from_entity_id INTEGER NOT NULL,
  to_entity_id INTEGER NOT NULL,
  transaction_type TEXT NOT NULL DEFAULT 'SUBROGATION'
    CHECK (transaction_type IN ('SUBROGATION','LOAN','REPAYMENT','INTERNAL_TRADE','INVOICE_TRANSFER','OTHER')),
  amount REAL NOT NULL,
  affects_balance INTEGER NOT NULL DEFAULT 1,
  client_id INTEGER,
  description TEXT,
  from_bank_transaction_id INTEGER,
  to_bank_transaction_id INTEGER,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_iet_from_entity ON inter_entity_transactions(from_entity_id);
CREATE INDEX IF NOT EXISTS idx_iet_to_entity ON inter_entity_transactions(to_entity_id);
CREATE INDEX IF NOT EXISTS idx_iet_date ON inter_entity_transactions(transaction_date);
