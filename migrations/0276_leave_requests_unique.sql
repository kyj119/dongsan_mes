-- #294: 중복 휴가 신청 방지 — 활성(PENDING/APPROVED) 상태에 한해
-- (employee_id, leave_type, start_date, end_date) UNIQUE
-- 반차/반반차는 leave_type이 달라 같은 날짜라도 충돌하지 않음
CREATE UNIQUE INDEX IF NOT EXISTS idx_leave_requests_active
  ON leave_requests(employee_id, leave_type, start_date, end_date)
  WHERE status IN ('PENDING', 'APPROVED');
