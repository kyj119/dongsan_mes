-- 0461: 부문 관리 페이지 권한 등록
-- permission_pages: 페이지 마스터 (page_key = 라우트 경로). 설계: memory/design-departmental-pnl.md
INSERT OR IGNORE INTO permission_pages (page_key, page_label, page_section, page_icon, sort_order, is_active)
VALUES ('/departments', '부문 관리', '관리', 'fa-sitemap', 310, 1);

-- ADMIN은 미들웨어에서 자동 전체 통과이나 매트릭스 노출·명시성을 위해 등록. MANAGER 열람 허용.
INSERT OR IGNORE INTO role_page_permissions (role, page_key, can_access)
VALUES ('ADMIN', '/departments', 1),
       ('MANAGER', '/departments', 1);
