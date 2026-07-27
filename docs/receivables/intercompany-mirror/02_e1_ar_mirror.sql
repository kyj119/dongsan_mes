-- ============================================================================
-- 02_e1_ar_mirror.sql  —  동산기획(entity 1) 장부 · 선명 매출채권(AR) 미러
-- ----------------------------------------------------------------------------
-- 근거: 선명(entity 2) 장부의 (주)동산기획(supplier 53) 매입채무(AP) 미러.
--   선명 AP(2026-07-20 --remote 실측): purchase_orders(supplier=53) 월별 SUM,
--   purchase_payments/purchase_adjustments 는 0건 → 전액 미결제.
--     이월(2025-12) 112,696,659 + 2026-01~06 6,459,893 = 119,156,552
--   → 미러는 orders + order_billing_groups(BILLED) 월별 스냅샷으로 등록.
--     상대법인 client = 선명커뮤니케이션(1271), entity_id = 1.
--     지급/감액 미러 없음(원장 무결). 파생 AR = billed − 0 − 0.
-- 기대 파생 AR(entity 1) = 119,156,552
-- prefix = 'ICM-AR-E1-'. 멱등: 재적용 전 99_rollback 선실행.
-- 컬럼셋 = docs/sunmyung-import/13_invoice_orders.sql 관례 준수.
-- ============================================================================

-- 이월 (2025-12-31, 선명 AP 기초채무 112,696,659 미러 = 동산 AR 전기이월)
INSERT INTO orders (order_number,client_id,entity_id,order_date,status,order_type,total_amount,vat_amount,final_amount,created_by,notes,billing_status,billed_amount,billed_by,billed_at,accounting_date,created_at) VALUES ('ICM-AR-E1-OPEN',1271,1,'2025-12-31','SHIPPED','PRODUCTION',112696659,0,112696659,5,'관계사 미러 매출채권(선명 AP 전기이월) [ICM]','BILLED',112696659,5,'2025-12-31 09:00:00','2025-12-31','2025-12-31 09:00:00');
INSERT INTO order_billing_groups (order_id,entity_id,billing_status,billed_amount,supply_amount,tax_amount,billed_at,billed_by,accounting_date,created_at) VALUES ((SELECT id FROM orders WHERE order_number='ICM-AR-E1-OPEN' AND entity_id=1),1,'BILLED',112696659,112696659,0,'2025-12-31',5,'2025-12-31','2025-12-31 09:00:00');
INSERT INTO order_items (order_id,item_id,item_name,quantity,unit,unit_price,amount,vat_included) VALUES ((SELECT id FROM orders WHERE order_number='ICM-AR-E1-OPEN' AND entity_id=1),NULL,'관계사 매출채권 전기이월(선명, 2025년)',1,'EA',112696659,112696659,0);

INSERT INTO orders (order_number,client_id,entity_id,order_date,status,order_type,total_amount,vat_amount,final_amount,created_by,notes,billing_status,billed_amount,billed_by,billed_at,accounting_date,created_at) VALUES ('ICM-AR-E1-2601',1271,1,'2026-01-31','SHIPPED','PRODUCTION',338580,33858,372438,5,'관계사 미러 매출채권(선명 2026-01) [ICM]','BILLED',372438,5,'2026-01-31 09:00:00','2026-01-31','2026-01-31 09:00:00');
INSERT INTO order_billing_groups (order_id,entity_id,billing_status,billed_amount,supply_amount,tax_amount,billed_at,billed_by,accounting_date,created_at) VALUES ((SELECT id FROM orders WHERE order_number='ICM-AR-E1-2601' AND entity_id=1),1,'BILLED',372438,338580,33858,'2026-01-31',5,'2026-01-31','2026-01-31 09:00:00');
INSERT INTO order_items (order_id,item_id,item_name,quantity,unit,unit_price,amount,vat_included) VALUES ((SELECT id FROM orders WHERE order_number='ICM-AR-E1-2601' AND entity_id=1),NULL,'관계사 매출채권(선명 2026-01)',1,'EA',338580,338580,1);

INSERT INTO orders (order_number,client_id,entity_id,order_date,status,order_type,total_amount,vat_amount,final_amount,created_by,notes,billing_status,billed_amount,billed_by,billed_at,accounting_date,created_at) VALUES ('ICM-AR-E1-2602',1271,1,'2026-02-28','SHIPPED','PRODUCTION',274750,27475,302225,5,'관계사 미러 매출채권(선명 2026-02) [ICM]','BILLED',302225,5,'2026-02-28 09:00:00','2026-02-28','2026-02-28 09:00:00');
INSERT INTO order_billing_groups (order_id,entity_id,billing_status,billed_amount,supply_amount,tax_amount,billed_at,billed_by,accounting_date,created_at) VALUES ((SELECT id FROM orders WHERE order_number='ICM-AR-E1-2602' AND entity_id=1),1,'BILLED',302225,274750,27475,'2026-02-28',5,'2026-02-28','2026-02-28 09:00:00');
INSERT INTO order_items (order_id,item_id,item_name,quantity,unit,unit_price,amount,vat_included) VALUES ((SELECT id FROM orders WHERE order_number='ICM-AR-E1-2602' AND entity_id=1),NULL,'관계사 매출채권(선명 2026-02)',1,'EA',274750,274750,1);

INSERT INTO orders (order_number,client_id,entity_id,order_date,status,order_type,total_amount,vat_amount,final_amount,created_by,notes,billing_status,billed_amount,billed_by,billed_at,accounting_date,created_at) VALUES ('ICM-AR-E1-2603',1271,1,'2026-03-31','SHIPPED','PRODUCTION',678600,67860,746460,5,'관계사 미러 매출채권(선명 2026-03) [ICM]','BILLED',746460,5,'2026-03-31 09:00:00','2026-03-31','2026-03-31 09:00:00');
INSERT INTO order_billing_groups (order_id,entity_id,billing_status,billed_amount,supply_amount,tax_amount,billed_at,billed_by,accounting_date,created_at) VALUES ((SELECT id FROM orders WHERE order_number='ICM-AR-E1-2603' AND entity_id=1),1,'BILLED',746460,678600,67860,'2026-03-31',5,'2026-03-31','2026-03-31 09:00:00');
INSERT INTO order_items (order_id,item_id,item_name,quantity,unit,unit_price,amount,vat_included) VALUES ((SELECT id FROM orders WHERE order_number='ICM-AR-E1-2603' AND entity_id=1),NULL,'관계사 매출채권(선명 2026-03)',1,'EA',678600,678600,1);

INSERT INTO orders (order_number,client_id,entity_id,order_date,status,order_type,total_amount,vat_amount,final_amount,created_by,notes,billing_status,billed_amount,billed_by,billed_at,accounting_date,created_at) VALUES ('ICM-AR-E1-2604',1271,1,'2026-04-30','SHIPPED','PRODUCTION',1724850,172485,1897335,5,'관계사 미러 매출채권(선명 2026-04) [ICM]','BILLED',1897335,5,'2026-04-30 09:00:00','2026-04-30','2026-04-30 09:00:00');
INSERT INTO order_billing_groups (order_id,entity_id,billing_status,billed_amount,supply_amount,tax_amount,billed_at,billed_by,accounting_date,created_at) VALUES ((SELECT id FROM orders WHERE order_number='ICM-AR-E1-2604' AND entity_id=1),1,'BILLED',1897335,1724850,172485,'2026-04-30',5,'2026-04-30','2026-04-30 09:00:00');
INSERT INTO order_items (order_id,item_id,item_name,quantity,unit,unit_price,amount,vat_included) VALUES ((SELECT id FROM orders WHERE order_number='ICM-AR-E1-2604' AND entity_id=1),NULL,'관계사 매출채권(선명 2026-04)',1,'EA',1724850,1724850,1);

INSERT INTO orders (order_number,client_id,entity_id,order_date,status,order_type,total_amount,vat_amount,final_amount,created_by,notes,billing_status,billed_amount,billed_by,billed_at,accounting_date,created_at) VALUES ('ICM-AR-E1-2605',1271,1,'2026-05-31','SHIPPED','PRODUCTION',2249000,224900,2473900,5,'관계사 미러 매출채권(선명 2026-05) [ICM]','BILLED',2473900,5,'2026-05-31 09:00:00','2026-05-31','2026-05-31 09:00:00');
INSERT INTO order_billing_groups (order_id,entity_id,billing_status,billed_amount,supply_amount,tax_amount,billed_at,billed_by,accounting_date,created_at) VALUES ((SELECT id FROM orders WHERE order_number='ICM-AR-E1-2605' AND entity_id=1),1,'BILLED',2473900,2249000,224900,'2026-05-31',5,'2026-05-31','2026-05-31 09:00:00');
INSERT INTO order_items (order_id,item_id,item_name,quantity,unit,unit_price,amount,vat_included) VALUES ((SELECT id FROM orders WHERE order_number='ICM-AR-E1-2605' AND entity_id=1),NULL,'관계사 매출채권(선명 2026-05)',1,'EA',2249000,2249000,1);

INSERT INTO orders (order_number,client_id,entity_id,order_date,status,order_type,total_amount,vat_amount,final_amount,created_by,notes,billing_status,billed_amount,billed_by,billed_at,accounting_date,created_at) VALUES ('ICM-AR-E1-2606',1271,1,'2026-06-30','SHIPPED','PRODUCTION',613850,53685,667535,5,'관계사 미러 매출채권(선명 2026-06) [ICM]','BILLED',667535,5,'2026-06-30 09:00:00','2026-06-30','2026-06-30 09:00:00');
INSERT INTO order_billing_groups (order_id,entity_id,billing_status,billed_amount,supply_amount,tax_amount,billed_at,billed_by,accounting_date,created_at) VALUES ((SELECT id FROM orders WHERE order_number='ICM-AR-E1-2606' AND entity_id=1),1,'BILLED',667535,613850,53685,'2026-06-30',5,'2026-06-30','2026-06-30 09:00:00');
INSERT INTO order_items (order_id,item_id,item_name,quantity,unit,unit_price,amount,vat_included) VALUES ((SELECT id FROM orders WHERE order_number='ICM-AR-E1-2606' AND entity_id=1),NULL,'관계사 매출채권(선명 2026-06)',1,'EA',613850,613850,1);

-- ── 캐시 재계산 (clients.balance = client 1271 전역 파생 AR; 멱등, 레거시 캐시) ──
-- AR 정본은 deriveClientBalance(파생). clients.balance 는 레거시 전역 캐시지만
-- 정합성 점검 일관성을 위해 전역 파생값(=entity1 미러 119,156,552)으로 세팅.
UPDATE clients SET balance =
  COALESCE((SELECT SUM(g.billed_amount) FROM order_billing_groups g JOIN orders o ON o.id=g.order_id WHERE o.client_id=1271 AND g.billing_status='BILLED' AND o.status!='CANCELLED'),0)
  - COALESCE((SELECT SUM(amount) FROM payments WHERE client_id=1271),0)
  - COALESCE((SELECT SUM(amount) FROM adjustments WHERE client_id=1271),0),
  updated_at=CURRENT_TIMESTAMP
 WHERE id=1271;
