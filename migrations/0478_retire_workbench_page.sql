-- 0478: /workbench(시안 검수) 페이지 은퇴 — /ia-editor 의 '시안 검수' 뷰로 흡수 (2026-07-28 Phase 7b)
--
-- 페이지·라우트·메뉴는 코드에서 제거됐다. 권한 행은 **삭제하지 않고 비활성화**한다:
--   · role_page_permissions 는 page_key FK ON DELETE CASCADE 라 permission_pages 를 지우면
--     역할별 설정(누가 접근 가능했는지)이 함께 소멸해 되돌릴 수 없다.
--   · is_active=0 이면 권한 관리 화면에서 사라지고, 되돌릴 땐 1 로 되돌리면 끝.
--
-- ⚠️ 접근 권한 자체는 /ia-editor 쪽을 쓴다(ADMIN·MANAGER·DESIGNER 모두 can_access=1 확인).
--    DESIGNER 는 /workbench 에서 can_edit=0 이었으나 /ia-editor 에선 can_edit=1 이다.
--    서버 PUT /api/workbench/match 는 원래 requireRole 에 DESIGNER 를 포함하므로
--    실질 권한 변화는 없고, UI 게이트만 열린다(의도된 변경).
--
-- 멱등: 이미 0이면 no-op. 행이 없어도 오류 아님.

UPDATE permission_pages SET is_active = 0 WHERE page_key = '/workbench';
