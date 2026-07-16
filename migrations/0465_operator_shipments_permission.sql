-- 0465: /shipments-dashboard 흡수(③) — OPERATOR 에게 /shipments 페이지 접근 부여
-- 배경: 출고 '준비상태' 뷰를 /shipments 3번째 탭으로 흡수하며 /shipments-dashboard 사이드바 은퇴.
--   OPERATOR 는 기존 /shipments-dashboard(자체 권한 0155) 실사용자였으므로 동등 접근 보존 필요.
--   API 는 이미 requireAnyPagePermission('/shipments','/pack') 이고 OPERATOR 는 /pack 보유(0439)
--   → 이 부여는 페이지 로드만 열어줄 뿐 API 노출 확대 없음.
--   can_edit=1: 기존 대시보드에서 '출고 처리'(PATCH /shipments/:id/ship) 수행하던 것과 동등.
-- FK 안전: '/shipments' 는 permission_pages 에 존재(0137/0138).
-- 프론트: OPERATOR 는 /shipments 진입 시 '준비상태' 탭만 노출(택배사별 실행 탭 숨김, switchShipTab 게이팅).
INSERT OR IGNORE INTO role_page_permissions (role, page_key, can_access, can_edit)
VALUES ('OPERATOR', '/shipments', 1, 1);
