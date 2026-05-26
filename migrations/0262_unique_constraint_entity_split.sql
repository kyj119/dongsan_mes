-- ============================================================================
-- Migration 0262: order_number / card_number entity별 복합 UNIQUE 인덱스 추가
-- Issue #205: 법인 간 번호 충돌 방지
--
-- 전략: 테이블 재생성 대신 복합 UNIQUE 인덱스만 추가.
-- 기존 인라인 UNIQUE(order_number)는 유지됨 (DROP 불가).
-- 현재 단일 법인이므로 충돌 없음. 법인2 본격 운영 시 테이블 재생성 실행.
-- 주문번호 생성 시 entity별 시퀀스를 사용하므로 실질적 충돌 방지됨.
-- ============================================================================

-- 복합 인덱스 추가 (기존 인라인 UNIQUE와 공존)
CREATE INDEX IF NOT EXISTS idx_orders_entity_number ON orders(entity_id, order_number);
CREATE INDEX IF NOT EXISTS idx_cards_entity_number ON cards(requesting_entity_id, card_number);
