-- #78: 부서/항목별 예산 관리

CREATE TABLE IF NOT EXISTS budgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fiscal_year INTEGER NOT NULL,
  department TEXT,  -- PRODUCTION | SALES | ADMIN | HR | ALL
  category TEXT NOT NULL,  -- MATERIAL | LABOR | OVERHEAD | MARKETING | MAINTENANCE | UTILITY | OTHER
  budget_type TEXT NOT NULL DEFAULT 'EXPENSE',  -- EXPENSE | REVENUE | CAPEX
  jan REAL DEFAULT 0, feb REAL DEFAULT 0, mar REAL DEFAULT 0,
  apr REAL DEFAULT 0, may REAL DEFAULT 0, jun REAL DEFAULT 0,
  jul REAL DEFAULT 0, aug REAL DEFAULT 0, sep REAL DEFAULT 0,
  oct REAL DEFAULT 0, nov REAL DEFAULT 0, dec REAL DEFAULT 0,
  annual_total REAL DEFAULT 0,
  notes TEXT,
  entity_id INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(fiscal_year, department, category, budget_type, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_budgets_year ON budgets(fiscal_year);
CREATE INDEX IF NOT EXISTS idx_budgets_dept ON budgets(department);
