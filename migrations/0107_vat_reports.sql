-- 부가세 신고 이력 보관
-- Migration: 0104_vat_reports

CREATE TABLE IF NOT EXISTS vat_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_year INTEGER NOT NULL,
  report_quarter INTEGER NOT NULL,       -- 1, 2, 3, 4
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  sales_count INTEGER DEFAULT 0,         -- 매출 세금계산서 건수
  sales_supply_amount REAL DEFAULT 0,    -- 매출 공급가액
  sales_tax_amount REAL DEFAULT 0,       -- 매출 세액
  purchase_count INTEGER DEFAULT 0,      -- 매입 건수
  purchase_supply_amount REAL DEFAULT 0, -- 매입 공급가액
  purchase_tax_amount REAL DEFAULT 0,    -- 매입 세액
  payable_tax REAL DEFAULT 0,            -- 납부세액 = 매출세액 - 매입세액
  status TEXT DEFAULT 'DRAFT',           -- DRAFT / SUBMITTED
  submitted_at TEXT,
  notes TEXT,
  created_by INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(report_year, report_quarter)
);

CREATE INDEX IF NOT EXISTS idx_vat_reports_period ON vat_reports(report_year, report_quarter);
