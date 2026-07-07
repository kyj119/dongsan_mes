-- 0447: 확장성 감사 P3 인덱스 2건 (가산적·멱등)
-- inventoryValuation 집계: WHERE entity_id=? GROUP BY item_id (기존 item_id 단독 인덱스만 존재)
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_entity_item ON inventory_transactions(entity_id, item_id);
-- equipmentQueue 최근 30일 range 스캔: WHERE print_started_at >= ... (최고빈도 증가 테이블)
CREATE INDEX IF NOT EXISTS idx_print_events_started ON print_events(print_started_at);
