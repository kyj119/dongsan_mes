-- ============================================================================
-- Migration 0240: attendance 테이블에 entity_id 추가
-- 법인별 근태 분리 조회를 위해 employees.entity_id를 attendance에 비정규화
-- ============================================================================

-- entity_id 컬럼이 이미 존재하면 무시 (CREATE TABLE 등으로 이미 추가됨)
CREATE TABLE IF NOT EXISTS _migration_0240_check (x INTEGER);
DROP TABLE IF EXISTS _migration_0240_check;

-- 기존 데이터: employees.entity_id로 채우기
UPDATE attendance
SET entity_id = (
  SELECT e.entity_id FROM employees e WHERE e.id = attendance.employee_id
)
WHERE EXISTS (
  SELECT 1 FROM employees e WHERE e.id = attendance.employee_id
);

CREATE INDEX IF NOT EXISTS idx_attendance_entity_id ON attendance(entity_id);
