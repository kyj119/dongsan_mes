-- 0382: '생산 현황 보드'(/production-board) 페이지 완전 폐기
-- 운영 섹션의 중복 라벨('생산 현황') 보드 페이지 제거. 현장 카드(/cards)·생산 현황 대시보드(/production)로 대체.
-- 메뉴/라우트/페이지 파일은 코드에서 제거됨. 여기선 권한 row만 정리.

DELETE FROM permission_pages WHERE page_key = '/production-board';
DELETE FROM role_page_permissions WHERE page_key = '/production-board';
