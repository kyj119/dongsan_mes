-- 법인카드 기능 확장 (프로덕션에 이미 적용된 컬럼은 no-op 처리)
-- payment_day, assigned_user_id, receipt_image_url 등은 이전 세션에서 수동 적용됨

-- corporate_cards 컬럼 (이미 존재)
-- ALTER TABLE corporate_cards ADD COLUMN payment_day INTEGER DEFAULT 15;
-- ALTER TABLE corporate_cards ADD COLUMN assigned_user_id INTEGER REFERENCES users(id);

-- card_transactions 컬럼 (이미 존재)
-- ALTER TABLE card_transactions ADD COLUMN receipt_image_url TEXT;
-- ALTER TABLE card_transactions ADD COLUMN approval_number TEXT;
-- ALTER TABLE card_transactions ADD COLUMN supply_amount REAL DEFAULT 0;
-- ALTER TABLE card_transactions ADD COLUMN tax_amount REAL DEFAULT 0;
-- ALTER TABLE card_transactions ADD COLUMN approval_type TEXT DEFAULT 'APPROVED';
-- ALTER TABLE card_transactions ADD COLUMN matched_bank_tx_id INTEGER REFERENCES bank_transactions(id);

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
