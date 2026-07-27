-- ============================================================================
-- verify.sql  —  관계사 미러 파생 잔액 검증 (읽기 전용 SELECT)
-- ----------------------------------------------------------------------------
-- 앱 SSOT 와 동일한 entity-scoped 파생식으로 3개 잔액을 재계산해 기대값과 대조.
--   ①/③ AP  = deriveSupplier(ledger/accounts-payable purchase-integrity-check 식)
--             SUM(po.final status∈CONFIRMED/RECEIVED/PARTIAL_RECEIVED) − ppay − padj
--   ②   AR  = deriveClientBalance(ledger/ar-helpers 식)
--             SUM(g.billed BILLED, order≠CANCELLED) − pay − adj
-- PASS 3개 = 미러 정상.
-- ============================================================================
SELECT '① E1 AP (선명 매입채무)' AS item, 115366037 AS expected,
  ( COALESCE((SELECT SUM(final_amount) FROM purchase_orders WHERE supplier_id=1271 AND entity_id=1 AND status IN ('CONFIRMED','RECEIVED','PARTIAL_RECEIVED')),0)
  - COALESCE((SELECT SUM(amount) FROM purchase_payments WHERE supplier_id=1271 AND entity_id=1),0)
  - COALESCE((SELECT SUM(amount) FROM purchase_adjustments WHERE supplier_id=1271 AND entity_id=1),0) ) AS actual,
  CASE WHEN ( COALESCE((SELECT SUM(final_amount) FROM purchase_orders WHERE supplier_id=1271 AND entity_id=1 AND status IN ('CONFIRMED','RECEIVED','PARTIAL_RECEIVED')),0)
  - COALESCE((SELECT SUM(amount) FROM purchase_payments WHERE supplier_id=1271 AND entity_id=1),0)
  - COALESCE((SELECT SUM(amount) FROM purchase_adjustments WHERE supplier_id=1271 AND entity_id=1),0) ) = 115366037 THEN 'PASS' ELSE 'FAIL' END AS result
UNION ALL
SELECT '② E1 AR (선명 매출채권)' AS item, 119156552 AS expected,
  ( COALESCE((SELECT SUM(g.billed_amount) FROM order_billing_groups g JOIN orders o ON o.id=g.order_id WHERE o.client_id=1271 AND g.entity_id=1 AND g.billing_status='BILLED' AND o.status!='CANCELLED'),0)
  - COALESCE((SELECT SUM(amount) FROM payments WHERE client_id=1271 AND entity_id=1),0)
  - COALESCE((SELECT SUM(amount) FROM adjustments WHERE client_id=1271 AND entity_id=1),0) ) AS actual,
  CASE WHEN ( COALESCE((SELECT SUM(g.billed_amount) FROM order_billing_groups g JOIN orders o ON o.id=g.order_id WHERE o.client_id=1271 AND g.entity_id=1 AND g.billing_status='BILLED' AND o.status!='CANCELLED'),0)
  - COALESCE((SELECT SUM(amount) FROM payments WHERE client_id=1271 AND entity_id=1),0)
  - COALESCE((SELECT SUM(amount) FROM adjustments WHERE client_id=1271 AND entity_id=1),0) ) = 119156552 THEN 'PASS' ELSE 'FAIL' END AS result
UNION ALL
SELECT '③ E3 AP (선명 매입채무·청주)' AS item, 44907566 AS expected,
  ( COALESCE((SELECT SUM(final_amount) FROM purchase_orders WHERE supplier_id=1271 AND entity_id=3 AND status IN ('CONFIRMED','RECEIVED','PARTIAL_RECEIVED')),0)
  - COALESCE((SELECT SUM(amount) FROM purchase_payments WHERE supplier_id=1271 AND entity_id=3),0)
  - COALESCE((SELECT SUM(amount) FROM purchase_adjustments WHERE supplier_id=1271 AND entity_id=3),0) ) AS actual,
  CASE WHEN ( COALESCE((SELECT SUM(final_amount) FROM purchase_orders WHERE supplier_id=1271 AND entity_id=3 AND status IN ('CONFIRMED','RECEIVED','PARTIAL_RECEIVED')),0)
  - COALESCE((SELECT SUM(amount) FROM purchase_payments WHERE supplier_id=1271 AND entity_id=3),0)
  - COALESCE((SELECT SUM(amount) FROM purchase_adjustments WHERE supplier_id=1271 AND entity_id=3),0) ) = 44907566 THEN 'PASS' ELSE 'FAIL' END AS result;
