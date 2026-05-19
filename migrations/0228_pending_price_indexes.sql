-- 0228: 단가 미정(pending price) 컬럼 인덱스
-- dashboard COUNT 쿼리(has_pending_prices=1)와 order_items 가격 상태 조회 성능 개선
-- 0227_pending_prices에서 컬럼만 추가하고 인덱스가 누락됨

-- 대시보드 서브쿼리: WHERE has_pending_prices = 1 AND status NOT IN (...) AND entity_id = ?
CREATE INDEX IF NOT EXISTS idx_orders_entity_pending
  ON orders(entity_id, has_pending_prices)
  WHERE has_pending_prices = 1;

-- 주문 품목 가격 미확정 상태 조회 지원
CREATE INDEX IF NOT EXISTS idx_order_items_price_status
  ON order_items(order_id, price_status)
  WHERE price_status = 'PENDING';
