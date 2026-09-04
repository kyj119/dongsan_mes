-- 22: 청주(entity 3) 귀속 거래처 추가 이동 — 8월 이관에서 새로 등장 (2026-09-04)
--
-- 판정 기준 = **담당자 최인호**. 이름의 (청주) 표기보다 정확하다:
--   7월 실측 — 최인호 담당 48건이 **전부 E3**, E2 에는 0건. 8월에도 E3 30건 중 29건이 최인호.
--   반려인(청주)는 7월 주문이 이미 E3 인데 종전 11곳 목록엔 없었다 = 목록이 뒤쳐져 있었다.
--
-- 대상 6곳 (14_cheongju_move.sql 의 11곳에 더한다):
--   3883 반려인(청주) · 3989 가나테크(청주) · 3991 선기획(청주)
--   3992 365안전(청주) · 3995 제일미디어(청주) · 1297 성진 현수막출력센터
--
-- 제외 유지: 재현 시스템(원단) — 원단/청주가 동일 BRN 이라 14_ 에서 이미 의도적 제외.
--
-- ⚠️ 반드시 `notes LIKE '선명 이관%'` + `entity_id = 2` 로 스코프한다.
--    성진 현수막출력센터(1297)는 **동산(E1)에도 12건 1,200만원**이 있다 — 스코프를 빼면 그게 딸려 온다.
UPDATE order_billing_groups SET entity_id = 3
 WHERE order_id IN (SELECT id FROM orders WHERE entity_id = 2
                      AND client_id IN (3883,3989,3991,3992,3995,1297) AND notes LIKE '선명 이관%');
UPDATE orders SET entity_id = 3
 WHERE entity_id = 2 AND client_id IN (3883,3989,3991,3992,3995,1297) AND notes LIKE '선명 이관%';
UPDATE payments SET entity_id = 3 WHERE entity_id = 2 AND client_id IN (3883,3989,3991,3992,3995,1297);
UPDATE adjustments SET entity_id = 3 WHERE entity_id = 2 AND client_id IN (3883,3989,3991,3992,3995,1297);
