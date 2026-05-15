-- 대시보드 orders/cards 복합 인덱스 추가
-- entity_id + status 복합 조건 16개 서브쿼리 최적화
CREATE INDEX IF NOT EXISTS idx_orders_entity_status ON orders(entity_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_entity_created ON orders(entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cards_entity_status ON cards(requesting_entity_id, status);
CREATE INDEX IF NOT EXISTS idx_print_method_media_media_id ON print_method_media(print_media_id);
