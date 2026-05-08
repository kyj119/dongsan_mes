-- ============================================================================
-- Migration 0040: 현장 발주 요청 + 입고 검수 강화
-- ============================================================================

-- 1. purchase_requests (발주 요청 헤더)
CREATE TABLE IF NOT EXISTS purchase_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_number TEXT UNIQUE NOT NULL,
  requester_id INTEGER NOT NULL,
  supplier_id INTEGER,
  urgency TEXT NOT NULL DEFAULT 'NORMAL'
    CHECK(urgency IN ('LOW','NORMAL','HIGH','URGENT')),
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK(status IN ('PENDING','APPROVED','REJECTED','CONVERTED')),
  reason TEXT,
  reject_reason TEXT,
  notes TEXT,
  approved_by INTEGER,
  approved_at DATETIME,
  converted_po_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (requester_id) REFERENCES users(id),
  FOREIGN KEY (supplier_id) REFERENCES clients(id),
  FOREIGN KEY (approved_by) REFERENCES users(id),
  FOREIGN KEY (converted_po_id) REFERENCES purchase_orders(id) ON DELETE SET NULL
);

-- 2. purchase_request_items (요청 품목)
CREATE TABLE IF NOT EXISTS purchase_request_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL,
  item_id INTEGER,
  item_name TEXT NOT NULL,
  category_name TEXT,
  quantity REAL DEFAULT 1,
  unit TEXT DEFAULT 'EA',
  estimated_unit_price REAL DEFAULT 0,
  admin_unit_price REAL,
  admin_quantity REAL,
  sort_order INTEGER DEFAULT 0,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (request_id) REFERENCES purchase_requests(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items(id)
);

-- 3. pr_status_history (발주 요청 상태 이력)
CREATE TABLE IF NOT EXISTS pr_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by INTEGER,
  change_reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (request_id) REFERENCES purchase_requests(id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by) REFERENCES users(id)
);

-- 4. purchase_order_items 검수 컬럼 추가
ALTER TABLE purchase_order_items ADD COLUMN accepted_quantity REAL DEFAULT 0;
ALTER TABLE purchase_order_items ADD COLUMN rejected_quantity REAL DEFAULT 0;

-- 5. inventory_receipt_items 검수 컬럼 추가
ALTER TABLE inventory_receipt_items ADD COLUMN received_quantity REAL DEFAULT 0;
ALTER TABLE inventory_receipt_items ADD COLUMN accepted_quantity REAL DEFAULT 0;
ALTER TABLE inventory_receipt_items ADD COLUMN rejected_quantity REAL DEFAULT 0;
ALTER TABLE inventory_receipt_items ADD COLUMN quality_status TEXT;
ALTER TABLE inventory_receipt_items ADD COLUMN reject_memo TEXT;
ALTER TABLE inventory_receipt_items ADD COLUMN po_item_id INTEGER;

-- 6. inventory_receipts 검수 상태 컬럼 추가
ALTER TABLE inventory_receipts ADD COLUMN inspection_status TEXT;

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_pr_request_number ON purchase_requests(request_number);
CREATE INDEX IF NOT EXISTS idx_pr_status ON purchase_requests(status);
CREATE INDEX IF NOT EXISTS idx_pr_requester ON purchase_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_pri_request ON purchase_request_items(request_id);
CREATE INDEX IF NOT EXISTS idx_iri_po_item ON inventory_receipt_items(po_item_id);
