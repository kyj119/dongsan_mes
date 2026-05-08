-- 0098: 창고 구역 관리 테이블 + 품목 연결
-- 창고/담당자별 발주 품목 분류 체계

-- 창고 구역 마스터
CREATE TABLE IF NOT EXISTS storage_zones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  zone_name TEXT NOT NULL UNIQUE,
  zone_code TEXT UNIQUE,
  description TEXT,
  manager_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_storage_zones_active ON storage_zones(is_active);
CREATE INDEX IF NOT EXISTS idx_storage_zones_manager ON storage_zones(manager_id);

-- 품목에 창고 구역 연결 컬럼 추가
ALTER TABLE items ADD COLUMN storage_zone_id INTEGER REFERENCES storage_zones(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_items_storage_zone ON items(storage_zone_id);

-- 기존 inventory.location(텍스트)은 유지하되, storage_zone_id로 정규화된 관리 시작
