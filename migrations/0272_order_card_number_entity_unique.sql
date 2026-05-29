-- 0272: order_number / card_number 복합 UNIQUE 인덱스 (멀티 entity 중복 방지)
-- Issue #273
-- 기존 단일 UNIQUE는 ALTER로 제거 불가 → 복합 인덱스를 병행 추가
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_entity_order_number
  ON orders(entity_id, order_number);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cards_entity_card_number
  ON cards(requesting_entity_id, card_number);
