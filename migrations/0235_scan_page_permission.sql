-- #80: QR/바코드 스캔 페이지 권한 등록
INSERT OR IGNORE INTO permission_pages
  (page_key, page_label, page_section, page_icon, sort_order)
VALUES
  ('/scan', 'QR 스캔', '생산', 'fa-qrcode', 85);

INSERT OR IGNORE INTO role_page_permissions (role, page_key, can_access)
VALUES
  ('ADMIN', '/scan', 1),
  ('MANAGER', '/scan', 1),
  ('OPERATOR', '/scan', 1);
