-- #118: vat_reports UNIQUE 제약에 entity_id 추가
-- SQLite는 ALTER TABLE로 UNIQUE 변경 불가 → 테이블 재생성

CREATE TABLE vat_reports_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_year INTEGER NOT NULL,
  report_quarter INTEGER NOT NULL CHECK(report_quarter BETWEEN 1 AND 4),
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  sales_count INTEGER DEFAULT 0,
  sales_supply_amount REAL DEFAULT 0,
  sales_tax_amount REAL DEFAULT 0,
  purchase_count INTEGER DEFAULT 0,
  purchase_supply_amount REAL DEFAULT 0,
  purchase_tax_amount REAL DEFAULT 0,
  payable_tax REAL DEFAULT 0,
  status TEXT DEFAULT 'DRAFT',
  submitted_at DATETIME,
  notes TEXT,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  entity_id INTEGER DEFAULT 1,
  UNIQUE(report_year, report_quarter, entity_id)
);

INSERT INTO vat_reports_new
  SELECT id, report_year, report_quarter, period_start, period_end,
    sales_count, sales_supply_amount, sales_tax_amount,
    purchase_count, purchase_supply_amount, purchase_tax_amount,
    payable_tax, status, submitted_at, notes, created_by, created_at,
    COALESCE(entity_id, 1)
  FROM vat_reports;

DROP TABLE vat_reports;

ALTER TABLE vat_reports_new RENAME TO vat_reports;

CREATE INDEX IF NOT EXISTS idx_vat_reports_entity ON vat_reports(entity_id);
