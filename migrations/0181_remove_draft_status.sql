-- Phase 1: 주문 DRAFT 상태 제거
-- 기존 DRAFT 주문을 CONFIRMED로 일괄 전환
UPDATE orders SET status = 'CONFIRMED', updated_at = CURRENT_TIMESTAMP WHERE status = 'DRAFT';
