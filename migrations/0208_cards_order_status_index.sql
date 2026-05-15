-- cards(order_id, status) 복합 인덱스
-- WHERE order_id = ? AND status = ? 패턴이 6개 이상 라우트에서 빈번히 사용됨
-- (orders/core.ts:1386, shipments.ts:451, lifecycle.ts:25 등)
CREATE INDEX IF NOT EXISTS idx_cards_order_status ON cards(order_id, status);
