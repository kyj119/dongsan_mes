-- /ia-editor 페이지 권한 등록 (IA 편집·네스팅·접수 워크벤치 P1a)
-- spec: docs/superpowers/specs/2026-06-16-ia-editor-nesting-intake.md §0 D1·§9 P1
INSERT OR IGNORE INTO permission_pages
  (page_key, page_label, page_section, page_icon, sort_order)
VALUES
  ('/ia-editor', 'IA 편집기', '생산', 'fa-layer-group', 87);

INSERT OR IGNORE INTO role_page_permissions (role, page_key, can_access)
VALUES
  ('ADMIN', '/ia-editor', 1),
  ('MANAGER', '/ia-editor', 1),
  ('DESIGNER', '/ia-editor', 1);
