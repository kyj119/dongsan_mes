-- #281: 연차 중복 적립 방지. YEARLY(연1회)만 대상 — MONTHLY는 매월 델타 적립이라 제외, TENURE_BONUS는 수동 다건 가능성으로 제외.
CREATE UNIQUE INDEX IF NOT EXISTS idx_leave_accrual_no_dup
  ON leave_accrual_logs(employee_id, year, accrual_type, entity_id)
  WHERE accrual_type = 'YEARLY';
