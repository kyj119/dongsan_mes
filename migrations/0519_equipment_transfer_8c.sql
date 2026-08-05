-- 전사 8색(Longyin Q2000) 장비 사전등록 — LogWatcher 세팅 P0
--
-- equipment.id 는 TEXT PK(마이그 0027)이고, heartbeat 는 `UPDATE equipment ... WHERE id = ?` 로
-- 가동상태를 전환한다. equipment.json 의 equipment_id 와 같은 id 행이 미리 없으면
-- print_events 적재는 되지만 **장비 상태 전환만 조용히 누락**된다.
--
-- ⚠️ 하트비트가 미등록 장비를 자동 INSERT 하기는 하나(스펙 0615), name·공정 등 서술필드는
--    비어 있게 되고 나중에 수동 보정이 필요하다 → 사전등록으로 이름을 먼저 박아둔다.
INSERT INTO equipment (id, name, status, entity_id)
SELECT 'TRANS-8C-01', '전사 8색 1호기 (Longyin Q2000)', 'ACTIVE', 1
WHERE NOT EXISTS (SELECT 1 FROM equipment WHERE id = 'TRANS-8C-01');

INSERT INTO equipment (id, name, status, entity_id)
SELECT 'TRANS-8C-02', '전사 8색 2호기 (Longyin Q2000)', 'ACTIVE', 1
WHERE NOT EXISTS (SELECT 1 FROM equipment WHERE id = 'TRANS-8C-02');
