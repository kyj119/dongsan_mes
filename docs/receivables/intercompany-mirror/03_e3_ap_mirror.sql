-- ============================================================================
-- 03_e3_ap_mirror.sql  —  동산기획(청주, entity 3) 장부 · 선명 매입채무(AP) 미러
-- ----------------------------------------------------------------------------
-- 근거: 선명(entity 2) 장부의 동산기획(청주)(client 3757) 매출채권(AR) 미러.
--   선명 AR(2026-07-20 --remote 실측): order_billing_groups(client=3757) 월별 SUM,
--   payments/adjustments 0건 → 전액 미결제(입금 0 → 스냅샷만).
--     2026-05 18,482,200 + 2026-06 26,425,366 = 44,907,566
--   → 미러는 purchase_orders(supplier=선명 1271, entity 3) 월별 스냅샷으로 등록.
-- 기대 파생 AP(entity 3) = 44,907,566
-- prefix = 'ICM-AP-E3-'. 멱등: 재적용 전 99_rollback 선실행.
-- ============================================================================

INSERT INTO purchase_orders (po_number,supplier_id,status,order_date,total_amount,vat_amount,final_amount,notes,created_by,entity_id) VALUES ('ICM-AP-E3-2605',1271,'RECEIVED','2026-05-31',16802000,1680200,18482200,'관계사 미러 매입채무(선명 2026-05, 청주) [ICM]',5,3);
INSERT INTO purchase_order_items (po_id,item_id,item_name,quantity,received_quantity,unit,unit_price,amount,vat_included,sort_order) VALUES ((SELECT id FROM purchase_orders WHERE po_number='ICM-AP-E3-2605'),NULL,'관계사 매입채무(선명 2026-05, 청주)',1,1,'EA',16802000,16802000,1,0);

INSERT INTO purchase_orders (po_number,supplier_id,status,order_date,total_amount,vat_amount,final_amount,notes,created_by,entity_id) VALUES ('ICM-AP-E3-2606',1271,'RECEIVED','2026-06-30',24023060,2402306,26425366,'관계사 미러 매입채무(선명 2026-06, 청주) [ICM]',5,3);
INSERT INTO purchase_order_items (po_id,item_id,item_name,quantity,received_quantity,unit,unit_price,amount,vat_included,sort_order) VALUES ((SELECT id FROM purchase_orders WHERE po_number='ICM-AP-E3-2606'),NULL,'관계사 매입채무(선명 2026-06, 청주)',1,1,'EA',24023060,24023060,1,0);

-- ── 캐시 재계산 (clients.purchase_balance = supplier 1271 전역 파생 AP; 멱등) ──
-- ⚠️ 01_e1_ap_mirror.sql 과 동일 전역 캐시. 01+03 모두 적용 후 전역합 160,273,603.
--    법인별(entity1=115,366,037 / entity3=44,907,566) 표시 SSOT 는 verify.sql 파생값.
UPDATE clients SET purchase_balance =
  COALESCE((SELECT SUM(final_amount) FROM purchase_orders WHERE supplier_id=1271 AND status IN ('CONFIRMED','RECEIVED','PARTIAL_RECEIVED')),0)
  - COALESCE((SELECT SUM(amount) FROM purchase_payments WHERE supplier_id=1271),0)
  - COALESCE((SELECT SUM(amount) FROM purchase_adjustments WHERE supplier_id=1271),0),
  updated_at=CURRENT_TIMESTAMP
 WHERE id=1271;
