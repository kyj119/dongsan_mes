-- 0396: 재고 창고별 다중행 전환 (창고별 분리 재설계 UP1)
-- spec: docs/superpowers/specs/2026-06-27-inventory-redesign-unified.md
-- inventory를 (item_id, entity_id) 단일행 → (item_id, entity_id, storage_zone_id) 다중행으로.
--   같은 품목×법인이 창고별로 다른 수량 보유. 수량 단위 = items.base_unit(0395, multi-UOM).
--   NULL storage_zone_id = 미배정(배포된 P3 inventoryCount의 IS NULL 의미와 정합). 센티넬 행 미사용.
-- ⚠️ ALTER ADD COLUMN·인덱스 재생성은 멱등 아님 — 1회만 적용.
-- 전제: inventory 0행(prod·local) → 백필 불필요. (행 있으면 NULL zone 중복 사전정리 필요)

-- ── inventory UNIQUE 재정의: (item, entity) → (item, entity, zone) ──
-- NULL은 IFNULL(...,0)으로 0 취급 → 미배정 행도 품목×법인당 1개로 유일성 보장.
DROP INDEX IF EXISTS idx_inventory_item_entity;
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_item_entity_zone
  ON inventory(item_id, entity_id, IFNULL(storage_zone_id, 0));

-- ── 차감/거래 창고 추적 (창고별 소모 집계·원가분석 기반) ──
ALTER TABLE inventory_transactions ADD COLUMN storage_zone_id INTEGER REFERENCES storage_zones(id) ON DELETE SET NULL;

-- ── 실사 라인 창고별 ──
ALTER TABLE inventory_count_items ADD COLUMN storage_zone_id INTEGER REFERENCES storage_zones(id) ON DELETE SET NULL;
-- 같은 실사에 품목×창고 1행 (기존 (count_id,item_id) UNIQUE → 창고 포함)
DROP INDEX IF EXISTS idx_count_items_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_count_items_unique_zone
  ON inventory_count_items(count_id, item_id, IFNULL(storage_zone_id, 0));
