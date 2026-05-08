-- ============================================================================
-- Migration: 0035 - 단가표(Price List) 등급제 시스템
-- ============================================================================

-- 1. 단가표 테이블
CREATE TABLE IF NOT EXISTS price_lists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  adjustment_percent REAL NOT NULL DEFAULT 0,
  description TEXT,
  is_default INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. 기본 단가표 삽입
INSERT INTO price_lists (name, adjustment_percent, description, is_default)
VALUES ('기본', 0, '기본 단가표 (조정 없음)', 1);

-- 3. 거래처에 단가표 연결
ALTER TABLE clients ADD COLUMN price_list_id INTEGER DEFAULT NULL;

-- 4. 기존 거래처 모두 기본 단가표 배정
UPDATE clients SET price_list_id = 1;

-- 5. 인덱스
CREATE INDEX IF NOT EXISTS idx_clients_price_list ON clients(price_list_id);
