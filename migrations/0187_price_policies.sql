-- 가격 정책 마스터
CREATE TABLE IF NOT EXISTS price_policies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  is_default INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 정책 규칙 (카테고리별 할인율 + 품목별 고정가/할인율)
-- 우선순위: item_id+fixed_price > item_id+rate > category+rate > NULL(전체)+rate
CREATE TABLE IF NOT EXISTS price_policy_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  policy_id INTEGER NOT NULL,
  category TEXT,
  item_id INTEGER,
  rate_percent REAL DEFAULT 0,
  fixed_price REAL,
  sort_order INTEGER DEFAULT 0,
  FOREIGN KEY (policy_id) REFERENCES price_policies(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items(id)
);

CREATE INDEX IF NOT EXISTS idx_policy_rules_policy ON price_policy_rules(policy_id);
CREATE INDEX IF NOT EXISTS idx_policy_rules_item ON price_policy_rules(item_id);

-- 거래처에 정책 할당
ALTER TABLE clients ADD COLUMN price_policy_id INTEGER REFERENCES price_policies(id);

-- 법인별 로고
ALTER TABLE entities ADD COLUMN logo_base64 TEXT;

-- 기본 정책 (정가) 생성
INSERT INTO price_policies (name, description, is_default, is_active) VALUES ('정가', '할인 없는 기본 단가', 1, 1);
