-- A-009: entity_id 인덱스 누락 보완 (fixed_assets, journal_entries, budgets)
-- fixed_assets, journal_entries, budgets 테이블은 entity_id 컬럼이 있으나
-- 인덱스가 없어 멀티사업자 필터링 시 전체 스캔 발생

CREATE INDEX IF NOT EXISTS idx_fixed_assets_entity ON fixed_assets(entity_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_entity ON journal_entries(entity_id);
CREATE INDEX IF NOT EXISTS idx_budgets_entity ON budgets(entity_id);
