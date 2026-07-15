-- 1) 오케이애드공사 06-30 입금 (06-28컷으로 누락분, 06-29주문 대응)
INSERT INTO payments (client_id,payment_date,amount,payment_method,reference_number,notes,created_by,entity_id)
VALUES (2103,'2026-06-30',10764600,'계좌이체','SMBANK-0630OK','통장 수금 이관 2026-06-30 (06-28컷 누락분)',5,2);
-- 2) 재현시스템(3756) 6월분만 동산청주(entity3) 이동, 1~5월 선명 유지
UPDATE order_billing_groups SET entity_id=3 WHERE order_id IN (SELECT id FROM orders WHERE client_id=3756 AND entity_id=2 AND order_date>='2026-06-01' AND notes LIKE '선명 이관%');
UPDATE orders SET entity_id=3 WHERE client_id=3756 AND entity_id=2 AND order_date>='2026-06-01' AND notes LIKE '선명 이관%';
-- 3) 동산청주(entity3)로 이동된 모든 주문 번호 E2-→E3-
UPDATE orders SET order_number='E3'||substr(order_number,3) WHERE entity_id=3 AND order_number LIKE 'E2-%';
