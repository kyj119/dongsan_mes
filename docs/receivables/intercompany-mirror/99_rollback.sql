-- ============================================================================
-- 99_rollback.sql  —  관계사 미러(ICM-) 전체 롤백
-- ----------------------------------------------------------------------------
-- 01/02/03 이 등록한 모든 미러 레코드를 prefix 기준 삭제 후 캐시 재계산.
-- FK 준수 위해 자식(items/billing_groups/payments) → 부모(orders/purchase_orders) 순.
-- 상대법인 client/supplier = 선명커뮤니케이션(1271). 미러 외 기존 1271 레코드
-- (entity 2 금액0 주문 3건)는 prefix 불일치로 건드리지 않음.
-- ============================================================================

-- ── AR 미러(02) 롤백 ──
DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE order_number LIKE 'ICM-AR-%');
DELETE FROM order_billing_groups WHERE order_id IN (SELECT id FROM orders WHERE order_number LIKE 'ICM-AR-%');
DELETE FROM orders WHERE order_number LIKE 'ICM-AR-%';

-- ── AP 미러(01/03) 롤백 ──
DELETE FROM purchase_order_items WHERE po_id IN (SELECT id FROM purchase_orders WHERE po_number LIKE 'ICM-AP-%');
DELETE FROM purchase_payments WHERE reference_number LIKE 'ICM-AP-%';
DELETE FROM purchase_orders WHERE po_number LIKE 'ICM-AP-%';

-- ── 캐시 재계산 (미러 삭제 후 → 1271 전역 파생 = 0) ──
UPDATE clients SET purchase_balance =
  COALESCE((SELECT SUM(final_amount) FROM purchase_orders WHERE supplier_id=1271 AND status IN ('CONFIRMED','RECEIVED','PARTIAL_RECEIVED')),0)
  - COALESCE((SELECT SUM(amount) FROM purchase_payments WHERE supplier_id=1271),0)
  - COALESCE((SELECT SUM(amount) FROM purchase_adjustments WHERE supplier_id=1271),0),
  balance =
  COALESCE((SELECT SUM(g.billed_amount) FROM order_billing_groups g JOIN orders o ON o.id=g.order_id WHERE o.client_id=1271 AND g.billing_status='BILLED' AND o.status!='CANCELLED'),0)
  - COALESCE((SELECT SUM(amount) FROM payments WHERE client_id=1271),0)
  - COALESCE((SELECT SUM(amount) FROM adjustments WHERE client_id=1271),0),
  updated_at=CURRENT_TIMESTAMP
 WHERE id=1271;
