-- 0134: inventory_* 테이블 FK를 legacy inventory_items → 실제 items 테이블로 수정
--
-- 배경 (2026-04-15):
--   inventory_items 테이블은 origin 스키마의 legacy. 실제 품목은 items 테이블에서 관리 중이나
--   4개 테이블 (inventory_receipt_items, inventory_transactions, inventory_release_items,
--   inventory_adjustments) 의 item_id FK가 여전히 inventory_items(id) 를 참조.
--   inventory_items 는 비어있으므로 INSERT 시도마다 FK 위반 → /receive 핸들러 500.
--
-- 사전 확인: 4개 테이블 모두 현재 데이터 0행 (SELECT COUNT 검증 완료)
--   → 안전하게 DROP + CREATE (데이터 마이그레이션 불필요)
--
-- 포함:
--   1. 손상된 데이터 정리 (2026-04-15 PO 1 테스트 중 부분 성공 흔적)
--   2. 4개 테이블 FK 재지정 (inventory_items → items)
--   3. 기존 인덱스 3종 재생성

-- ============================================================================
-- Step 1. 손상 데이터 정리
-- ============================================================================
-- RCV-20260415-001: 라인 없는 orphan receipt 삭제
DELETE FROM inventory_receipts
 WHERE id = 1 AND receipt_number = 'RCV-20260415-001';

-- purchase_order_items id=1: 실제 입고 안 됐는데 received=300 남음 → 0으로 복원
UPDATE purchase_order_items
   SET received_quantity = 0,
       accepted_quantity = 0,
       rejected_quantity = 0
 WHERE id = 1 AND received_quantity = 300;

-- ============================================================================
-- Step 2. inventory_receipt_items 재생성 (FK → items)
-- ============================================================================
DROP TABLE IF EXISTS inventory_receipt_items;
CREATE TABLE inventory_receipt_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  quantity REAL NOT NULL,
  unit_price REAL NOT NULL,
  amount REAL NOT NULL,
  location TEXT,
  notes TEXT,
  received_quantity REAL DEFAULT 0,
  accepted_quantity REAL DEFAULT 0,
  rejected_quantity REAL DEFAULT 0,
  quality_status TEXT,
  reject_memo TEXT,
  po_item_id INTEGER,
  FOREIGN KEY (receipt_id) REFERENCES inventory_receipts(id),
  FOREIGN KEY (item_id) REFERENCES items(id)
);
CREATE INDEX IF NOT EXISTS idx_iri_po_item ON inventory_receipt_items(po_item_id);
CREATE INDEX IF NOT EXISTS idx_iri_receipt ON inventory_receipt_items(receipt_id);

-- ============================================================================
-- Step 3. inventory_transactions 재생성 (FK → items)
-- ============================================================================
DROP TABLE IF EXISTS inventory_transactions;
CREATE TABLE inventory_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  transaction_type TEXT NOT NULL,
  transaction_date DATETIME NOT NULL,
  quantity REAL NOT NULL,
  unit_price REAL,
  total_amount REAL,
  reference_type TEXT,
  reference_id INTEGER,
  balance_after REAL NOT NULL,
  reason TEXT,
  handled_by INTEGER,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (item_id) REFERENCES items(id),
  FOREIGN KEY (handled_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_item ON inventory_transactions(item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_date ON inventory_transactions(transaction_date);

-- ============================================================================
-- Step 4. inventory_release_items 재생성 (FK → items)
-- ============================================================================
DROP TABLE IF EXISTS inventory_release_items;
CREATE TABLE inventory_release_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  release_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  quantity REAL NOT NULL,
  notes TEXT,
  FOREIGN KEY (release_id) REFERENCES inventory_releases(id),
  FOREIGN KEY (item_id) REFERENCES items(id)
);

-- ============================================================================
-- Step 5. inventory_adjustments 재생성 (FK → items)
-- ============================================================================
DROP TABLE IF EXISTS inventory_adjustments;
CREATE TABLE inventory_adjustments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  adjustment_date DATE NOT NULL,
  quantity_before REAL NOT NULL,
  quantity_after REAL NOT NULL,
  adjustment_quantity REAL NOT NULL,
  reason TEXT NOT NULL,
  adjusted_by INTEGER NOT NULL,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (item_id) REFERENCES items(id),
  FOREIGN KEY (adjusted_by) REFERENCES users(id)
);
