-- ============================================================================
-- Migration 0270: 은행 거래 비용 카테고리 매칭 확장
-- bank_transactions에 matched_category_id 추가
-- bank_match_rules에 matched_category_id 추가 (matched_client_id NULL 허용)
-- expense_categories에 은행 거래용 카테고리 seed
-- ============================================================================

-- 1. bank_transactions에 카테고리 매칭 컬럼 추가
ALTER TABLE bank_transactions ADD COLUMN matched_category_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_bank_tx_category ON bank_transactions(matched_category_id);

-- 2. bank_match_rules 테이블 재생성 (matched_client_id NOT NULL → NULL 허용)
CREATE TABLE bank_match_rules_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  counterpart_name TEXT NOT NULL,
  matched_client_id INTEGER,
  matched_category_id INTEGER,
  match_count INTEGER DEFAULT 1,
  last_used_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER,
  entity_id INTEGER DEFAULT 1,
  FOREIGN KEY (matched_client_id) REFERENCES clients(id),
  FOREIGN KEY (matched_category_id) REFERENCES expense_categories(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

INSERT INTO bank_match_rules_new (id, counterpart_name, matched_client_id, matched_category_id, match_count, last_used_at, created_at, created_by, entity_id)
  SELECT id, counterpart_name, matched_client_id, NULL, match_count, last_used_at, created_at, created_by, entity_id
  FROM bank_match_rules;

DROP TABLE bank_match_rules;
ALTER TABLE bank_match_rules_new RENAME TO bank_match_rules;

CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_match_rules_entity_name
  ON bank_match_rules(entity_id, counterpart_name);

-- 3. expense_categories에 은행 거래용 카테고리 seed
INSERT OR IGNORE INTO expense_categories (name, icon, color, sort_order, entity_id) VALUES
  ('법인세', 'fa-landmark', '#dc2626', 20, 1),
  ('급여', 'fa-wallet', '#7c3aed', 21, 1),
  ('임대료', 'fa-building', '#0891b2', 22, 1),
  ('공과금', 'fa-bolt', '#ea580c', 23, 1),
  ('이자비용', 'fa-percentage', '#be185d', 24, 1),
  ('대출상환', 'fa-hand-holding-usd', '#991b1b', 25, 1),
  ('4대보험', 'fa-id-card', '#4338ca', 26, 1),
  ('부가세', 'fa-receipt', '#b91c1c', 27, 1),
  ('수수료', 'fa-exchange-alt', '#6d28d9', 28, 1);
