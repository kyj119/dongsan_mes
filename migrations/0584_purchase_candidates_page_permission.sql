-- 0584: 매입 후보 페이지 권한 등록
--
-- 왜 (2026-09-07): 발주 등록이 동산 08-06 · 선명 07-31 이후 0건이라 재고가 나가기만 한다
--   (선명 재고 228행 중 28행 음수). 통장 출금에서 매입 후보를 띄워 **빠뜨릴 수 없게** 만든다.
--   판정 규칙 정본 = `src/utils/apCandidate.ts` (게이트 `npm run test:ap-candidate`).
--
-- permission_pages 가 먼저다 — role_page_permissions.page_key 가 이걸 참조한다(FK).
INSERT OR IGNORE INTO permission_pages (page_key, page_label, page_section, page_icon, sort_order, is_active)
VALUES ('/purchase-candidates', '매입 후보', '구매', 'fa-magnifying-glass-dollar', 155, 1);

-- ADMIN 은 미들웨어에서 자동 통과하나 매트릭스 노출·명시성을 위해 등록. MANAGER 열람 허용.
INSERT OR IGNORE INTO role_page_permissions (role, page_key, can_access)
VALUES ('ADMIN', '/purchase-candidates', 1),
       ('MANAGER', '/purchase-candidates', 1);
