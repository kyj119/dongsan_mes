-- ============================================================================
-- Migration 0269: leave_accrual_logs에 entity_id 추가
-- 법인별 연차 적립 이력 분리 (Fixes #244)
-- ============================================================================

ALTER TABLE leave_accrual_logs ADD COLUMN entity_id INTEGER DEFAULT 1 REFERENCES entities(id);

UPDATE leave_accrual_logs SET entity_id = (
  SELECT e.entity_id FROM employees e WHERE e.id = leave_accrual_logs.employee_id
) WHERE employee_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leave_accrual_logs_entity ON leave_accrual_logs(entity_id);
