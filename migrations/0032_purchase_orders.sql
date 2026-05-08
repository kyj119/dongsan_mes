-- ============================================================================
-- Migration: 0032 - 발주(Purchase Order) 시스템
-- ============================================================================

-- 1. clients 확장: 거래처 유형 구분
ALTER TABLE clients ADD COLUMN client_type TEXT DEFAULT 'SALES';
UPDATE clients SET client_type = 'SALES' WHERE client_type IS NULL;
ALTER TABLE clients ADD COLUMN purchase_balance REAL DEFAULT 0;

-- 2. purchase_orders (발주서)
CREATE TABLE IF NOT EXISTS purchase_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  po_number TEXT UNIQUE NOT NULL,
  supplier_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK(status IN ('DRAFT','CONFIRMED','PARTIAL_RECEIVED','RECEIVED','CANCELLED')),
  order_date DATE DEFAULT CURRENT_DATE,
  expected_date DATE,
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
  FOREIGN KEY (supplier_id) REFERENCES clients(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- 3. purchase_order_items (발주 품목)
CREATE TABLE IF NOT EXISTS purchase_order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  po_id INTEGER NOT NULL,
  item_id INTEGER,
  item_name TEXT NOT NULL,
  category_name TEXT,
  quantity REAL NOT NULL DEFAULT 1,
  received_quantity REAL DEFAULT 0,
  unit TEXT DEFAULT 'EA',
  unit_price REAL DEFAULT 0,
  amount REAL DEFAULT 0,
  vat_included INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items(id)
);

-- 4. po_status_history (발주 상태 이력)
CREATE TABLE IF NOT EXISTS po_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  po_id INTEGER NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by INTEGER NOT NULL,
  change_reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by) REFERENCES users(id)
);

-- 5. purchase_payments (매입 대금 지급)
CREATE TABLE IF NOT EXISTS purchase_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id INTEGER NOT NULL,
  payment_date DATE NOT NULL,
  amount REAL NOT NULL,
  payment_method TEXT,
  reference_number TEXT,
  po_id INTEGER,
  notes TEXT,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (supplier_id) REFERENCES clients(id),
  FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- 6. inventory_receipts 확장 (발주 연결)
ALTER TABLE inventory_receipts ADD COLUMN po_id INTEGER DEFAULT NULL;
ALTER TABLE inventory_receipts ADD COLUMN supplier_id INTEGER DEFAULT NULL;

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_clients_client_type ON clients(client_type);
CREATE INDEX IF NOT EXISTS idx_po_number ON purchase_orders(po_number);
CREATE INDEX IF NOT EXISTS idx_po_supplier ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_po_order_date ON purchase_orders(order_date);
CREATE INDEX IF NOT EXISTS idx_poi_po ON purchase_order_items(po_id);
CREATE INDEX IF NOT EXISTS idx_poi_item ON purchase_order_items(item_id);
CREATE INDEX IF NOT EXISTS idx_po_history_po ON po_status_history(po_id);
CREATE INDEX IF NOT EXISTS idx_pp_supplier ON purchase_payments(supplier_id);
CREATE INDEX IF NOT EXISTS idx_pp_date ON purchase_payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_pp_po ON purchase_payments(po_id);
