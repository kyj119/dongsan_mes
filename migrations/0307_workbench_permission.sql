-- 시안 검수 워크벤치(P1) 페이지 권한 등록
-- spec: docs/superpowers/specs/2026-06-11-web-canvas-ia-workbench.md
INSERT OR IGNORE INTO permission_pages
  (page_key, page_label, page_section, page_icon, sort_order)
VALUES
  ('/workbench', '시안 검수', '생산', 'fa-object-group', 86);

INSERT OR IGNORE INTO role_page_permissions (role, page_key, can_access)
VALUES
  ('ADMIN', '/workbench', 1),
  ('MANAGER', '/workbench', 1),
  ('DESIGNER', '/workbench', 1);
