-- 0391: 창고 구역(storage_zones) ↔ 공장 배치도 영역(facility_zones) 매핑
-- 배경: 재고 위치 정본은 storage_zones(발주·보관 창고, 담당자/법인 보유)인데 좌표가 없고,
--       배치도는 facility_zones(bounds 좌표)인데 재고와 단절. 둘을 N:1로 연결해
--       "재고 → 창고 → 배치도 영역 → 좌표" 경로를 잇는다. (배치도 재고 오버레이·구역 실사의 기반)
-- 카디널리티: 한 배치도 영역에 여러 발주 창고가 들어갈 수 있으므로 storage_zones → facility_zones (N:1).
-- nullable: 미지정 창고는 배치도에 미표시(점진 배정 허용).
ALTER TABLE storage_zones ADD COLUMN facility_zone_id INTEGER REFERENCES facility_zones(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_storage_zones_facility ON storage_zones(facility_zone_id);
