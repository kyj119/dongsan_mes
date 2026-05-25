-- #190: 법인카드 카드번호(끝4자리) + 법인 중복 방지
CREATE UNIQUE INDEX IF NOT EXISTS idx_corporate_cards_number_entity
  ON corporate_cards(card_number_last4, entity_id);
