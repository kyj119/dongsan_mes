-- 0227: 단가 미정 (pending price) 기능
-- 주문 시점에 금액 미확정 품목을 표시하고, 회계반영 전 확정을 강제하는 워크플로우

-- 품목별 단가 상태
ALTER TABLE order_items ADD COLUMN price_status TEXT NOT NULL DEFAULT 'CONFIRMED';

-- 주문 단위 미정 여부 (비정규화, 저장 시 자동 계산)
ALTER TABLE orders ADD COLUMN has_pending_prices INTEGER NOT NULL DEFAULT 0;
