-- ============================================================================
-- Migration 0208 — 누락 entity_id 및 status 인덱스 추가 (Area 4 데이터 정합성)
-- ----------------------------------------------------------------------------
-- 0150 마이그레이션에서 entity_id 컬럼 추가 후 일부 테이블 인덱스 누락:
--   * adjustments.entity_id      → accounts-receivable.ts entityFilter 사용 (Table Scan)
--   * payment_requests.entity_id → paymentRequests.ts entityFilter 사용 (Table Scan)
--   * purchase_payments.entity_id→ 향후 쿼리 대비
--   * inventory_transactions.entity_id → 향후 JOIN 최적화 대비
--
-- 0193 마이그레이션에서 entity_id 추가 후 2개 테이블 인덱스 누락:
--   * hometax_jobs.entity_id     → hometaxInvoices.ts entityFilter(c, 'hj') 사용 (Table Scan)
--   * portal_access_logs.entity_id → 향후 쿼리 대비
--
-- ai_analysis_requests: status 컬럼 인덱스 전무 — AI 에이전트 폴링 쿼리 매번 풀스캔
-- ============================================================================

-- 0150 누락분 (entity_id 인덱스)
CREATE INDEX IF NOT EXISTS idx_adjustments_entity ON adjustments(entity_id);
CREATE INDEX IF NOT EXISTS idx_payment_requests_entity ON payment_requests(entity_id);
CREATE INDEX IF NOT EXISTS idx_purchase_payments_entity ON purchase_payments(entity_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_entity ON inventory_transactions(entity_id);

-- 0193 누락분 (entity_id 인덱스)
CREATE INDEX IF NOT EXISTS idx_hometax_jobs_entity ON hometax_jobs(entity_id);
CREATE INDEX IF NOT EXISTS idx_portal_access_logs_entity ON portal_access_logs(entity_id);

-- ai_analysis_requests 폴링 최적화
CREATE INDEX IF NOT EXISTS idx_ai_analysis_status ON ai_analysis_requests(status);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_status_created ON ai_analysis_requests(status, created_at);
