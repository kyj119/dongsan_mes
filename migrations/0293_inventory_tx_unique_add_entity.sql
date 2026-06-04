-- 0293: inventory_transactions UNIQUE 인덱스에 entity_id 추가
-- 사유: 재고차감 entity 정책(담당법인 우선 COALESCE) 도입으로 같은 품목이 한 주문에서
--       복수 법인(담당/청구)으로 분할 차감될 수 있음. 기존 부분 UNIQUE
--       (reference_type, reference_id, item_id, transaction_type)는 entity_id를 제외 →
--       두 번째 법인 OUT row가 UNIQUE 위반(또는 stockShip dedup이 두 번째 그룹을 silent skip).
--       entity_id를 포함해 per-(주문,품목,법인,유형) 멱등으로 전환 → 같은 품목 다법인도 각각 차감.
-- 안전: 테이블 제약이 아니라 부분 인덱스라 DROP+CREATE만. 테이블 재생성 불필요.
DROP INDEX IF EXISTS idx_inventory_tx_unique_ref;
CREATE UNIQUE INDEX idx_inventory_tx_unique_ref
  ON inventory_transactions(reference_type, reference_id, item_id, transaction_type, entity_id)
  WHERE reference_type IS NOT NULL AND reference_id IS NOT NULL;
