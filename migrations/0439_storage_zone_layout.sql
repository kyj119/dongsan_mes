-- 0439: 창고 배치도 독립 — storage_zones에 자체 좌표·색상 부여
-- 설계: 창고는 생산 현장과 물리적으로 분리된 공간 → 공장 배치도(facility_zones) 경유 매핑(0391) 대신
--       창고 전용 도면(facility_settings 'storage_background_image') 위에 창고 구역을 직접 배치.
--       storage_zones.facility_zone_id(0391)는 deprecated — D1 FK 컬럼 제거 불가(0335→0337 교훈)라
--       컬럼은 동결하고 UI·쿼리에서만 미사용 처리.
-- bounds: {"x":10,"y":10,"width":20,"height":15} (% 좌표, facility_zones.bounds와 동일 포맷).
--         NULL = 도면 미배치(점진 배정 허용).
ALTER TABLE storage_zones ADD COLUMN bounds TEXT;
ALTER TABLE storage_zones ADD COLUMN color TEXT DEFAULT '#3B82F6';
