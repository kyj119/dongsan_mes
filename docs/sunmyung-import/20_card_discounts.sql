-- 공간/투데이/정그래픽/가로림 카드결제 + 할인 (수금누락 반영, 기존 중복 제외)
INSERT INTO payments (client_id,payment_date,amount,payment_method,reference_number,notes,created_by,entity_id) VALUES (311,'2026-04-14',2500000,'카드','SMCARD2-01','카드결제 2026-04-14 (선명 이관)',5,2);
INSERT INTO payments (client_id,payment_date,amount,payment_method,reference_number,notes,created_by,entity_id) VALUES (311,'2026-06-09',2000000,'카드','SMCARD2-02','카드결제 2026-06-09 (선명 이관)',5,2);
INSERT INTO payments (client_id,payment_date,amount,payment_method,reference_number,notes,created_by,entity_id) VALUES (311,'2026-06-30',1939620,'카드','SMCARD2-03','카드결제 2026-06-30 (선명 이관)',5,2);
INSERT INTO payments (client_id,payment_date,amount,payment_method,reference_number,notes,created_by,entity_id) VALUES (2404,'2026-03-13',750000,'카드','SMCARD2-04','카드결제 2026-03-13 (선명 이관)',5,2);
INSERT INTO payments (client_id,payment_date,amount,payment_method,reference_number,notes,created_by,entity_id) VALUES (2404,'2026-05-14',2400000,'카드','SMCARD2-05','카드결제 2026-05-14 (선명 이관)',5,2);
INSERT INTO payments (client_id,payment_date,amount,payment_method,reference_number,notes,created_by,entity_id) VALUES (1917,'2026-03-30',1000000,'카드','SMCARD2-06','카드결제 2026-03-30 (선명 이관)',5,2);
INSERT INTO payments (client_id,payment_date,amount,payment_method,reference_number,notes,created_by,entity_id) VALUES (1917,'2026-04-13',1000000,'카드','SMCARD2-07','카드결제 2026-04-13 (선명 이관)',5,2);
INSERT INTO payments (client_id,payment_date,amount,payment_method,reference_number,notes,created_by,entity_id) VALUES (1917,'2026-06-30',1200000,'카드','SMCARD2-08','카드결제 2026-06-30 (선명 이관)',5,2);
INSERT INTO payments (client_id,payment_date,amount,payment_method,reference_number,notes,created_by,entity_id) VALUES (228,'2026-05-11',1400000,'카드','SMCARD2-09','카드결제 2026-05-11 (선명 이관)',5,2);
INSERT INTO payments (client_id,payment_date,amount,payment_method,reference_number,notes,created_by,entity_id) VALUES (228,'2026-06-08',670000,'카드','SMCARD2-10','카드결제 2026-06-08 (선명 이관)',5,2);
INSERT INTO adjustments (client_id,order_id,type,amount,reason,created_by,entity_id,created_at) VALUES (2404,NULL,'DISCOUNT',59360,'할인 2026-05-14 (선명 이관)',5,2,'2026-05-14 00:00:00');
INSERT INTO adjustments (client_id,order_id,type,amount,reason,created_by,entity_id,created_at) VALUES (228,NULL,'DISCOUNT',1080,'할인 2026-06-08 (선명 이관)',5,2,'2026-06-08 00:00:00');
