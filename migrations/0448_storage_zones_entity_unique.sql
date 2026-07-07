-- 0448: storage_zones 전역 UNIQUE → 법인별 복합 UNIQUE (#482)
-- 문제: zone_name/zone_code 가 컬럼레벨 전역 UNIQUE(0098 원본) 라, 0232 설계의도(창고=법인 소속)와 달리
--       두 법인이 같은 표준 구역명(자재창고·완제품창고 등)을 못 씀 → 2번째 법인 생성 시 UNIQUE 위반 500.
-- 해결: 컬럼레벨 전역 UNIQUE 제거 → (entity_id, zone_name)·(entity_id, zone_code) 복합 UNIQUE 인덱스.
--       SQLite 는 컬럼 제약 제거에 테이블 재빌드 필요.
-- ⚠️ 위험: storage_zones 를 참조하는 자식 4개(items/purchase_order_items/inventory/inventory_counts
--    .storage_zone_id, 전부 ON DELETE SET NULL) — DROP TABLE 시 암묵 DELETE 가 cascade SET NULL 을 일으켜
--    자식 배정이 전멸함. wrangler 는 파일을 트랜잭션으로 래핑해 PRAGMA foreign_keys=OFF 가 무력(로컬 D1 실증).
-- 대응: 재빌드 전 자식 (id, storage_zone_id) 매핑을 임시 테이블에 저장 → 재빌드(id 전부 보존) → 자식 복원.
--       로컬 D1 에서 capture-restore 보존 실증 완료.

-- 1) 자식 배정 스냅샷 (DROP cascade 전에 저장)
DROP TABLE IF EXISTS _sz_bak_items;
DROP TABLE IF EXISTS _sz_bak_inv;
DROP TABLE IF EXISTS _sz_bak_poi;
DROP TABLE IF EXISTS _sz_bak_ic;
CREATE TABLE _sz_bak_items AS SELECT id, storage_zone_id FROM items WHERE storage_zone_id IS NOT NULL;
CREATE TABLE _sz_bak_inv   AS SELECT id, storage_zone_id FROM inventory WHERE storage_zone_id IS NOT NULL;
CREATE TABLE _sz_bak_poi   AS SELECT id, storage_zone_id FROM purchase_order_items WHERE storage_zone_id IS NOT NULL;
CREATE TABLE _sz_bak_ic    AS SELECT id, storage_zone_id FROM inventory_counts WHERE storage_zone_id IS NOT NULL;

-- 2) storage_zones 재빌드 (zone_name/zone_code 컬럼레벨 UNIQUE 제거, id 전부 보존)
CREATE TABLE storage_zones_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  zone_name TEXT NOT NULL,
  zone_code TEXT,
  description TEXT,
  manager_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  entity_id INTEGER DEFAULT 1 REFERENCES entities(id),
  is_default INTEGER DEFAULT 0,
  facility_zone_id INTEGER REFERENCES facility_zones(id) ON DELETE SET NULL,
  bounds TEXT,
  color TEXT DEFAULT '#3B82F6'
);
INSERT INTO storage_zones_new (id, zone_name, zone_code, description, manager_id, sort_order, is_active, created_at, updated_at, entity_id, is_default, facility_zone_id, bounds, color)
  SELECT id, zone_name, zone_code, description, manager_id, sort_order, is_active, created_at, updated_at, entity_id, is_default, facility_zone_id, bounds, color FROM storage_zones;
DROP TABLE storage_zones;
ALTER TABLE storage_zones_new RENAME TO storage_zones;

-- 3) 인덱스 재생성 + 복합 UNIQUE (법인별 유일)
CREATE INDEX IF NOT EXISTS idx_storage_zones_active ON storage_zones(is_active);
CREATE INDEX IF NOT EXISTS idx_storage_zones_manager ON storage_zones(manager_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sz_entity_name ON storage_zones(entity_id, zone_name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sz_entity_code ON storage_zones(entity_id, zone_code) WHERE zone_code IS NOT NULL;

-- 4) 자식 배정 복원 (DROP cascade 로 NULL 된 것을 스냅샷에서 되돌림; id 는 재빌드에서 전부 보존됨)
UPDATE items SET storage_zone_id = (SELECT b.storage_zone_id FROM _sz_bak_items b WHERE b.id = items.id)
  WHERE id IN (SELECT id FROM _sz_bak_items);
UPDATE inventory SET storage_zone_id = (SELECT b.storage_zone_id FROM _sz_bak_inv b WHERE b.id = inventory.id)
  WHERE id IN (SELECT id FROM _sz_bak_inv);
UPDATE purchase_order_items SET storage_zone_id = (SELECT b.storage_zone_id FROM _sz_bak_poi b WHERE b.id = purchase_order_items.id)
  WHERE id IN (SELECT id FROM _sz_bak_poi);
UPDATE inventory_counts SET storage_zone_id = (SELECT b.storage_zone_id FROM _sz_bak_ic b WHERE b.id = inventory_counts.id)
  WHERE id IN (SELECT id FROM _sz_bak_ic);

-- 5) 스냅샷 정리
DROP TABLE _sz_bak_items;
DROP TABLE _sz_bak_inv;
DROP TABLE _sz_bak_poi;
DROP TABLE _sz_bak_ic;
