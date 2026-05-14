-- 작업 큐 페이지 권한 등록 (#44)
INSERT OR IGNORE INTO permission_pages (page_key, role) VALUES ('/tasks', 'ADMIN');
INSERT OR IGNORE INTO permission_pages (page_key, role) VALUES ('/tasks', 'MANAGER');
