-- 0206: entity_id 인덱스 누락 7개 테이블 추가 + 대시보드 성능 복합 인덱스
-- 멀티사업자 환경에서 entity_id 필터링 성능 향상

-- 트랜잭션성 테이블
CREATE INDEX IF NOT EXISTS idx_payment_requests_entity ON payment_requests(entity_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_entity ON inventory_transactions(entity_id);
CREATE INDEX IF NOT EXISTS idx_adjustments_entity ON adjustments(entity_id);
CREATE INDEX IF NOT EXISTS idx_purchase_payments_entity ON purchase_payments(entity_id);

-- HR 테이블
CREATE INDEX IF NOT EXISTS idx_employees_entity ON employees(entity_id);

-- 로그/작업 테이블
CREATE INDEX IF NOT EXISTS idx_hometax_jobs_entity ON hometax_jobs(entity_id);
CREATE INDEX IF NOT EXISTS idx_portal_access_logs_entity ON portal_access_logs(entity_id);

-- 대시보드 복합 인덱스: entity_id + status 동시 조건 최적화
-- dashboard.ts에서 16개 서브쿼리가 orders(entity_id, status) 동시 조건을 사용
CREATE INDEX IF NOT EXISTS idx_orders_entity_status ON orders(entity_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_entity_delivery ON orders(entity_id, delivery_date);
CREATE INDEX IF NOT EXISTS idx_cards_entity_status ON cards(requesting_entity_id, status);
