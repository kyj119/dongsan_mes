-- 0443: '/workflow'(시스템 워크플로우) 페이지 폐기(2026-07-05) — permission_pages dead 행 제거
-- 페이지/라우트/사이드바는 이미 코드에서 제거 완료. role_page_permissions FK(page_key, ON DELETE CASCADE)
-- 참조 행도 0382 선례와 동일하게 명시적으로 함께 제거.

DELETE FROM role_page_permissions WHERE page_key = '/workflow';
DELETE FROM permission_pages WHERE page_key = '/workflow';
