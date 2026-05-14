-- 근로계약 페이지 권한 등록
INSERT OR IGNORE INTO permission_pages (page_key, page_label, page_section, page_icon, sort_order, is_active)
VALUES ('/labor-contracts', '근로계약', '인사', 'fa-file-contract', 62, 1);

-- ADMIN 역할에 자동 부여
INSERT OR IGNORE INTO role_page_permissions (role, page_key, can_access)
SELECT 'ADMIN', '/labor-contracts', 1 WHERE EXISTS (SELECT 1 FROM permission_pages WHERE page_key = '/labor-contracts');

INSERT OR IGNORE INTO role_page_permissions (role, page_key, can_access)
SELECT 'MANAGER', '/labor-contracts', 1 WHERE EXISTS (SELECT 1 FROM permission_pages WHERE page_key = '/labor-contracts');
