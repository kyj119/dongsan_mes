-- ============================================================================
-- Migration: 0048_fix_quotation_check.sql
-- orders 테이블 CHECK 제약에 QUOTATION 상태 추가
-- SQLite에서 CHECK 변경은 테이블 재생성 필요
-- ============================================================================

PRAGMA foreign_keys = OFF;

-- 1단계: 의존 테이블 백업
CREATE TABLE _bak_orders AS SELECT * FROM orders;
CREATE TABLE _bak_order_items AS SELECT * FROM order_items;
CREATE TABLE _bak_cards AS SELECT * FROM cards;
CREATE TABLE _bak_card_items AS SELECT * FROM card_items;

-- 2단계: 의존 테이블 역순 삭제
DROP TABLE IF EXISTS card_items;
DROP TABLE IF EXISTS cards;
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;

-- 3단계: orders 재생성 (QUOTATION 포함 CHECK)
CREATE TABLE orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number TEXT UNIQUE NOT NULL,
  client_id INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN (
    'QUOTATION',
    'DRAFT',
    'CONFIRMED',
    'PRINTING',
    'PRINT_DONE',
    'SHIPPED',
    'HOLD',
    'CANCELLED'
  )) DEFAULT 'DRAFT',
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
  ai_file_path TEXT,
  ai_analysis_id INTEGER,
  layout_id INTEGER DEFAULT NULL,
  layout_output_1 TEXT DEFAULT NULL,
  layout_output_2 TEXT DEFAULT NULL,
  priority TEXT DEFAULT 'NORMAL' CHECK(priority IN ('NORMAL', 'URGENT')),
  delivery_method TEXT DEFAULT '배송',
  delivery_time TEXT DEFAULT NULL,
  contact_phone TEXT DEFAULT NULL,
  contact_mobile TEXT DEFAULT NULL,
  shipping_payment TEXT DEFAULT NULL,
  billing_status TEXT DEFAULT NULL,
  billed_at DATETIME DEFAULT NULL,
  billed_by INTEGER DEFAULT NULL,
  billed_amount INTEGER DEFAULT NULL,
  valid_until TEXT,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (confirmed_by) REFERENCES users(id) ON DELETE RESTRICT
);

-- order_items 재생성
CREATE TABLE order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  item_id INTEGER,
  item_name TEXT NOT NULL,
  category_name TEXT,
  width REAL,
  height REAL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit TEXT DEFAULT 'EA',
  unit_price REAL DEFAULT 0,
  amount REAL DEFAULT 0,
  vat_included INTEGER DEFAULT 1,
  post_processing TEXT,
  content TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ai_group_index INTEGER DEFAULT NULL,
  scale_factor REAL DEFAULT 1,
  ai_analysis_id INTEGER DEFAULT NULL,
  parent_item_id INTEGER DEFAULT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE RESTRICT
);

-- cards 재생성
CREATE TABLE cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_number TEXT UNIQUE NOT NULL,
  order_id INTEGER NOT NULL,
  order_item_id INTEGER,
  status TEXT NOT NULL CHECK(status IN (
    'PRINTING',
    'PRINT_DONE',
    'HOLD'
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
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE CASCADE,
  FOREIGN KEY (hold_by) REFERENCES users(id) ON DELETE SET NULL
);

-- card_items 재생성
CREATE TABLE card_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id INTEGER NOT NULL,
  order_item_id INTEGER NOT NULL,
  quantity INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE,
  FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE CASCADE
);

-- 4단계: 데이터 복원
INSERT INTO orders SELECT *, NULL as valid_until FROM _bak_orders;
INSERT INTO order_items SELECT * FROM _bak_order_items;
INSERT INTO cards SELECT * FROM _bak_cards;
INSERT INTO card_items SELECT * FROM _bak_card_items;

-- 5단계: 인덱스 재생성
CREATE INDEX IF NOT EXISTS idx_orders_client_id ON orders(client_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_date ON orders(delivery_date);
CREATE INDEX IF NOT EXISTS idx_orders_priority ON orders(priority);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_item ON order_items(item_id);

CREATE INDEX IF NOT EXISTS idx_cards_card_number ON cards(card_number);
CREATE INDEX IF NOT EXISTS idx_cards_order_id ON cards(order_id);
CREATE INDEX IF NOT EXISTS idx_cards_status ON cards(status);
CREATE INDEX IF NOT EXISTS idx_cards_category_name ON cards(category_name);
CREATE INDEX IF NOT EXISTS idx_cards_delivery_date ON cards(delivery_date);
CREATE INDEX IF NOT EXISTS idx_cards_priority ON cards(priority DESC);

CREATE INDEX IF NOT EXISTS idx_card_items_card ON card_items(card_id);
CREATE INDEX IF NOT EXISTS idx_card_items_order_item ON card_items(order_item_id);

-- 6단계: 백업 삭제
DROP TABLE _bak_card_items;
DROP TABLE _bak_cards;
DROP TABLE _bak_order_items;
DROP TABLE _bak_orders;

PRAGMA foreign_keys = ON;
