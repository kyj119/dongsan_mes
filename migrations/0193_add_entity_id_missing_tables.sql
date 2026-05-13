-- 0193: entity_id 누락 테이블 10개에 컬럼 추가 (멀티사업자 분리)
-- 기존 데이터는 DEFAULT 1 (동산기획)

ALTER TABLE inventory_counts ADD COLUMN entity_id INTEGER DEFAULT 1;
ALTER TABLE hometax_jobs ADD COLUMN entity_id INTEGER DEFAULT 1;
ALTER TABLE hometax_invoices ADD COLUMN entity_id INTEGER DEFAULT 1;
ALTER TABLE bank_match_rules ADD COLUMN entity_id INTEGER DEFAULT 1;
ALTER TABLE vat_reports ADD COLUMN entity_id INTEGER DEFAULT 1;
ALTER TABLE shipments ADD COLUMN entity_id INTEGER DEFAULT 1;
ALTER TABLE portal_access_logs ADD COLUMN entity_id INTEGER DEFAULT 1;
ALTER TABLE production_logs ADD COLUMN entity_id INTEGER DEFAULT 1;
ALTER TABLE work_records ADD COLUMN entity_id INTEGER DEFAULT 1;
ALTER TABLE quality_issues ADD COLUMN entity_id INTEGER DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_inventory_counts_entity ON inventory_counts(entity_id);
CREATE INDEX IF NOT EXISTS idx_hometax_invoices_entity ON hometax_invoices(entity_id);
CREATE INDEX IF NOT EXISTS idx_bank_match_rules_entity ON bank_match_rules(entity_id);
CREATE INDEX IF NOT EXISTS idx_vat_reports_entity ON vat_reports(entity_id);
CREATE INDEX IF NOT EXISTS idx_shipments_entity ON shipments(entity_id);
CREATE INDEX IF NOT EXISTS idx_quality_issues_entity ON quality_issues(entity_id);
CREATE INDEX IF NOT EXISTS idx_production_logs_entity ON production_logs(entity_id);
CREATE INDEX IF NOT EXISTS idx_work_records_entity ON work_records(entity_id);
