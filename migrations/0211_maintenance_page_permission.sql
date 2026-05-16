-- #73: 정비 관리 페이지 권한 등록
INSERT OR IGNORE INTO permission_pages (page_key, page_label, page_section, page_icon, sort_order)
VALUES ('/maintenance', '정비 관리', '생산', 'fa-wrench', 35);

-- ADMIN, MANAGER 기본 권한 부여
INSERT OR IGNORE INTO role_page_permissions (role, page_key, can_access)
VALUES ('ADMIN', '/maintenance', 1), ('MANAGER', '/maintenance', 1);
