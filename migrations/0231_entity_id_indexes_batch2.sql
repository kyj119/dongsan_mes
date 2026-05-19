-- #122: entity_id 인덱스 누락 일괄 추가 (0213~0220 신규 테이블)
-- 해당 테이블들은 모두 entityFilter()로 조회되지만 entity_id 인덱스가 없어
-- 멀티사업자 환경에서 풀 테이블 스캔이 발생할 수 있음.

CREATE INDEX IF NOT EXISTS idx_fixed_assets_entity      ON fixed_assets(entity_id);
CREATE INDEX IF NOT EXISTS idx_returns_entity           ON returns(entity_id);
CREATE INDEX IF NOT EXISTS idx_waste_records_entity     ON waste_records(entity_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_entity   ON journal_entries(entity_id);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_entity ON purchase_invoices(entity_id);
CREATE INDEX IF NOT EXISTS idx_budgets_entity           ON budgets(entity_id);
