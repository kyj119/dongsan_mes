CREATE TABLE IF NOT EXISTS labor_contracts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  entity_id INTEGER DEFAULT 1,
  contract_type TEXT NOT NULL DEFAULT 'HOURLY',
  contract_date TEXT,
  contract_start_date TEXT NOT NULL,
  contract_end_date TEXT,
  wage_start_date TEXT,
  wage_end_date TEXT,
  hourly_rate INTEGER DEFAULT 0,
  work_type TEXT DEFAULT 'REGULAR',
  job_description TEXT,
  probation_months INTEGER DEFAULT 3,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  signature_employee_base64 TEXT,
  signature_employer_base64 TEXT,
  signed_at TEXT,
  signed_ip TEXT,
  pdf_path TEXT,
  notes TEXT,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_labor_contracts_employee ON labor_contracts(employee_id);
CREATE INDEX IF NOT EXISTS idx_labor_contracts_entity ON labor_contracts(entity_id);
CREATE INDEX IF NOT EXISTS idx_labor_contracts_status ON labor_contracts(status);
