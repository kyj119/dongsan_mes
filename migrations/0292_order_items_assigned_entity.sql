-- 0292: order_items 담당 법인(생산·공정 담당) — 멀티법인 협업 (유연한 그릇)
-- 목적: 한 주문(청구 = orders.entity_id)을 쪼개지 않고, 품목별 생산/공정 담당 법인을
--       코디네이터가 지정. 타법인 담당 품목은 그 법인 작업 큐로 분배.
-- assigned_entity_id: 품목 생산/공정 담당 법인.
--   NULL = 청구 법인(orders.entity_id)이 담당 → 단일 법인 주문은 전부 NULL (기존과 동일·투명)
--   값(예: 2) = 타법인(선명) 담당 → 그 법인 큐 표시 + 카드 requesting_entity_id 주입
-- assignment_status: 타법인 담당 분배 상태.
--   NULL = 자기 법인(분배 불필요) | PENDING = 넘김 | ACCEPTED = 수락 | REJECTED = 반려
ALTER TABLE order_items ADD COLUMN assigned_entity_id INTEGER;
ALTER TABLE order_items ADD COLUMN assignment_status TEXT;

-- 타법인 담당 품목 조회/필터용 (대부분 NULL이므로 partial index)
CREATE INDEX IF NOT EXISTS idx_order_items_assigned_entity
  ON order_items(assigned_entity_id) WHERE assigned_entity_id IS NOT NULL;
