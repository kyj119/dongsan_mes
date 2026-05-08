-- /kakao → /messages 변경 (FK 제약 순서 고려)

-- 1단계: /messages 행을 먼저 upsert (없으면 삽입, 있으면 유지)
INSERT OR IGNORE INTO permission_pages (page_key, page_label, page_section, sort_order, is_active)
SELECT '/messages', page_label, page_section, sort_order, is_active
FROM permission_pages WHERE page_key = '/kakao';

-- /kakao 가 없었던 경우 기본값으로 삽입
INSERT OR IGNORE INTO permission_pages (page_key, page_label, page_section, sort_order, is_active)
VALUES ('/messages', '메시지 관리', '관리', 95, 1);

-- 표시명 최신화
UPDATE permission_pages SET page_label = '메시지 관리' WHERE page_key = '/messages';

-- 2단계: role_page_permissions를 /messages 로 이전
INSERT OR IGNORE INTO role_page_permissions (role, page_key, can_access, updated_by)
SELECT role, '/messages', can_access, updated_by FROM role_page_permissions WHERE page_key = '/kakao';

-- 3단계: 구 /kakao 데이터 삭제 (CASCADE로 role_page_permissions도 정리)
DELETE FROM role_page_permissions WHERE page_key = '/kakao';
DELETE FROM permission_pages WHERE page_key = '/kakao';
