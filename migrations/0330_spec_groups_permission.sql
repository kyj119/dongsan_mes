-- 0330: 규격그룹 관리 페이지 권한 등록 (품목 대개편 Phase 2)
-- spec: docs/superpowers/specs/2026-06-20-spec-group-variant-item-plan.md §5
-- /spec-groups = 규격그룹(호수·판재두께·원단폭) + 값 self-service 관리 페이지.
-- 비파괴/additive. INSERT OR IGNORE (멱등).

INSERT OR IGNORE INTO permission_pages (page_key, page_label, page_section, page_icon, sort_order, is_active)
VALUES ('/spec-groups', '규격그룹 관리', '기준정보', 'fa-layer-group', 246, 1);

INSERT OR IGNORE INTO role_page_permissions (role, page_key, can_access)
SELECT 'ADMIN', '/spec-groups', 1 WHERE EXISTS (SELECT 1 FROM permission_pages WHERE page_key = '/spec-groups');

INSERT OR IGNORE INTO role_page_permissions (role, page_key, can_access)
SELECT 'MANAGER', '/spec-groups', 1 WHERE EXISTS (SELECT 1 FROM permission_pages WHERE page_key = '/spec-groups');
