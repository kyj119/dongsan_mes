-- 0436: P1 출고 정합화 — 주문 단위 출고일 컬럼 신설
-- 배경: 출고일 정본이 cards.shipped_at에 분산 → 카드 없는 유통 주문은 출고일 부재.
--       orders.status='SHIPPED' 전이 시점에 shipped_at 스탬프 (코드 동시 반영).
ALTER TABLE orders ADD COLUMN shipped_at DATETIME;

-- 백필 1: 출고완료 주문 = 카드 최종 출고시각
UPDATE orders SET shipped_at = (
  SELECT MAX(c.shipped_at) FROM cards c
  WHERE c.order_id = orders.id AND c.shipped_at IS NOT NULL
) WHERE status = 'SHIPPED' AND shipped_at IS NULL;

-- 백필 2: 카드 없는(유통) 출고완료 주문 = updated_at 근사
UPDATE orders SET shipped_at = updated_at WHERE status = 'SHIPPED' AND shipped_at IS NULL;
