-- 0284_cards_status_check_add_print_pending.sql
-- 발견2 (CRITICAL): 커밋 1cb77e9(2026-06-01)가 카드 초기상태를 'PRINT_PENDING'으로 도입했으나
--   cards.status CHECK는 0022 정의('PRINTING','PRINT_DONE','HOLD')에 머물러 카드 생성이 전부
--   'CHECK constraint failed'로 실패 → PRODUCTION 주문 생성 500. (2026-06-01 04:24 이후 카드 0건)
-- 조치: SQLite는 CHECK 변경에 테이블 재생성 필요 → 동일 스키마 + status CHECK에
--   PRINT_PENDING / RIP_WAITING / SHIPPED 추가하여 재생성. 데이터·인덱스 보존.
-- D1은 FK 미강제(#117)이므로 DROP/RENAME 시 자식 테이블 영향 없음.

CREATE TABLE cards_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_number TEXT UNIQUE NOT NULL,
  order_id INTEGER NOT NULL,
  order_item_id INTEGER,
  status TEXT NOT NULL CHECK(status IN (
    'PRINT_PENDING',
    'RIP_WAITING',
    'PRINTING',
    'PRINT_DONE',
    'HOLD',
    'SHIPPED'
  )) DEFAULT 'PRINTING',
  client_name TEXT,
  item_name TEXT,
  category_name TEXT,
  width REAL,
  height REAL,
  quantity INTEGER DEFAULT 1,
  unit TEXT DEFAULT 'EA',
  rip_filename TEXT,
  post_processing TEXT,
  final_width REAL,
  final_height REAL,
  delivery_date DATE,
  priority INTEGER DEFAULT 0,
  rip_sent_at DATETIME,
  rip_preview_path TEXT,
  rip_job_path TEXT,
  rip_status TEXT,
  hold_reason TEXT,
  hold_at DATETIME,
  hold_by INTEGER,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  thumbnail_url TEXT DEFAULT NULL,
  printed_quantity INTEGER DEFAULT 0,
  equipment_id TEXT DEFAULT NULL,
  source_file_path TEXT,
  rip_preset TEXT,
  rip_queued_at DATETIME,
  shipped_at DATETIME DEFAULT NULL,
  pp_status TEXT DEFAULT 'N/A',
  pp_completed_at TEXT,
  rip_file_path TEXT,
  requesting_entity_id INTEGER,
  finishing TEXT,
  estimated_minutes REAL,
  queue_position INTEGER,
  estimated_start_at DATETIME,
  estimated_end_at DATETIME,
  waste_sqm REAL DEFAULT 0,
  waste_reason TEXT,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE CASCADE,
  FOREIGN KEY (hold_by) REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO cards_new SELECT * FROM cards;

DROP TABLE cards;
ALTER TABLE cards_new RENAME TO cards;

CREATE INDEX idx_cards_card_number ON cards(card_number);
CREATE INDEX idx_cards_order_id ON cards(order_id);
CREATE INDEX idx_cards_status ON cards(status);
CREATE INDEX idx_cards_category_name ON cards(category_name);
CREATE INDEX idx_cards_delivery_date ON cards(delivery_date);
CREATE INDEX idx_cards_priority ON cards(priority DESC);
CREATE INDEX idx_cards_pp_status ON cards(pp_status);
CREATE INDEX idx_cards_requesting_entity_id ON cards(requesting_entity_id);
CREATE INDEX idx_cards_entity_status ON cards(requesting_entity_id, status);
CREATE INDEX idx_cards_entity_number ON cards(requesting_entity_id, card_number);
CREATE UNIQUE INDEX idx_cards_entity_card_number ON cards(requesting_entity_id, card_number);
CREATE INDEX idx_cards_order_item_id ON cards(order_item_id);
