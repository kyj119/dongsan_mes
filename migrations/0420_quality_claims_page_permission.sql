-- 0420: 품질/클레임/반품 페이지 권한 등록
-- 백엔드(routes/claims.ts·returns.ts, 마이그 0213/0214)는 완비되어 있었으나 소비 UI가 없어 미가동이던 것을 활성화.
INSERT OR IGNORE INTO permission_pages (page_key, page_label, page_section, page_icon, sort_order)
VALUES ('/quality', '품질/클레임', '운영', 'fa-triangle-exclamation', 68);

-- ADMIN/MANAGER 접근 허용 (해결·불량코드·반품상태 변경은 API가 requireRole로 추가 통제)
INSERT OR IGNORE INTO role_page_permissions (role, page_key, can_access)
VALUES ('ADMIN', '/quality', 1),
       ('MANAGER', '/quality', 1);
