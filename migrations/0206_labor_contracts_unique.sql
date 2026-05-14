-- Prevent duplicate active contracts for the same employee and start date.
-- CANCEL-led contracts are excluded so a re-hire on the same date is allowed.
CREATE UNIQUE INDEX IF NOT EXISTS idx_labor_contracts_emp_start
  ON labor_contracts(employee_id, contract_start_date)
  WHERE status != 'CANCELLED';
