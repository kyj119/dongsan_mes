-- 선명 8월 이관분 중 청주(entity 3) 귀속 거래처 이동 (2026-09-04)
-- 규칙 정본 = docs/sunmyung-import/14_cheongju_move.sql 의 거래처 11곳.
-- 재현시스템(3756)은 원단/청주가 동일 BRN 이라 종전과 같이 제외한다.
-- 8월에 새로 등장한 (청주) 표기 거래처는 넣지 않았다 - 귀속은 업무 판단이라 별도 확인.
UPDATE order_billing_groups SET entity_id = 3
 WHERE order_id IN (SELECT id FROM orders WHERE entity_id = 2 AND client_id IN (1986,2139,2300,2382,3762,3764,3768,3770,3771,3774,3775)
                     AND notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31');
UPDATE orders SET entity_id = 3
 WHERE entity_id = 2 AND client_id IN (1986,2139,2300,2382,3762,3764,3768,3770,3771,3774,3775)
   AND notes LIKE '선명 이관%' AND order_date BETWEEN '2026-08-01' AND '2026-08-31';
