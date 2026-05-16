-- #64: shipment_items FK (card_id, order_item_id) ON DELETE SET NULL
-- SQLite는 FK 변경을 지원하지 않으므로 테이블 재생성 필요

-- Step 1: 새 테이블 생성 (ON DELETE SET NULL 추가)
CREATE TABLE IF NOT EXISTS shipment_items_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shipment_id INTEGER NOT NULL,
  card_id INTEGER,
  order_item_id INTEGER,
  quantity REAL DEFAULT 1,
  notes TEXT,
  FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE CASCADE,
  FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE SET NULL,
  FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE SET NULL
);

-- Step 2: 데이터 복사
INSERT INTO shipment_items_new (id, shipment_id, card_id, order_item_id, quantity, notes)
  SELECT id, shipment_id, card_id, order_item_id, quantity, notes FROM shipment_items;

-- Step 3: 기존 테이블 삭제 및 교체
DROP TABLE shipment_items;
ALTER TABLE shipment_items_new RENAME TO shipment_items;

-- Step 4: 인덱스 재생성
CREATE INDEX IF NOT EXISTS idx_shipment_items_shipment ON shipment_items(shipment_id);
CREATE INDEX IF NOT EXISTS idx_shipment_items_card_id ON shipment_items(card_id);
CREATE INDEX IF NOT EXISTS idx_shipment_items_order_item_id ON shipment_items(order_item_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_shipment_items_unique_card
  ON shipment_items(shipment_id, card_id)
  WHERE card_id IS NOT NULL;
