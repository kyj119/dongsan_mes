-- ============================================================================
-- Migration: 0022_order_status_update.sql
-- 주문 상태 간소화: 7개로 통일
-- DRAFT, CONFIRMED, PRINTING, PRINT_DONE, SHIPPED, HOLD, CANCELLED
-- 레거시 매핑: PRODUCTION/RIP_SENT/PRINT_PENDING → PRINTING, CLOSED → SHIPPED
-- ============================================================================
-- ⚠ CASCADE 방지: 모든 의존 테이블을 먼저 백업한 후 역순 삭제 → 재생성 → 복원
-- ============================================================================

PRAGMA foreign_keys = OFF;

-- ══════════════════════════════════════════════════════════════════════════════
-- 1단계: 모든 관련 테이블 백업 (삭제 전에 전부 백업)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE _bak_orders AS SELECT * FROM orders;
CREATE TABLE _bak_order_items AS SELECT * FROM order_items;
CREATE TABLE _bak_cards AS SELECT * FROM cards;
CREATE TABLE _bak_card_items AS SELECT * FROM card_items;

-- ══════════════════════════════════════════════════════════════════════════════
-- 2단계: 의존 테이블부터 역순 삭제
-- ══════════════════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS card_items;
DROP TABLE IF EXISTS cards;
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;

-- ══════════════════════════════════════════════════════════════════════════════
-- 3단계: 테이블 재생성 (부모→자식 순서)
-- ══════════════════════════════════════════════════════════════════════════════

-- ── orders (7-status CHECK) ──
CREATE TABLE orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number TEXT UNIQUE NOT NULL,
  client_id INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN (
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
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (confirmed_by) REFERENCES users(id) ON DELETE RESTRICT
);

-- ── order_items (원본 스키마 + ALTER TABLE 컬럼 통합) ──
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

-- ── cards (3-status CHECK, DEFAULT 'PRINTING') ──
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
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE CASCADE,
  FOREIGN KEY (hold_by) REFERENCES users(id) ON DELETE SET NULL
);

-- ── card_items (원본 스키마 그대로) ──
CREATE TABLE card_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id INTEGER NOT NULL,
  order_item_id INTEGER NOT NULL,
  quantity INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE,
  FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE CASCADE
);

-- ══════════════════════════════════════════════════════════════════════════════
-- 4단계: 데이터 복원 (레거시 상태 변환 포함)
-- ══════════════════════════════════════════════════════════════════════════════

-- orders 복원 (레거시 상태 매핑 + priority 기본값 'NORMAL')
INSERT INTO orders (
  id, order_number, client_id, status,
  order_year, order_month, reception_location, delivery_info,
  delivery_date, order_date,
  total_amount, vat_amount, discount_amount, final_amount,
  notes, internal_notes,
  created_by, updated_by, confirmed_at, confirmed_by,
  created_at, updated_at,
  ai_file_path, ai_analysis_id, layout_id, layout_output_1, layout_output_2,
  priority
)
SELECT
  id, order_number, client_id,
  CASE
    WHEN status = 'PRODUCTION'    THEN 'PRINTING'
    WHEN status = 'RIP_SENT'      THEN 'PRINTING'
    WHEN status = 'PRINT_PENDING' THEN 'PRINTING'
    WHEN status = 'CLOSED'        THEN 'SHIPPED'
    ELSE status
  END,
  order_year, order_month, reception_location, delivery_info,
  delivery_date, order_date,
  total_amount, vat_amount, discount_amount, final_amount,
  notes, internal_notes,
  created_by, updated_by, confirmed_at, confirmed_by,
  created_at, updated_at,
  ai_file_path, ai_analysis_id, layout_id, layout_output_1, layout_output_2,
  'NORMAL'
FROM _bak_orders;

-- order_items 복원 (그대로)
INSERT INTO order_items SELECT * FROM _bak_order_items;

-- cards 복원 (레거시 상태 매핑)
INSERT INTO cards SELECT
  id, card_number, order_id, order_item_id,
  CASE
    WHEN status = 'PRINT_PENDING' THEN 'PRINTING'
    WHEN status = 'IN_PROGRESS'   THEN 'PRINTING'
    WHEN status = 'PENDING'       THEN 'PRINTING'
    WHEN status = 'ON_HOLD'       THEN 'HOLD'
    ELSE status
  END,
  client_name, item_name, category_name,
  width, height, quantity, unit,
  rip_filename, post_processing, final_width, final_height,
  delivery_date, priority,
  rip_sent_at, rip_preview_path, rip_job_path, rip_status,
  hold_reason, hold_at, hold_by,
  notes,
  created_at, updated_at
FROM _bak_cards;

-- card_items 복원 (그대로)
INSERT INTO card_items SELECT * FROM _bak_card_items;

-- ══════════════════════════════════════════════════════════════════════════════
-- 5단계: 인덱스 재생성
-- ══════════════════════════════════════════════════════════════════════════════

-- orders 인덱스
CREATE INDEX IF NOT EXISTS idx_orders_client_id ON orders(client_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_date ON orders(delivery_date);
CREATE INDEX IF NOT EXISTS idx_orders_priority ON orders(priority);

-- order_items 인덱스
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_item ON order_items(item_id);

-- cards 인덱스
CREATE INDEX IF NOT EXISTS idx_cards_card_number ON cards(card_number);
CREATE INDEX IF NOT EXISTS idx_cards_order_id ON cards(order_id);
CREATE INDEX IF NOT EXISTS idx_cards_status ON cards(status);
CREATE INDEX IF NOT EXISTS idx_cards_category_name ON cards(category_name);
CREATE INDEX IF NOT EXISTS idx_cards_delivery_date ON cards(delivery_date);
CREATE INDEX IF NOT EXISTS idx_cards_priority ON cards(priority DESC);

-- card_items 인덱스
CREATE INDEX IF NOT EXISTS idx_card_items_card ON card_items(card_id);
CREATE INDEX IF NOT EXISTS idx_card_items_order_item ON card_items(order_item_id);

-- ══════════════════════════════════════════════════════════════════════════════
-- 6단계: 백업 테이블 삭제
-- ══════════════════════════════════════════════════════════════════════════════

DROP TABLE _bak_card_items;
DROP TABLE _bak_cards;
DROP TABLE _bak_order_items;
DROP TABLE _bak_orders;

-- ══════════════════════════════════════════════════════════════════════════════
-- 7단계: 이력 테이블 상태값 업데이트
-- ══════════════════════════════════════════════════════════════════════════════

UPDATE order_status_history SET to_status = 'PRINTING'
  WHERE to_status IN ('PRODUCTION', 'RIP_SENT', 'PRINT_PENDING');
UPDATE order_status_history SET from_status = 'PRINTING'
  WHERE from_status IN ('PRODUCTION', 'RIP_SENT', 'PRINT_PENDING');
UPDATE order_status_history SET to_status = 'SHIPPED'
  WHERE to_status = 'CLOSED';
UPDATE order_status_history SET from_status = 'SHIPPED'
  WHERE from_status = 'CLOSED';

UPDATE card_status_history SET to_status = 'PRINTING'
  WHERE to_status = 'PRINT_PENDING';
UPDATE card_status_history SET from_status = 'PRINTING'
  WHERE from_status = 'PRINT_PENDING';

PRAGMA foreign_keys = ON;
