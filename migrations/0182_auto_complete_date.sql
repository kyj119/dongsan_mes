-- Phase 3: 출고완료 지연 전이
-- 모든 카드 출고 후 배송방식에 따라 1~2일 후 자동 SHIPPED 전이
ALTER TABLE orders ADD COLUMN auto_complete_date TEXT;
CREATE INDEX idx_orders_auto_complete ON orders(auto_complete_date)
  WHERE auto_complete_date IS NOT NULL AND status = 'PRINT_DONE';
