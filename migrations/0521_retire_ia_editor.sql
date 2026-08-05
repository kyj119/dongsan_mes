-- /ia-editor 폐기 — 페이지 권한 제거 (S4)
-- spec: docs/superpowers/specs/2026-08-05-ia-editor-sunset.md §2.1
--
-- 웹 모아찍기가 하던 일을 재단 CEP 패널이 더 정확히 한다(true-shape 네스팅·칼선·도련·맞붙임).
-- 시안 검수 뷰도 함께 폐기 결정(2026-08-05).
-- ⚠️ designer_intakes 는 건드리지 않는다 — mode='single' 을 주문서 트레이가 쓴다(참조 57곳).
--    폐기 대상은 mode IN ('impose','both') **경로**뿐이고, 기존 행은 이력으로 남긴다.
DELETE FROM role_page_permissions WHERE page_key = '/ia-editor';
DELETE FROM permission_pages WHERE page_key = '/ia-editor';
