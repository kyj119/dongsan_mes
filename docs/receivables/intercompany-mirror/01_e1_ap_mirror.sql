-- ============================================================================
-- 01_e1_ap_mirror.sql  —  동산기획(entity 1) 장부 · 선명 매입채무(AP) 미러
-- ----------------------------------------------------------------------------
-- 근거: 선명(entity 2) 장부의 (주)동산기획(client 53) 매출채권(AR) 미러.
--   선명 AR(2026-07-20 --remote 실측):
--     billed(월별 order_billing_groups BILLED)  52,116,385
--     - 지급(payments 2026-06-10 통장수금)      18,296,476
--     - 조정(adjustments: 이월 -81,469,128 + 대사 -77,000 = -81,546,128)
--     = 파생잔액 115,366,037
--   → 미러는 "총 청구 133,662,513(이월 81,469,128 + 월별 52,116,385 + 대사 77,000)
--            − 지급 18,296,476 = 115,366,037" 구조로 등록(잔액+이력 동시 일치).
--   상대법인 supplier = 선명커뮤니케이션(1271), entity_id = 1.
-- 기대 파생 AP(entity 1) = 133,662,513 − 18,296,476 = 115,366,037
-- prefix = 'ICM-AP-E1-'  (Intercompany Mirror / AP / Entity1). 멱등: 재적용 전 99_rollback 선실행.
-- 컬럼셋 = docs/sunmyung-import (sm_p1_orders/sm_p2_opening/sm_p3_payments) 관례 준수.
-- ============================================================================

-- ── 월별 매입 스냅샷 (supplier=1271 선명, entity 1, status RECEIVED) ──
-- 이월 (2025-12-31, 선명 AR 전기이월 81,469,128 미러)
INSERT INTO purchase_orders (po_number,supplier_id,status,order_date,total_amount,vat_amount,final_amount,notes,created_by,entity_id) VALUES ('ICM-AP-E1-OPEN',1271,'RECEIVED','2025-12-31',81469128,0,81469128,'관계사 미러 매입채무(선명 AR 전기이월) [ICM]',5,1);
INSERT INTO purchase_order_items (po_id,item_id,item_name,quantity,received_quantity,unit,unit_price,amount,vat_included,sort_order) VALUES ((SELECT id FROM purchase_orders WHERE po_number='ICM-AP-E1-OPEN'),NULL,'관계사 매입채무 전기이월(선명, 2025년)',1,1,'EA',81469128,81469128,0,0);

INSERT INTO purchase_orders (po_number,supplier_id,status,order_date,total_amount,vat_amount,final_amount,notes,created_by,entity_id) VALUES ('ICM-AP-E1-2601',1271,'RECEIVED','2026-01-31',7681192,768120,8449312,'관계사 미러 매입채무(선명 2026-01) [ICM]',5,1);
INSERT INTO purchase_order_items (po_id,item_id,item_name,quantity,received_quantity,unit,unit_price,amount,vat_included,sort_order) VALUES ((SELECT id FROM purchase_orders WHERE po_number='ICM-AP-E1-2601'),NULL,'관계사 매입채무(선명 2026-01)',1,1,'EA',7681192,7681192,1,0);

INSERT INTO purchase_orders (po_number,supplier_id,status,order_date,total_amount,vat_amount,final_amount,notes,created_by,entity_id) VALUES ('ICM-AP-E1-2602',1271,'RECEIVED','2026-02-28',1546140,154614,1700754,'관계사 미러 매입채무(선명 2026-02) [ICM]',5,1);
INSERT INTO purchase_order_items (po_id,item_id,item_name,quantity,received_quantity,unit,unit_price,amount,vat_included,sort_order) VALUES ((SELECT id FROM purchase_orders WHERE po_number='ICM-AP-E1-2602'),NULL,'관계사 매입채무(선명 2026-02)',1,1,'EA',1546140,1546140,1,0);

INSERT INTO purchase_orders (po_number,supplier_id,status,order_date,total_amount,vat_amount,final_amount,notes,created_by,entity_id) VALUES ('ICM-AP-E1-2603',1271,'RECEIVED','2026-03-31',4996170,499617,5495787,'관계사 미러 매입채무(선명 2026-03) [ICM]',5,1);
INSERT INTO purchase_order_items (po_id,item_id,item_name,quantity,received_quantity,unit,unit_price,amount,vat_included,sort_order) VALUES ((SELECT id FROM purchase_orders WHERE po_number='ICM-AP-E1-2603'),NULL,'관계사 매입채무(선명 2026-03)',1,1,'EA',4996170,4996170,1,0);

INSERT INTO purchase_orders (po_number,supplier_id,status,order_date,total_amount,vat_amount,final_amount,notes,created_by,entity_id) VALUES ('ICM-AP-E1-2604',1271,'RECEIVED','2026-04-30',17788784,1778878,19567662,'관계사 미러 매입채무(선명 2026-04) [ICM]',5,1);
INSERT INTO purchase_order_items (po_id,item_id,item_name,quantity,received_quantity,unit,unit_price,amount,vat_included,sort_order) VALUES ((SELECT id FROM purchase_orders WHERE po_number='ICM-AP-E1-2604'),NULL,'관계사 매입채무(선명 2026-04)',1,1,'EA',17788784,17788784,1,0);

INSERT INTO purchase_orders (po_number,supplier_id,status,order_date,total_amount,vat_amount,final_amount,notes,created_by,entity_id) VALUES ('ICM-AP-E1-2605',1271,'RECEIVED','2026-05-31',13378525,1337853,14716378,'관계사 미러 매입채무(선명 2026-05) [ICM]',5,1);
INSERT INTO purchase_order_items (po_id,item_id,item_name,quantity,received_quantity,unit,unit_price,amount,vat_included,sort_order) VALUES ((SELECT id FROM purchase_orders WHERE po_number='ICM-AP-E1-2605'),NULL,'관계사 매입채무(선명 2026-05)',1,1,'EA',13378525,13378525,1,0);

INSERT INTO purchase_orders (po_number,supplier_id,status,order_date,total_amount,vat_amount,final_amount,notes,created_by,entity_id) VALUES ('ICM-AP-E1-2606',1271,'RECEIVED','2026-06-30',1987720,198772,2186492,'관계사 미러 매입채무(선명 2026-06) [ICM]',5,1);
INSERT INTO purchase_order_items (po_id,item_id,item_name,quantity,received_quantity,unit,unit_price,amount,vat_included,sort_order) VALUES ((SELECT id FROM purchase_orders WHERE po_number='ICM-AP-E1-2606'),NULL,'관계사 매입채무(선명 2026-06)',1,1,'EA',1987720,1987720,1,0);

-- 대사조정 미세차 77,000 (선명 AR adjustments OTHER -77,000 미러; 채무 가산분을 스냅샷으로 표현)
INSERT INTO purchase_orders (po_number,supplier_id,status,order_date,total_amount,vat_amount,final_amount,notes,created_by,entity_id) VALUES ('ICM-AP-E1-RECON',1271,'RECEIVED','2026-06-30',77000,0,77000,'관계사 미러 매입채무 대사조정(선명 채권대사 미세차) [ICM]',5,1);
INSERT INTO purchase_order_items (po_id,item_id,item_name,quantity,received_quantity,unit,unit_price,amount,vat_included,sort_order) VALUES ((SELECT id FROM purchase_orders WHERE po_number='ICM-AP-E1-RECON'),NULL,'관계사 매입채무 대사조정(선명)',1,1,'EA',77000,77000,0,0);

-- ── 지급 미러 (선명 통장수금 2026-06-10 = 동산 채무 지급) ──
INSERT INTO purchase_payments (supplier_id,payment_date,amount,payment_method,reference_number,po_id,notes,created_by,entity_id) VALUES (1271,'2026-06-10',18296476,'계좌이체','ICM-AP-E1-PAY',NULL,'관계사 미러 지급(선명 통장수금 미러) [ICM]',5,1);

-- ── 캐시 재계산 (clients.purchase_balance = supplier 1271 전역 파생 AP; 멱등) ──
-- ⚠️ purchase_balance 는 법인 비분리 전역 캐시. 선명(1271)은 entity1+entity3 양쪽에서
--    채무가 쌓이므로 전역합(= 01 적용 후 115,366,037, 03 추가 적용 후 160,273,603)으로 세팅.
--    법인별 표시 SSOT 는 verify.sql 의 entity-scoped 파생값.
UPDATE clients SET purchase_balance =
  COALESCE((SELECT SUM(final_amount) FROM purchase_orders WHERE supplier_id=1271 AND status IN ('CONFIRMED','RECEIVED','PARTIAL_RECEIVED')),0)
  - COALESCE((SELECT SUM(amount) FROM purchase_payments WHERE supplier_id=1271),0)
  - COALESCE((SELECT SUM(amount) FROM purchase_adjustments WHERE supplier_id=1271),0),
  updated_at=CURRENT_TIMESTAMP
 WHERE id=1271;
