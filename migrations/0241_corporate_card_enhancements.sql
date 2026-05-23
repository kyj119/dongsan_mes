-- 법인카드 기능 확장
-- payment_day: 카드 결제일 (매월 N일)
-- receipt_image_url: 영수증 이미지 R2 URL
-- approval_number: 승인번호 (바로빌)
-- supply_amount, tax_amount: 공급가/부가세

ALTER TABLE corporate_cards ADD COLUMN payment_day INTEGER DEFAULT 15;
ALTER TABLE corporate_cards ADD COLUMN assigned_user_id INTEGER REFERENCES users(id);

ALTER TABLE card_transactions ADD COLUMN receipt_image_url TEXT;
ALTER TABLE card_transactions ADD COLUMN approval_number TEXT;
ALTER TABLE card_transactions ADD COLUMN supply_amount REAL DEFAULT 0;
ALTER TABLE card_transactions ADD COLUMN tax_amount REAL DEFAULT 0;
ALTER TABLE card_transactions ADD COLUMN approval_type TEXT DEFAULT 'APPROVED';
ALTER TABLE card_transactions ADD COLUMN matched_bank_tx_id INTEGER REFERENCES bank_transactions(id);

-- 가맹점 → 경비 카테고리 자동 분류 규칙
CREATE TABLE IF NOT EXISTS expense_auto_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  keyword TEXT NOT NULL,
  category_id INTEGER NOT NULL REFERENCES expense_categories(id),
  match_count INTEGER DEFAULT 0,
  entity_id INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(keyword, entity_id)
);
