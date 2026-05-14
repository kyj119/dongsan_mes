-- ============================================================================
-- Migration 0205 — Fix card-order status inconsistency (#48)
-- ----------------------------------------------------------------------------
-- One-time data fix: 13 cards stuck at PRINTING with SHIPPED orders,
-- 19 cards at PRINTING with PRINT_DONE orders.
-- ============================================================================

-- SHIPPED 주문의 PRINTING 카드 → PRINT_DONE + shipped_at 설정
UPDATE cards SET
  status = 'PRINT_DONE',
  shipped_at = COALESCE(shipped_at, CURRENT_TIMESTAMP),
  updated_at = CURRENT_TIMESTAMP
WHERE order_id IN (SELECT id FROM orders WHERE status = 'SHIPPED')
  AND status = 'PRINTING';

-- PRINT_DONE 주문의 PRINTING 카드 → PRINT_DONE
UPDATE cards SET
  status = 'PRINT_DONE',
  updated_at = CURRENT_TIMESTAMP
WHERE order_id IN (SELECT id FROM orders WHERE status = 'PRINT_DONE')
  AND status = 'PRINTING';
