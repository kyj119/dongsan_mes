-- ============================================================================
-- Migration 0239: 카드사 수수료율 관리 테이블
-- 통장 입금 내역에서 카드사 입금 건의 수수료를 역산하기 위한 설정
-- ============================================================================

CREATE TABLE IF NOT EXISTS card_fee_rates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_company TEXT NOT NULL,
  fee_rate REAL NOT NULL,
  keywords TEXT,
  entity_id INTEGER DEFAULT 1,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_card_fee_rates_company_entity
  ON card_fee_rates(card_company, entity_id);

-- 기본 카드사 수수료율 (일반가맹점 기준, 영세/중소 가맹점은 더 낮음)
INSERT OR IGNORE INTO card_fee_rates (card_company, fee_rate, keywords) VALUES
  ('BC카드', 2.2, 'BC,비씨'),
  ('KB국민카드', 2.2, '국민,KB'),
  ('삼성카드', 2.2, '삼성'),
  ('신한카드', 2.2, '신한'),
  ('현대카드', 2.2, '현대'),
  ('롯데카드', 2.2, '롯데'),
  ('하나카드', 2.2, '하나'),
  ('우리카드', 2.2, '우리'),
  ('NH농협카드', 2.2, '농협,NH'),
  ('씨티카드', 2.2, '씨티,CITI');
