-- A-009: entity_id 인덱스 누락 테이블 5개 추가
-- returns, budgets, fixed_assets, waste_records, journal_entries, purchase_invoices

CREATE INDEX IF NOT EXISTS idx_returns_entity ON returns(entity_id);
CREATE INDEX IF NOT EXISTS idx_budgets_entity ON budgets(entity_id);
CREATE INDEX IF NOT EXISTS idx_fa_entity ON fixed_assets(entity_id);
CREATE INDEX IF NOT EXISTS idx_waste_entity ON waste_records(entity_id);
CREATE INDEX IF NOT EXISTS idx_je_entity ON journal_entries(entity_id);
CREATE INDEX IF NOT EXISTS idx_pi_entity ON purchase_invoices(entity_id);
