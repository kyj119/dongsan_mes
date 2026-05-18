-- 0226: 생산 현황 보드 페이지 권한 등록
INSERT OR IGNORE INTO permission_pages (page_key, page_label, page_section, page_icon, is_active)
VALUES ('/production-board', '생산 현황 보드', '운영', 'fa-tv', 1);

INSERT OR IGNORE INTO role_page_permissions (role, page_key, can_access)
VALUES
  ('ADMIN', '/production-board', 1),
  ('MANAGER', '/production-board', 1),
  ('DESIGNER', '/production-board', 1),
  ('OPERATOR', '/production-board', 1);
