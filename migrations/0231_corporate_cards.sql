-- 법인카드 관리 시스템
-- corporate_cards: 카드 등록
-- card_transactions: 카드 사용 내역
-- expense_categories: 경비 분류 (사용자 관리)

-- 1. 경비 분류
CREATE TABLE IF NOT EXISTS expense_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  icon TEXT DEFAULT 'fa-tag',
  color TEXT DEFAULT '#6b7280',
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  entity_id INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 기본 경비 분류 (법인카드 표준)
INSERT INTO expense_categories (name, icon, color, sort_order) VALUES
  ('복리후생비', 'fa-heart', '#ec4899', 1),
  ('접대비', 'fa-glass-cheers', '#8b5cf6', 2),
  ('여비교통비', 'fa-car', '#3b82f6', 3),
  ('식대', 'fa-utensils', '#f59e0b', 4),
  ('소모품비', 'fa-box', '#6366f1', 5),
  ('사무용품비', 'fa-pen', '#0ea5e9', 6),
  ('유류비', 'fa-gas-pump', '#ef4444', 7),
  ('통신비', 'fa-phone', '#14b8a6', 8),
  ('차량유지비', 'fa-wrench', '#f97316', 9),
  ('광고선전비', 'fa-bullhorn', '#a855f7', 10),
  ('수선비', 'fa-tools', '#64748b', 11),
  ('교육훈련비', 'fa-graduation-cap', '#10b981', 12),
  ('도서인쇄비', 'fa-book', '#78716c', 13),
  ('보험료', 'fa-shield-alt', '#0284c7', 14),
  ('기타', 'fa-ellipsis-h', '#9ca3af', 99);

-- 2. 법인카드 등록
CREATE TABLE IF NOT EXISTS corporate_cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_name TEXT NOT NULL,
  card_company TEXT NOT NULL,
  card_number_last4 TEXT,
  holder_name TEXT,
  monthly_limit REAL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  connected_id TEXT,
  entity_id INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_corporate_cards_entity ON corporate_cards(entity_id);

-- 3. 카드 사용 내역
CREATE TABLE IF NOT EXISTS card_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id INTEGER NOT NULL REFERENCES corporate_cards(id),
  transaction_date TEXT NOT NULL,
  transaction_time TEXT,
  merchant_name TEXT,
  amount REAL NOT NULL DEFAULT 0,
  installments INTEGER DEFAULT 1,
  category_id INTEGER REFERENCES expense_categories(id),
  memo TEXT,
  receipt_data TEXT,
  status TEXT NOT NULL DEFAULT 'UNCLASSIFIED'
    CHECK(status IN ('UNCLASSIFIED','CLASSIFIED','REQUESTED','APPROVED')),
  payment_request_id INTEGER REFERENCES payment_requests(id),
  codef_transaction_id TEXT,
  entity_id INTEGER DEFAULT 1,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(card_id, codef_transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_card_tx_card ON card_transactions(card_id);
CREATE INDEX IF NOT EXISTS idx_card_tx_date ON card_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_card_tx_status ON card_transactions(status);
CREATE INDEX IF NOT EXISTS idx_card_tx_entity ON card_transactions(entity_id);
CREATE INDEX IF NOT EXISTS idx_card_tx_category ON card_transactions(category_id);

-- 4. payment_requests에 card_transaction_id 추가
ALTER TABLE payment_requests ADD COLUMN card_transaction_id INTEGER REFERENCES card_transactions(id);

-- 5. 페이지 권한 등록
INSERT OR IGNORE INTO permission_pages (page_key, page_label, page_section, page_icon, sort_order)
VALUES ('/card-expenses', '법인카드', '재무', 'fa-credit-card', 75);
