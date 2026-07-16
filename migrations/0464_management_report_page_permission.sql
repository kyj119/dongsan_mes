-- 0464: 경영진단 페이지 권한 등록 (0463은 origin/main designer_intakes 선점 → 0464로 재번호)
-- permission_pages: 페이지 마스터 (page_key = 라우트 경로). 선명(entity2) 2026 상반기 경영 현황 정적 스냅샷.
-- 설계/근거 = memory/project-sunmyung-item-import.md, docs/sunmyung-import/
INSERT OR IGNORE INTO permission_pages (page_key, page_label, page_section, page_icon, sort_order, is_active)
VALUES ('/management-report', '경영진단', '재무', 'fa-stethoscope', 250, 1);

-- ADMIN은 미들웨어에서 자동 전체 통과이나 매트릭스 노출·명시성을 위해 등록. MANAGER 열람 허용.
-- (role_page_permissions.page_key → permission_pages FK: 위 INSERT 선행 필수)
INSERT OR IGNORE INTO role_page_permissions (role, page_key, can_access)
VALUES ('ADMIN', '/management-report', 1),
       ('MANAGER', '/management-report', 1);
