-- ============================================================================
-- 시설 평면도 (구역, 자재 보관 위치)
-- ============================================================================

-- facility_zones: 시설 구역 정의
CREATE TABLE IF NOT EXISTS facility_zones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#3B82F6',
  sort_order INTEGER DEFAULT 0,
  bounds TEXT DEFAULT '{"x":10,"y":10,"width":200,"height":150}',
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- facility_settings: 배경 이미지 등 시설 전역 설정
CREATE TABLE IF NOT EXISTS facility_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  setting_key TEXT UNIQUE NOT NULL,
  setting_value TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- inventory_locations: 자재 보관 위치
CREATE TABLE IF NOT EXISTS inventory_locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  zone_id INTEGER,
  name TEXT NOT NULL,
  location_x REAL DEFAULT 50,
  location_y REAL DEFAULT 50,
  location_type TEXT DEFAULT 'STORAGE' CHECK(location_type IN ('STORAGE','STAGING','OUTPUT')),
  description TEXT,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (zone_id) REFERENCES facility_zones(id) ON DELETE SET NULL
);

-- equipment 테이블에 zone_id 추가
ALTER TABLE equipment ADD COLUMN zone_id INTEGER REFERENCES facility_zones(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_il_zone ON inventory_locations(zone_id);

-- 기본 구역 시드
INSERT INTO facility_zones (name, description, color, sort_order, bounds) VALUES
  ('전사출력실', '전사 프린터 — 깃발, 가로등배너', '#EF4444', 1, '{"x":5,"y":5,"width":28,"height":40}'),
  ('봉재실', '봉제기 — 전사 후 봉제', '#F59E0B', 2, '{"x":35,"y":5,"width":28,"height":40}'),
  ('출력실', '솔벤트/UV/현수막 복합 출력 + 재단', '#3B82F6', 3, '{"x":65,"y":5,"width":30,"height":40}'),
  ('현수막실', '현수막 전용 출력 + 미싱', '#10B981', 4, '{"x":5,"y":50,"width":28,"height":45}'),
  ('UV실', 'UV/솔벤트 3.2m 대형 — 대량, 후렉스', '#8B5CF6', 5, '{"x":35,"y":50,"width":28,"height":45}'),
  ('간판실', '간판 제조/조립', '#EC4899', 6, '{"x":65,"y":50,"width":30,"height":45}');
