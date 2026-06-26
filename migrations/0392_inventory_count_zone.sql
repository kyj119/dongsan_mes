-- 0392: 구역 기반 재고 실사 (P3)
-- 배경: 배치도 영역 → storage_zone 선택 → "구역 실사". 첫 실사가 미배정 품목↔구역 배정을 겸함.
-- inventory_counts에 실사 대상 창고 구역(storage_zone) FK 추가. NULL이면 기존 FULL/PERIODIC 실사.
ALTER TABLE inventory_counts ADD COLUMN storage_zone_id INTEGER REFERENCES storage_zones(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_counts_storage_zone ON inventory_counts(storage_zone_id);
