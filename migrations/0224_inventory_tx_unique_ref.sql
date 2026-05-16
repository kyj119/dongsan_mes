-- #88: inventory_transactions 중복 방지 인덱스
-- 동일 reference에서 같은 품목 같은 유형의 트랜잭션은 1건만 허용
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_tx_unique_ref
  ON inventory_transactions(reference_type, reference_id, item_id, transaction_type)
  WHERE reference_type IS NOT NULL AND reference_id IS NOT NULL;
