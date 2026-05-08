-- ============================================================================
-- Migration 0052: 출고/배송 추적 시스템
-- ============================================================================

-- 출고/배송 테이블 (1주문 N배송 가능 — 분할배송, 거래처 묶음 대응)
CREATE TABLE IF NOT EXISTS shipments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shipment_number TEXT UNIQUE NOT NULL,       -- 출고번호 (SHP-YYYYMMDD-NNN)
  order_id INTEGER NOT NULL,                   -- 주문 ID
  status TEXT NOT NULL DEFAULT 'PREPARING'
    CHECK(status IN ('PREPARING','SHIPPED','IN_TRANSIT','DELIVERED','CANCELLED')),

  -- 배송 정보
  delivery_type TEXT NOT NULL DEFAULT 'DELIVERY'
    CHECK(delivery_type IN ('DELIVERY','PICKUP','FREIGHT','QUICK')),
  courier_name TEXT,                           -- 택배사/운송사
  tracking_number TEXT,                        -- 송장번호

  -- 일시
  shipped_at DATETIME,                         -- 출고일시
  delivered_at DATETIME,                       -- 배송완료일시

  -- 수신자
  receiver_name TEXT,                          -- 수신자명
  receiver_phone TEXT,                         -- 수신자 전화
  receiver_address TEXT,                       -- 배송지 주소

  -- 기타
  notes TEXT,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- 출고 품목 (어떤 카드/품목이 출고되었는지)
CREATE TABLE IF NOT EXISTS shipment_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shipment_id INTEGER NOT NULL,
  card_id INTEGER,                             -- 출고된 카드 (NULL이면 주문 단위 출고)
  order_item_id INTEGER,                       -- 주문 품목 ID
  quantity REAL DEFAULT 1,                     -- 출고 수량
  notes TEXT,
  FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE CASCADE,
  FOREIGN KEY (card_id) REFERENCES cards(id),
  FOREIGN KEY (order_item_id) REFERENCES order_items(id)
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_shipments_order ON shipments(order_id);
CREATE INDEX IF NOT EXISTS idx_shipments_status ON shipments(status);
CREATE INDEX IF NOT EXISTS idx_shipments_number ON shipments(shipment_number);
CREATE INDEX IF NOT EXISTS idx_shipments_shipped ON shipments(shipped_at);
CREATE INDEX IF NOT EXISTS idx_shipment_items_shipment ON shipment_items(shipment_id);
