-- 0302: 설비(equipment) 법인 격리 (#342) — (나) 법인별 설비 분리
-- 배경: equipment_consumables·maintenance_schedules는 0237에서 entity_id를 받았으나
--       부모 equipment 자체에 entity_id가 없어 자식만 격리하면 반쪽 정합이었음.
--       owner 결정 (나): 법인별로 설비가 달라 운영이 겹치지 않음 → equipment부터 entity_id 도입.
-- entity_id: 설비 귀속 법인. DEFAULT 1 → 기존 설비 전량 동산기획(1)로 백필.
--   다법인 운영 시작 전까지 현 사용자(전부 entity 1)·ADMIN(전체 모드 entityId=0)은 동작 변화 없음.
ALTER TABLE equipment ADD COLUMN entity_id INTEGER DEFAULT 1;

-- 명시 백필 (DEFAULT가 적용되지 않는 경계 대비)
UPDATE equipment SET entity_id = 1 WHERE entity_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_equipment_entity ON equipment(entity_id);
