-- ============================================================================
-- Migration 0262: order_number / card_number UNIQUE 제약을 entity별 복합으로 변경
-- Issue #205: 법인 간 번호 충돌 방지
-- SQLite에서 인라인 UNIQUE는 DROP 불가 → 테이블 재생성 필요
-- ============================================================================

PRAGMA foreign_keys = OFF;

-- ── 1단계: 백업 ──
CREATE TABLE _bak_orders_262 AS SELECT * FROM orders;
CREATE TABLE _bak_cards_262 AS SELECT * FROM cards;

-- ── 2단계: orders 재생성 (order_number UNIQUE 제거 → 복합 UNIQUE 인덱스로 대체) ──
DROP TABLE IF EXISTS orders;

CREATE TABLE orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number TEXT NOT NULL,              -- UNIQUE 제거 (복합 인덱스로 대체)
  client_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  order_year INTEGER,
  order_month INTEGER,
  reception_location TEXT,
  delivery_info TEXT,
  delivery_date DATE,
  order_date DATE DEFAULT CURRENT_DATE,
  total_amount REAL DEFAULT 0,
  vat_amount REAL DEFAULT 0,
  discount_amount REAL DEFAULT 0,
  final_amount REAL DEFAULT 0,
  notes TEXT,
  internal_notes TEXT,
  created_by INTEGER NOT NULL,
  updated_by INTEGER,
  confirmed_at DATETIME,
  confirmed_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  -- 0011
  ai_file_path TEXT,
  ai_analysis_id INTEGER,
  -- 0016
  layout_id INTEGER DEFAULT NULL,
  layout_output_1 TEXT DEFAULT NULL,
  layout_output_2 TEXT DEFAULT NULL,
  -- 0048
  priority TEXT DEFAULT 'NORMAL',
  valid_until TEXT,
  -- 0033
  delivery_method TEXT DEFAULT '배송',
  -- 0037
  delivery_time TEXT DEFAULT NULL,
  -- 0038
  contact_phone TEXT DEFAULT NULL,
  contact_mobile TEXT DEFAULT NULL,
  -- 0039
  shipping_payment TEXT DEFAULT NULL,
  -- 0047
  billing_status TEXT DEFAULT NULL,
  billed_at DATETIME DEFAULT NULL,
  billed_by INTEGER DEFAULT NULL,
  billed_amount INTEGER DEFAULT NULL,
  -- 0101
  external_order_number TEXT,
  -- 0150
  entity_id INTEGER DEFAULT 1,
  -- 0163
  sheet_layout_params TEXT,
  -- 0164
  output_folder TEXT,
  -- 0176 (finishing on order_items, not orders)
  -- 0178
  billable_after TEXT,
  -- 0179
  order_type TEXT NOT NULL DEFAULT 'PRODUCTION',
  -- 0182
  auto_complete_date TEXT,
  -- 0184
  cancel_reason TEXT,
  -- 0189
  receipt_type TEXT,
  -- 0191
  quotation_id INTEGER DEFAULT NULL,
  -- 0209
  credit_status TEXT,
  -- 0227
  has_pending_prices INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
);

-- 데이터 복원 (동일 컬럼 구조)
INSERT INTO orders SELECT * FROM _bak_orders_262;

-- entity별 복합 UNIQUE 인덱스
CREATE UNIQUE INDEX idx_orders_entity_number ON orders(entity_id, order_number);
CREATE INDEX IF NOT EXISTS idx_orders_client_id ON orders(client_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_date ON orders(delivery_date);
CREATE INDEX IF NOT EXISTS idx_orders_priority ON orders(priority);
CREATE INDEX IF NOT EXISTS idx_orders_entity ON orders(entity_id);

-- ── 3단계: cards 재생성 (card_number UNIQUE 제거 → 복합 UNIQUE 인덱스로 대체) ──
DROP TABLE IF EXISTS cards;

CREATE TABLE cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_number TEXT NOT NULL,               -- UNIQUE 제거 (복합 인덱스로 대체)
  order_id INTEGER NOT NULL,
  order_item_id INTEGER,
  status TEXT NOT NULL DEFAULT 'PRINTING',
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
  -- 0024
  thumbnail_url TEXT DEFAULT NULL,
  printed_quantity INTEGER DEFAULT 0,
  -- 0025
  equipment_id TEXT DEFAULT NULL,
  -- 0027
  source_file_path TEXT,
  rip_preset TEXT,
  rip_queued_at DATETIME,
  -- 0041
  shipped_at DATETIME DEFAULT NULL,
  -- 0080
  pp_status TEXT DEFAULT 'N/A',
  pp_completed_at TEXT,
  -- 0129
  rip_file_path TEXT,
  -- 0150
  requesting_entity_id INTEGER,
  -- 0176
  finishing TEXT,
  -- 0212
  estimated_minutes REAL,
  queue_position INTEGER,
  estimated_start_at DATETIME,
  estimated_end_at DATETIME,
  -- 0216
  waste_sqm REAL DEFAULT 0,
  waste_reason TEXT,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (hold_by) REFERENCES users(id) ON DELETE SET NULL
);

-- 데이터 복원
INSERT INTO cards SELECT * FROM _bak_cards_262;

-- entity별 복합 UNIQUE 인덱스 (requesting_entity_id 사용)
CREATE UNIQUE INDEX idx_cards_entity_number ON cards(requesting_entity_id, card_number);
CREATE INDEX IF NOT EXISTS idx_cards_card_number ON cards(card_number);
CREATE INDEX IF NOT EXISTS idx_cards_order_id ON cards(order_id);
CREATE INDEX IF NOT EXISTS idx_cards_status ON cards(status);
CREATE INDEX IF NOT EXISTS idx_cards_category_name ON cards(category_name);
CREATE INDEX IF NOT EXISTS idx_cards_delivery_date ON cards(delivery_date);

-- ── 4단계: 백업 정리 ──
DROP TABLE IF EXISTS _bak_orders_262;
DROP TABLE IF EXISTS _bak_cards_262;

PRAGMA foreign_keys = ON;
