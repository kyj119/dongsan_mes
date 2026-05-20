-- #A-009: entity_id 인덱스 누락 6개 테이블 일괄 추가
-- returns(0214), purchase_invoices(0215), waste_records(0216),
-- fixed_assets(0218), budgets(0219), journal_entries(0220)
-- 생성 당시 entity_id 컬럼은 추가되었으나 인덱스 누락

CREATE INDEX IF NOT EXISTS idx_returns_entity ON returns(entity_id);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_entity ON purchase_invoices(entity_id);
CREATE INDEX IF NOT EXISTS idx_waste_records_entity ON waste_records(entity_id);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_entity ON fixed_assets(entity_id);
CREATE INDEX IF NOT EXISTS idx_budgets_entity ON budgets(entity_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_entity ON journal_entries(entity_id);
