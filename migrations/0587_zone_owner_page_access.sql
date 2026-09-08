-- 0587: 구역 담당자가 실제로 일할 수 있게 권한을 맞춘다
--
-- 왜 (2026-09-08 발견):
--   ① **선명2 담당 강지영이 두 화면 모두 못 들어간다** — 역할이 `SALES` 인데
--      `/storage-zones` 는 ADMIN·OPERATOR, `/receiving` 은 ADMIN·MANAGER·OPERATOR 에만 열려 있다.
--      선명2 는 재고 **263행**으로 가장 큰 구역이고 실사 247라인도 거기다.
--      이대로면 내일 품목 배정에서 **선명이 통째로 빠진다**.
--   ② `/storage-zones` 의 OPERATOR 가 `can_edit = 0` 이다 — 화면은 보이는데 저장이 막힌다.
--      품목 배정은 **쓰기**다. 담당자 4명(한두선·최재영·모니르·정보람) 전원 해당.
--
-- ★역할이 아니라 **일**로 봐야 한다 — 구역 담당은 `storage_zones.manager_id` 로 정해지고
--   그 사람의 `role` 은 제각각이다(OPERATOR 4명 · SALES 1명). 역할 기반 권한만으로는
--   「담당인데 못 들어가는」 사람이 계속 생긴다.
--   ⚠️ 그래도 **행 단위 게이트는 그대로다** — `canTouchZone` 이 남의 구역을 막고,
--      입고·확정도 담당 구역만 통과한다(`po-receive.ts` · `core.ts` 상태전이).
--      즉 페이지를 열어 줘도 **남의 자재는 못 건드린다**.
--
-- ⛔ DESIGNER 는 열지 않는다 — 명시적으로 0 인 행이 이미 있고(그 판단을 뒤집지 않는다),
--    디자이너는 자재를 받지 않는다.
--
-- 되돌리기: 아래 role 들의 행을 지우면 종전 상태.

-- ① SALES 도 구역 담당이 될 수 있다 (강지영 = 선명2)
INSERT OR IGNORE INTO role_page_permissions (role, page_key, can_access, can_edit)
VALUES ('SALES', '/storage-zones', 1, 1),
       ('SALES', '/receiving',     1, 1);

-- ② 품목 배정은 쓰기다 — OPERATOR 의 can_edit 를 연다.
--    (INSERT OR IGNORE 는 이미 있는 행을 건드리지 않으므로 UPDATE 로 따로 고친다)
UPDATE role_page_permissions
   SET can_edit = 1, updated_at = CURRENT_TIMESTAMP
 WHERE page_key = '/storage-zones' AND role IN ('OPERATOR', 'SALES') AND can_access = 1;

-- ③ 매입 후보 — 담당자가 자기 거래처 미등록 매입을 보게 한다(읽기만, 쓰기는 관리자).
INSERT OR IGNORE INTO role_page_permissions (role, page_key, can_access, can_edit)
VALUES ('OPERATOR', '/purchase-candidates', 1, 0),
       ('SALES',    '/purchase-candidates', 1, 0);
