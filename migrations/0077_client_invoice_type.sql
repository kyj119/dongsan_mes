-- ============================================================================
-- Migration 0077: clients.invoice_type 컬럼 확인
-- 이미 존재하므로 no-op
-- ============================================================================

CREATE TABLE IF NOT EXISTS _migration_0077_noop (id INTEGER);
DROP TABLE IF EXISTS _migration_0077_noop;
