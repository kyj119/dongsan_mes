-- 0194: shipment_items(shipment_id, card_id) 중복 방지 UNIQUE 인덱스

-- 기존 중복 데이터 정리 (가장 오래된 것만 유지)
DELETE FROM shipment_items WHERE id NOT IN (
  SELECT MIN(id) FROM shipment_items
  WHERE card_id IS NOT NULL
  GROUP BY shipment_id, card_id
) AND card_id IS NOT NULL AND EXISTS (
  SELECT 1 FROM shipment_items si2
  WHERE si2.shipment_id = shipment_items.shipment_id
    AND si2.card_id = shipment_items.card_id
    AND si2.id < shipment_items.id
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_shipment_items_unique_card
  ON shipment_items(shipment_id, card_id)
  WHERE card_id IS NOT NULL;
