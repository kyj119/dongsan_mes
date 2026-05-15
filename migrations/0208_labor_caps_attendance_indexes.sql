-- labor_contracts / caps_sync_log / attendance 복합 인덱스 추가
-- Area 4 데이터 정합성: 자주 사용되는 쿼리 컬럼 인덱스 누락 수정

-- labor_contracts: 만료 임박 계약 알림 쿼리 (hr.ts L1025-1027, L1087)
-- WHERE contract_end_date BETWEEN ? AND ? + status 필터 조합
CREATE INDEX IF NOT EXISTS idx_labor_contracts_end_date_status
  ON labor_contracts(contract_end_date, status);

-- labor_contracts: 계약 목록 페이지네이션 (entity_id + status 복합 필터)
CREATE INDEX IF NOT EXISTS idx_labor_contracts_entity_status
  ON labor_contracts(entity_id, status);

-- caps_sync_log: 멀티사이트 로그 필터 (caps.ts L684 WHERE l.site_id = ?)
CREATE INDEX IF NOT EXISTS idx_caps_sync_log_site_started
  ON caps_sync_log(site_id, started_at DESC);

-- attendance: CAPS 일괄 UPSERT (caps.ts L184 WHERE employee_id IN + work_date IN)
CREATE INDEX IF NOT EXISTS idx_attendance_employee_date
  ON attendance(employee_id, work_date);
