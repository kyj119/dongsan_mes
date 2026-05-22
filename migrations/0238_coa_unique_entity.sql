-- #156: chart_of_accounts UNIQUE(code) → UNIQUE(code, entity_id)
-- SQLite는 ALTER TABLE로 UNIQUE 변경 불가 → 테이블 재생성

CREATE TABLE IF NOT EXISTS chart_of_accounts_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK(account_type IN ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE')),
  parent_id INTEGER REFERENCES chart_of_accounts_new(id),
  is_active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  entity_id INTEGER NOT NULL DEFAULT 1,
  UNIQUE(code, entity_id)
);

INSERT INTO chart_of_accounts_new (id, code, name, account_type, parent_id, is_active, sort_order, created_at, entity_id)
  SELECT id, code, name, account_type, parent_id, is_active, sort_order, created_at, COALESCE(entity_id, 1)
  FROM chart_of_accounts;

DROP TABLE chart_of_accounts;
ALTER TABLE chart_of_accounts_new RENAME TO chart_of_accounts;

CREATE INDEX IF NOT EXISTS idx_coa_entity ON chart_of_accounts(entity_id);
CREATE INDEX IF NOT EXISTS idx_coa_parent ON chart_of_accounts(parent_id);
