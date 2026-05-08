-- ============================================================================
-- Migration: 0067_performance_indexes.sql
-- 성능 최적화: 빈번 조회 컬럼에 누락된 인덱스 추가
-- 45명 동시접속 환경에서 DB 응답 개선
-- ============================================================================

-- 검색/원장에서 빈번 조회되는 거래처명
CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(client_name);

-- 원장 조회 성능 (거래처별 결제/조정 내역)
CREATE INDEX IF NOT EXISTS idx_payments_client_date ON payments(client_id, payment_date);
CREATE INDEX IF NOT EXISTS idx_adjustments_client_date ON adjustments(client_id, created_at);

-- 알림 폴링 성능 (매 5분마다 전 직원이 조회)
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_role_read ON notifications(target_role, is_read);

-- 활동 로그 조회 (엔티티별 필터링)
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity ON activity_logs(entity_type, entity_id);

-- 주문 생성일 기반 조회 (대시보드, 리포트, 예측)
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
