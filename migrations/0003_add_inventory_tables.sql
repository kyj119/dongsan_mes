-- Migration: 0003_add_inventory_tables.sql
-- Purpose: 재고 관리 시스템 테이블 생성
-- Created: 2026-02-12

-- 재고 품목 마스터 (자재 및 소모품)
CREATE TABLE IF NOT EXISTS inventory_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_code TEXT UNIQUE NOT NULL,                    -- 품목 코드 (예: MAT-001)
  item_name TEXT NOT NULL,                            -- 품목명
  category TEXT NOT NULL,                             -- 카테고리 (FABRIC, ACCESSORY, CONSUMABLE)
  sub_category TEXT,                                  -- 세부 카테고리
  unit TEXT NOT NULL DEFAULT 'EA',                    -- 단위 (EA, M, KG, L)
  unit_price REAL DEFAULT 0,                          -- 단가
  current_stock REAL DEFAULT 0,                       -- 현재 재고량
  safety_stock REAL DEFAULT 0,                        -- 안전 재고량
  location TEXT,                                      -- 보관 위치
  supplier TEXT,                                      -- 공급업체
  description TEXT,                                   -- 설명
  is_active INTEGER NOT NULL DEFAULT 1,               -- 사용 여부
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 입출고 트랜잭션
CREATE TABLE IF NOT EXISTS inventory_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,                           -- 재고 품목 ID
  transaction_type TEXT NOT NULL,                     -- 트랜잭션 유형 (IN, OUT, ADJUST)
  transaction_date DATETIME NOT NULL,                 -- 거래 일시
  quantity REAL NOT NULL,                             -- 수량 (입고: +, 출고: -)
  unit_price REAL,                                    -- 단가 (입고 시)
  total_amount REAL,                                  -- 총액
  reference_type TEXT,                                -- 참조 유형 (PURCHASE, ORDER, PRODUCTION, ADJUSTMENT)
  reference_id INTEGER,                               -- 참조 ID (주문 ID 등)
  balance_after REAL NOT NULL,                        -- 거래 후 잔액
  reason TEXT,                                        -- 사유
  handled_by INTEGER,                                 -- 처리자 (users.id)
  notes TEXT,                                         -- 비고
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (item_id) REFERENCES inventory_items(id),
  FOREIGN KEY (handled_by) REFERENCES users(id)
);

-- 입고 내역 (구매 정보)
CREATE TABLE IF NOT EXISTS inventory_receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_number TEXT UNIQUE NOT NULL,                -- 입고번호 (예: RCV-20260212-001)
  receipt_date DATE NOT NULL,                         -- 입고일
  supplier TEXT NOT NULL,                             -- 공급업체
  total_amount REAL DEFAULT 0,                        -- 총 입고 금액
  status TEXT NOT NULL DEFAULT 'COMPLETED',           -- 상태 (PENDING, COMPLETED, CANCELLED)
  received_by INTEGER,                                -- 입고 담당자
  notes TEXT,                                         -- 비고
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (received_by) REFERENCES users(id)
);

-- 입고 상세 (입고 품목별)
CREATE TABLE IF NOT EXISTS inventory_receipt_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_id INTEGER NOT NULL,                        -- 입고번호 ID
  item_id INTEGER NOT NULL,                           -- 재고 품목 ID
  quantity REAL NOT NULL,                             -- 입고 수량
  unit_price REAL NOT NULL,                           -- 입고 단가
  amount REAL NOT NULL,                               -- 금액
  location TEXT,                                      -- 보관 위치
  notes TEXT,                                         -- 비고
  FOREIGN KEY (receipt_id) REFERENCES inventory_receipts(id),
  FOREIGN KEY (item_id) REFERENCES inventory_items(id)
);

-- 출고 요청 (주문 연동)
CREATE TABLE IF NOT EXISTS inventory_releases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  release_number TEXT UNIQUE NOT NULL,                -- 출고번호 (예: REL-20260212-001)
  release_date DATE NOT NULL,                         -- 출고일
  reference_type TEXT NOT NULL,                       -- 참조 유형 (ORDER, PRODUCTION, OTHER)
  reference_id INTEGER,                               -- 참조 ID (주문 ID 등)
  status TEXT NOT NULL DEFAULT 'COMPLETED',           -- 상태 (PENDING, COMPLETED, CANCELLED)
  released_by INTEGER,                                -- 출고 담당자
  notes TEXT,                                         -- 비고
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (released_by) REFERENCES users(id)
);

-- 출고 상세 (출고 품목별)
CREATE TABLE IF NOT EXISTS inventory_release_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  release_id INTEGER NOT NULL,                        -- 출고번호 ID
  item_id INTEGER NOT NULL,                           -- 재고 품목 ID
  quantity REAL NOT NULL,                             -- 출고 수량
  notes TEXT,                                         -- 비고
  FOREIGN KEY (release_id) REFERENCES inventory_releases(id),
  FOREIGN KEY (item_id) REFERENCES inventory_items(id)
);

-- 재고 조정 이력
CREATE TABLE IF NOT EXISTS inventory_adjustments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,                           -- 재고 품목 ID
  adjustment_date DATE NOT NULL,                      -- 조정일
  quantity_before REAL NOT NULL,                      -- 조정 전 수량
  quantity_after REAL NOT NULL,                       -- 조정 후 수량
  adjustment_quantity REAL NOT NULL,                  -- 조정 수량 (+ or -)
  reason TEXT NOT NULL,                               -- 조정 사유 (DAMAGE, LOSS, FOUND, COUNT_ERROR)
  adjusted_by INTEGER NOT NULL,                       -- 조정자
  notes TEXT,                                         -- 비고
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (item_id) REFERENCES inventory_items(id),
  FOREIGN KEY (adjusted_by) REFERENCES users(id)
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_inventory_items_code ON inventory_items(item_code);
CREATE INDEX IF NOT EXISTS idx_inventory_items_category ON inventory_items(category);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_item ON inventory_transactions(item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_date ON inventory_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_inventory_receipts_date ON inventory_receipts(receipt_date);
CREATE INDEX IF NOT EXISTS idx_inventory_releases_date ON inventory_releases(release_date);
