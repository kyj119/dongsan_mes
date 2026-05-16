-- ============================================================================
-- Migration 0208: CAPS 사이트 데이터 정합성 보강
-- - employees.caps_site_id 인덱스 추가 (CAPS 동기화 시 WHERE 사용)
-- - attendance.caps_site_id 인덱스 추가
-- - caps_sync_log.site_id 인덱스 추가
-- ============================================================================

-- employees.caps_site_id: CAPS 동기화 시 WHERE caps_site_id = ? 패턴 사용
CREATE INDEX IF NOT EXISTS idx_employees_caps_site ON employees(caps_site_id)
  WHERE caps_site_id IS NOT NULL;

-- attendance.caps_site_id: CAPS 출퇴근 집계 시 필터 사용
CREATE INDEX IF NOT EXISTS idx_attendance_caps_site ON attendance(caps_site_id)
  WHERE caps_site_id IS NOT NULL;

-- caps_sync_log.site_id: 사이트별 동기화 이력 조회
CREATE INDEX IF NOT EXISTS idx_caps_sync_log_site ON caps_sync_log(site_id);
