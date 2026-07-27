-- ============================================================================
-- 00_local_seed_only.sql  —  ⚠️ 로컬 검증 전용. 프로덕션 적용 대상 아님.
-- ----------------------------------------------------------------------------
-- 로컬 D1에는 관계사 client 행(53/1271/3757)이 없어 미러 INSERT의 FK가 깨진다.
-- 로컬 verify를 위한 최소 client 3행만 시드한다. (프로덕션에는 이미 존재)
--   53   = (주)동산기획         (entity 1 본체)
--   1271 = 선명커뮤니케이션      (미러 상대 법인, entity 2 본체)
--   3757 = 동산기획(청주)        (entity 3 본체)
-- prod client_code/name 은 2026-07-20 --remote 실측값.
-- ============================================================================
INSERT OR IGNORE INTO clients (id, client_code, client_name, client_type, is_active) VALUES (53,   '314-81-84311', '(주)동산기획',    'SALES', 1);
INSERT OR IGNORE INTO clients (id, client_code, client_name, client_type, is_active) VALUES (1271, '342-86-03531', '선명커뮤니케이션', 'SALES', 1);
INSERT OR IGNORE INTO clients (id, client_code, client_name, client_type, is_active) VALUES (3757, '316-24-02549', '동산기획(청주)',  'SALES', 1);
