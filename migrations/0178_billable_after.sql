-- billable_after: 정산 가능일 (출고 확정 시 배송방법에 따라 자동 설정)
-- PICKUP(직접수령) → 출고일 당일 / DELIVERY(택배·화물) → 출고일 + 2일
ALTER TABLE orders ADD COLUMN billable_after TEXT;
CREATE INDEX IF NOT EXISTS idx_orders_billable_after ON orders(billable_after);
