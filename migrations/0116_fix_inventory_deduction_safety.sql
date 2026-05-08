-- ============================================================================
-- Migration 0116: 재고 자동차감 안전장치
-- - inventory_auto_deductions에 print_event_id UNIQUE 제약 추가 (중복 차감 방지)
-- - card_items에 rip_retry_count + rip_error_reason 추가 (펜딩 잡 무한 루프 방지)
-- ============================================================================

-- 1. 중복 차감 방지: 같은 print_event에 대해 1회만 차감 가능
CREATE UNIQUE INDEX IF NOT EXISTS idx_auto_deductions_print_event_unique
  ON inventory_auto_deductions(print_event_id);

-- 2. RIP 펜딩 잡 무한 루프 방지: 재시도 횟수 + 에러 사유 추가
ALTER TABLE card_items ADD COLUMN rip_retry_count INTEGER DEFAULT 0;
ALTER TABLE card_items ADD COLUMN rip_error_reason TEXT;
