-- ============================================================================
-- 0227: 신규 테이블 entity_id 인덱스 일괄 추가
-- Area 4 데이터 정합성 점검에서 발견 (auto-improve 2026-05-18)
-- 대상: returns, purchase_invoices, waste_records, fixed_assets, budgets, journal_entries
-- (0225에서 equipment_oee_daily 등은 처리됨, 이하 6개 테이블 누락)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_returns_entity         ON returns(entity_id);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_entity ON purchase_invoices(entity_id);
CREATE INDEX IF NOT EXISTS idx_waste_records_entity   ON waste_records(entity_id);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_entity    ON fixed_assets(entity_id);
CREATE INDEX IF NOT EXISTS idx_budgets_entity         ON budgets(entity_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_entity ON journal_entries(entity_id);
