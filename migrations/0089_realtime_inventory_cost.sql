-- ============================================================================
-- Migration 0089: 실시간 재고 추적 + 원가 자동 분석
-- - items.width_mm: 원단 품목 폭(mm) 저장
-- - product_materials: 제품→원단 매핑
-- - inventory_auto_deductions: print_event 기반 자동차감 이력
-- - inventory_counts / inventory_count_items: 재고실사
-- - cost_snapshots: 월별 원가 스냅샷
-- ============================================================================

-- 1. items 테이블에 원단 폭(mm) 컬럼 추가
ALTER TABLE items ADD COLUMN width_mm INTEGER;

-- 2. 제품-원단 매핑 테이블
CREATE TABLE IF NOT EXISTS product_materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_item_id INTEGER NOT NULL,
  material_item_id INTEGER NOT NULL,
  is_default INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_item_id) REFERENCES items(id),
  FOREIGN KEY (material_item_id) REFERENCES items(id),
  UNIQUE(product_item_id, material_item_id)
);

CREATE INDEX IF NOT EXISTS idx_product_materials_product ON product_materials(product_item_id);
CREATE INDEX IF NOT EXISTS idx_product_materials_material ON product_materials(material_item_id);

-- 3. 자동차감 이력 테이블
CREATE TABLE IF NOT EXISTS inventory_auto_deductions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  print_event_id INTEGER NOT NULL,
  material_item_id INTEGER NOT NULL,
  deducted_length_mm REAL NOT NULL,
  deducted_length_yd REAL NOT NULL,
  output_width_mm REAL NOT NULL,
  output_height_mm REAL NOT NULL,
  copy_total INTEGER DEFAULT 1,
  inventory_before REAL,
  inventory_after REAL,
  matched_width_mm INTEGER,
  card_id INTEGER,
  order_number TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (print_event_id) REFERENCES print_events(id),
  FOREIGN KEY (material_item_id) REFERENCES items(id)
);

CREATE INDEX IF NOT EXISTS idx_auto_deductions_print_event ON inventory_auto_deductions(print_event_id);
CREATE INDEX IF NOT EXISTS idx_auto_deductions_material ON inventory_auto_deductions(material_item_id);
CREATE INDEX IF NOT EXISTS idx_auto_deductions_created ON inventory_auto_deductions(created_at);

-- 4. 재고실사 헤더
CREATE TABLE IF NOT EXISTS inventory_counts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  count_number TEXT NOT NULL UNIQUE,
  count_date TEXT NOT NULL,
  count_type TEXT DEFAULT 'FULL',
  status TEXT DEFAULT 'DRAFT',
  submitted_by TEXT,
  submitted_at DATETIME,
  approved_by TEXT,
  approved_at DATETIME,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 5. 재고실사 상세
CREATE TABLE IF NOT EXISTS inventory_count_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  count_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  system_quantity REAL NOT NULL,
  counted_quantity REAL,
  difference REAL,
  difference_pct REAL,
  unit TEXT DEFAULT 'YD',
  notes TEXT,
  FOREIGN KEY (count_id) REFERENCES inventory_counts(id),
  FOREIGN KEY (item_id) REFERENCES items(id)
);

CREATE INDEX IF NOT EXISTS idx_count_items_count ON inventory_count_items(count_id);
CREATE INDEX IF NOT EXISTS idx_count_items_item ON inventory_count_items(item_id);

-- 6. 원가 산출 스냅샷
CREATE TABLE IF NOT EXISTS cost_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period TEXT NOT NULL,
  material_item_id INTEGER,
  category_name TEXT,
  total_consumed_yd REAL DEFAULT 0,
  total_consumed_sqm REAL DEFAULT 0,
  total_produced_sqm REAL DEFAULT 0,
  loss_rate REAL DEFAULT 0,
  total_material_cost REAL DEFAULT 0,
  avg_purchase_price_yd REAL DEFAULT 0,
  material_cost_per_sqm REAL DEFAULT 0,
  ink_total_cost REAL DEFAULT 0,
  ink_cost_per_sqm REAL DEFAULT 0,
  total_cost_per_sqm REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(period, material_item_id, category_name)
);

CREATE INDEX IF NOT EXISTS idx_cost_snapshots_period ON cost_snapshots(period);
