-- 0374: 회계 통합 관리 허브 페이지 권한 등록 (회계 허브 Phase 1)
-- spec: docs/superpowers/specs/2026-06-23-accounting-hub.md (Phase 1)
-- /accounting = 입금·세금계산서·현금영수증·카드·매입 통합 조회·정정 허브 (경리/회계담당 ADMIN/MANAGER).
-- 비파괴/additive. INSERT OR IGNORE (멱등).

INSERT OR IGNORE INTO permission_pages (page_key, page_label, page_section, page_icon, sort_order, is_active)
VALUES ('/accounting', '회계 허브', '재무', 'fa-coins', 300, 1);

INSERT OR IGNORE INTO role_page_permissions (role, page_key, can_access)
SELECT 'ADMIN', '/accounting', 1 WHERE EXISTS (SELECT 1 FROM permission_pages WHERE page_key = '/accounting');

INSERT OR IGNORE INTO role_page_permissions (role, page_key, can_access)
SELECT 'MANAGER', '/accounting', 1 WHERE EXISTS (SELECT 1 FROM permission_pages WHERE page_key = '/accounting');
