-- 구역 담당자 지정 (2026-08-25, 용준님 확정) — 계정 4개 신설 + employees 연결 + 구역 배정
--
-- 담당자: 정보람(인쇄) · 한두선(생산) · 강지영(영업·선명) · 최재영(전사)
-- 초기 비밀번호 = 1234 (용준님 지정). 해시 = PBKDF2-SHA256 100,000회, utils/crypto.ts 포맷과 동일.
--   ⚠️지금 단계에서 로그인은 필요 없다 — 담당자를 시스템에 기록하는 것이 목적이고 로그인은 3단계.
--
-- ★구역 배정 근거(구역 실물 조회):
--   출력실(1)   = 엡손 솔벤잉크 + 시트지(그레이/랩핑/코팅지) + 수성 현수막원단 → **솔벤 시트·잉크**
--                 ⇒ 한두선("솔벤 시트랑 잉크 관리", 용준님 확인)
--   전사출력실(3) = 폰지·매쉬·샤틴·전사잉크 ⇒ 최재영(TRANSFER)
--   UV실(5)     = R50/E413 UV잉크·평판잉크·후렉스
--   현수막실(6) = 수성 현수막원단 저밀도·수성잉크(잉크테크/코스테크)
--   선명2(4)    = entity 2 ⇒ 강지영(employees.entity_id=2)
--   ※정보람 배정은 별도 확정 후 적용(UV실/현수막실 미정).
--
-- ★`users.role` 은 레거시 4역할 CHECK 제약이라 'OPERATOR' 고정, 실제 역할은 `job_role`
--   (로그인이 COALESCE(job_role, role) 을 JWT role 로 발급 — routes/auth.ts:22).
--
-- 롤백: DELETE FROM users WHERE username IN ('정보람','한두선','강지영','최재영');
--       UPDATE employees SET user_id=NULL WHERE name IN ('정보람','한두선','강지영','최재영');
--       UPDATE storage_zones SET manager_id=NULL WHERE id IN (1,3);
--       UPDATE storage_zones SET manager_id=5 WHERE id=4;   -- 선명2 원복(기존 관리자)

CREATE TABLE IF NOT EXISTS _bak_0825_zone_mgr AS
SELECT id, zone_name, manager_id, datetime('now') AS saved_at FROM storage_zones;

-- ── 1) 계정 4개 신설 (비번 1234) ────────────────────────────────────────
INSERT INTO users (username, password_hash, name, role, job_role, is_active, default_entity_id)
SELECT '정보람', 'pbkdf2:100000:a83ed5e59ce757544f98ba3364f6ac44:012577cb168e334d4f56055a0fef786e6473716012dd74a5c0c44a3b74cb4ef3', '정보람', 'OPERATOR', 'OPERATOR', 1, 1
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username='정보람');

INSERT INTO users (username, password_hash, name, role, job_role, is_active, default_entity_id)
SELECT '한두선', 'pbkdf2:100000:9d9f1a8f3793aa532333da24b1a42a51:3c1a71df9310579d865fb31b2eef52a11e6da1e1c2f6f2f45c2658d4583440fc', '한두선', 'OPERATOR', 'OPERATOR', 1, 1
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username='한두선');

INSERT INTO users (username, password_hash, name, role, job_role, is_active, default_entity_id)
SELECT '강지영', 'pbkdf2:100000:5522372dad1f70819ab946ce3ba1c642:13ebcff1d1e6d140c8d4c552857ee9cd444548b1c1bf8c2326cf7dce7142953f', '강지영', 'OPERATOR', 'SALES', 1, 2
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username='강지영');

INSERT INTO users (username, password_hash, name, role, job_role, is_active, default_entity_id)
SELECT '최재영', 'pbkdf2:100000:5d912ea6398a9f523acbe371ac668213:0692bef985e4ea0437fa85844c51ec1c2f60e00ba0b0380b0f68378298ab3859', '최재영', 'OPERATOR', 'OPERATOR', 1, 1
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username='최재영');

-- ── 2) employees ↔ users 연결 (HR 화면은 user_id 쓰기가 막혀 있어 SQL 이 유일) ──
UPDATE employees SET user_id = (SELECT id FROM users WHERE username='정보람') WHERE name='정보람' AND is_deleted=0 AND user_id IS NULL;
UPDATE employees SET user_id = (SELECT id FROM users WHERE username='한두선') WHERE name='한두선' AND is_deleted=0 AND user_id IS NULL;
UPDATE employees SET user_id = (SELECT id FROM users WHERE username='강지영') WHERE name='강지영' AND is_deleted=0 AND user_id IS NULL;
UPDATE employees SET user_id = (SELECT id FROM users WHERE username='최재영') WHERE name='최재영' AND is_deleted=0 AND user_id IS NULL;

-- ── 3) 구역 담당자 배정 (확정분 3건) ───────────────────────────────────
UPDATE storage_zones SET manager_id = (SELECT id FROM users WHERE username='한두선'), updated_at = CURRENT_TIMESTAMP WHERE id = 1; -- 출력실
UPDATE storage_zones SET manager_id = (SELECT id FROM users WHERE username='최재영'), updated_at = CURRENT_TIMESTAMP WHERE id = 3; -- 전사출력실
UPDATE storage_zones SET manager_id = (SELECT id FROM users WHERE username='강지영'), updated_at = CURRENT_TIMESTAMP WHERE id = 4; -- 선명2
