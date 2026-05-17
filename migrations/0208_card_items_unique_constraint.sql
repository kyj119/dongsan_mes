-- 0208: card_items(card_id, order_item_id) UNIQUE 제약 추가
-- 같은 카드에 동일 order_item이 중복 등록되는 것을 DB 수준에서 방지.
-- 카드 생성 시 order_items를 카테고리별로 그룹핑하여 1회만 INSERT하므로 기존 중복 없음.

-- 혹시 모를 중복 제거 (min(id) 기준 보존)
DELETE FROM card_items
WHERE id NOT IN (
  SELECT MIN(id)
  FROM card_items
  GROUP BY card_id, order_item_id
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_card_items_unique
  ON card_items(card_id, order_item_id);
