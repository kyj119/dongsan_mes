-- 0154_print_method_media.sql
-- 출력방식 + 소재 분리 단가 체계

-- 1. 출력방식 테이블
CREATE TABLE IF NOT EXISTS print_methods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE,
  card_group TEXT NOT NULL DEFAULT 'OUTPUT',
  price_per_sqm REAL DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. 소재 테이블
CREATE TABLE IF NOT EXISTS print_media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  media_type TEXT DEFAULT 'ROLL',
  price_per_unit REAL DEFAULT 0,
  unit TEXT DEFAULT '㎡',
  roll_width_cm REAL,
  sheet_width_cm REAL,
  sheet_height_cm REAL,
  media_group TEXT,
  group_sort INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. 출력방식 ↔ 소재 연결
CREATE TABLE IF NOT EXISTS print_method_media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  print_method_id INTEGER NOT NULL,
  print_media_id INTEGER NOT NULL,
  price_override REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(print_method_id, print_media_id),
  FOREIGN KEY (print_method_id) REFERENCES print_methods(id) ON DELETE CASCADE,
  FOREIGN KEY (print_media_id) REFERENCES print_media(id) ON DELETE CASCADE
);

-- 4. items 테이블 확장
ALTER TABLE items ADD COLUMN print_method_id INTEGER REFERENCES print_methods(id);

ALTER TABLE items ADD COLUMN print_media_id INTEGER REFERENCES print_media(id);

-- 5. order_items 출고 준비 플래그
ALTER TABLE order_items ADD COLUMN shipment_ready INTEGER DEFAULT 0;

-- 6. 출력방식 시드 데이터
INSERT INTO print_methods (name, code, card_group, price_per_sqm, sort_order) VALUES
  ('솔벤', 'SOLVENT', 'OUTPUT', 0, 1),
  ('수성', 'AQUEOUS', 'OUTPUT', 0, 2),
  ('UV', 'UV', 'OUTPUT', 0, 3),
  ('평판', 'FLATBED', 'OUTPUT', 0, 4);

-- 7. 인덱스
CREATE INDEX IF NOT EXISTS idx_print_media_group ON print_media(media_group);
CREATE INDEX IF NOT EXISTS idx_print_media_active ON print_media(is_active);
CREATE INDEX IF NOT EXISTS idx_items_print_method ON items(print_method_id);
CREATE INDEX IF NOT EXISTS idx_items_print_media ON items(print_media_id);
CREATE INDEX IF NOT EXISTS idx_order_items_shipment_ready ON order_items(shipment_ready);
