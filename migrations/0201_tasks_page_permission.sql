-- 작업 큐 페이지 권한 등록 (#44)
INSERT OR IGNORE INTO permission_pages (page_key, page_label, page_section, page_icon, sort_order, is_active)
VALUES ('/tasks', '작업 큐', '시스템', 'fa-tasks', 300, 1);

-- ADMIN, MANAGER 역할에 자동 부여
INSERT OR IGNORE INTO role_page_permissions (role, page_key, can_access)
SELECT 'ADMIN', '/tasks', 1 WHERE EXISTS (SELECT 1 FROM permission_pages WHERE page_key = '/tasks');

INSERT OR IGNORE INTO role_page_permissions (role, page_key, can_access)
SELECT 'MANAGER', '/tasks', 1 WHERE EXISTS (SELECT 1 FROM permission_pages WHERE page_key = '/tasks');
