-- ============================================================================
-- Migration 0263: 직원 소프트 삭제 컬럼 추가
-- Issue #207: 하드 DELETE → 소프트 삭제로 전환 (급여/근태 이력 보존)
-- ============================================================================

ALTER TABLE employees ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0;
ALTER TABLE employees ADD COLUMN deleted_at DATETIME DEFAULT NULL;
ALTER TABLE employees ADD COLUMN deleted_by INTEGER DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_employees_is_deleted ON employees(is_deleted);
