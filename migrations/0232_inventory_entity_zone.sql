-- 0232: 법인별·창고별 재고 분리 (Phase 1 기반)
-- 결정사항:
--   1. 품목당 창고 1개 (items.storage_zone_id 단일 FK 유지)
--   2. 창고는 법인 소속 (storage_zones.entity_id)
--   3. 재고는 품목×법인 단위 (inventory UNIQUE(item_id, entity_id))
--   4. 음수 재고: 경고만, 차단 안함
--   5. inventory.location(사장 필드) → storage_zone_id로 대체

-- ── 1. storage_zones에 entity_id + is_default 추가 ──
ALTER TABLE storage_zones ADD COLUMN entity_id INTEGER DEFAULT 1 REFERENCES entities(id);
ALTER TABLE storage_zones ADD COLUMN is_default INTEGER DEFAULT 0;
CREATE INDEX idx_storage_zones_entity ON storage_zones(entity_id);
UPDATE storage_zones SET entity_id = 1 WHERE entity_id IS NULL;

-- ── 2. inventory 테이블 재생성 (UNIQUE 제약 변경) ──
CREATE TABLE inventory_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  quantity REAL DEFAULT 0,
  safe_stock REAL DEFAULT 0,
  reorder_point REAL DEFAULT 0,
  auto_pr_enabled INTEGER DEFAULT 0,
  storage_zone_id INTEGER REFERENCES storage_zones(id) ON DELETE SET NULL,
  entity_id INTEGER DEFAULT 1 REFERENCES entities(id),
  last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (item_id) REFERENCES items(id)
);

-- 기존 데이터 이관 (storage_zone_id는 items에서 가져오기)
INSERT INTO inventory_new (id, item_id, quantity, safe_stock, reorder_point, auto_pr_enabled, storage_zone_id, entity_id, last_updated)
SELECT inv.id, inv.item_id, inv.quantity, inv.safe_stock,
       COALESCE(inv.reorder_point, 0), COALESCE(inv.auto_pr_enabled, 0),
       i.storage_zone_id, 1, inv.last_updated
FROM inventory inv
LEFT JOIN items i ON i.id = inv.item_id;

DROP TABLE inventory;
ALTER TABLE inventory_new RENAME TO inventory;

-- 새 인덱스 생성
CREATE UNIQUE INDEX idx_inventory_item_entity ON inventory(item_id, entity_id);
CREATE INDEX idx_inventory_entity ON inventory(entity_id);
CREATE INDEX idx_inventory_zone ON inventory(storage_zone_id);

-- ── 3. 관련 테이블에 entity_id 추가 ──
ALTER TABLE inventory_receipts ADD COLUMN entity_id INTEGER DEFAULT 1 REFERENCES entities(id);
ALTER TABLE inventory_releases ADD COLUMN entity_id INTEGER DEFAULT 1 REFERENCES entities(id);
ALTER TABLE inventory_adjustments ADD COLUMN entity_id INTEGER DEFAULT 1 REFERENCES entities(id);
ALTER TABLE purchase_requests ADD COLUMN entity_id INTEGER DEFAULT 1 REFERENCES entities(id);

CREATE INDEX idx_inv_receipts_entity ON inventory_receipts(entity_id);
CREATE INDEX idx_inv_releases_entity ON inventory_releases(entity_id);
CREATE INDEX idx_inv_adjustments_entity ON inventory_adjustments(entity_id);
CREATE INDEX idx_purchase_requests_entity ON purchase_requests(entity_id);
