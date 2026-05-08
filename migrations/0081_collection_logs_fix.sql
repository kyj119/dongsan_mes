-- ============================================================================
-- Migration 0081: collection_logs 스키마 수정
-- 0069가 CREATE TABLE IF NOT EXISTS로 작성되어 0054 테이블이 이미 존재하면
-- amount_requested, result 컬럼이 추가되지 않는 버그 수정
-- ledger.ts POST /collection-logs (L1844)에서 이 컬럼들을 INSERT에 사용함
-- ============================================================================

ALTER TABLE collection_logs ADD COLUMN amount_requested REAL;
ALTER TABLE collection_logs ADD COLUMN result TEXT;
