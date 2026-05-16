-- Area 4 데이터 정합성: 누락된 복합 인덱스 추가
-- inventory_transactions(item_id, transaction_date) — 재고 이력 조회 최적화
-- quotations(entity_id, status) — 견적 목록 엔티티 필터 최적화
-- purchase_orders(entity_id, status) — 발주 목록 엔티티 필터 최적화

-- 재고 이력: WHERE item_id = ? ORDER BY transaction_date DESC 패턴 (inventory.ts:148)
CREATE INDEX IF NOT EXISTS idx_inv_transactions_item_date
  ON inventory_transactions(item_id, transaction_date DESC);

-- 견적: entity_id + status 복합 조건 (quotations GET 목록)
CREATE INDEX IF NOT EXISTS idx_quotations_entity_status
  ON quotations(entity_id, status);

-- 발주: entity_id + status 복합 조건 (purchase_orders GET 목록)
CREATE INDEX IF NOT EXISTS idx_purchase_orders_entity_status
  ON purchase_orders(entity_id, status);
