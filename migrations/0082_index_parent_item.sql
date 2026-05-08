-- ============================================================================
-- Migration 0082: order_items.parent_item_id 인덱스 추가
-- 묶음 편집(0019에서 추가된 컬럼)에서 자식 품목 조회 시 사용되나 인덱스 누락
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_order_items_parent ON order_items(parent_item_id);
