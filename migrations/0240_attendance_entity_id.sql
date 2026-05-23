-- ============================================================================
-- Migration 0240: attendance 테이블에 entity_id 추가
-- 법인별 근태 분리 조회를 위해 employees.entity_id를 attendance에 비정규화
-- ============================================================================

ALTER TABLE attendance ADD COLUMN entity_id INTEGER DEFAULT 1;

-- 기존 데이터: employees.entity_id로 채우기
UPDATE attendance
SET entity_id = (
  SELECT e.entity_id FROM employees e WHERE e.id = attendance.employee_id
)
WHERE EXISTS (
  SELECT 1 FROM employees e WHERE e.id = attendance.employee_id
);

CREATE INDEX IF NOT EXISTS idx_attendance_entity_id ON attendance(entity_id);
