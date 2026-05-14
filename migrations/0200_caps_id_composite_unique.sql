-- ============================================================================
-- CAPS 멀티사이트: caps_id UNIQUE 제약을 (caps_site_id, caps_id) 복합으로 변경
--
-- 기존: UNIQUE(caps_id) → 대전 0003과 선명 0003이 충돌
-- 변경: UNIQUE(caps_site_id, caps_id) → 사이트별 독립
-- ============================================================================

DROP INDEX IF EXISTS idx_employees_caps_id;

CREATE UNIQUE INDEX idx_employees_caps_site_caps_id
  ON employees(caps_site_id, caps_id)
  WHERE caps_id IS NOT NULL AND caps_id != '';
