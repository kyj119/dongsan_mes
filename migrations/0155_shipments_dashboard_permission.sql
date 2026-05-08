-- 0155: 출고 대시보드 페이지 권한 등록
INSERT OR IGNORE INTO permission_pages (page_key, page_label, page_section, page_icon, sort_order)
VALUES ('/shipments-dashboard', '출고 대시보드', '운영', 'fa-clipboard-check', 65);

-- 모든 역할에 접근 허용
INSERT OR IGNORE INTO role_page_permissions (role, page_key, can_access)
VALUES ('ADMIN', '/shipments-dashboard', 1),
       ('MANAGER', '/shipments-dashboard', 1),
       ('OPERATOR', '/shipments-dashboard', 1);
