-- #A-009: entity_id 인덱스 누락 10개 테이블 일괄 추가
-- 대상: entityFilter()로 쿼리되지만 entity_id 인덱스가 없는 테이블
-- 영향: 멀티사업자 환경에서 매 요청마다 전체 스캔 발생

-- 0150 migration에서 ALTER TABLE로 추가됐으나 인덱스 누락
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_entity
  ON inventory_transactions(entity_id);

CREATE INDEX IF NOT EXISTS idx_adjustments_entity
  ON adjustments(entity_id);

CREATE INDEX IF NOT EXISTS idx_payment_requests_entity
  ON payment_requests(entity_id);

CREATE INDEX IF NOT EXISTS idx_purchase_payments_entity
  ON purchase_payments(entity_id);

-- 0214 returns_rma migration — entity_id 있으나 인덱스 누락
CREATE INDEX IF NOT EXISTS idx_returns_entity
  ON returns(entity_id);

-- 0215 purchase_invoices_3way migration — entity_id 있으나 인덱스 누락
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_entity
  ON purchase_invoices(entity_id);

-- 0216 waste_tracking migration — entity_id 있으나 인덱스 누락
CREATE INDEX IF NOT EXISTS idx_waste_records_entity
  ON waste_records(entity_id);

-- 0218 fixed_assets migration — entity_id 있으나 인덱스 누락
CREATE INDEX IF NOT EXISTS idx_fixed_assets_entity
  ON fixed_assets(entity_id);

-- 0219 budgets migration — UNIQUE(fiscal_year, department, category, budget_type, entity_id)가 있으나
--   entity_id가 UNIQUE의 마지막 컬럼이므로 단독 쿼리에 사용 불가
CREATE INDEX IF NOT EXISTS idx_budgets_entity
  ON budgets(entity_id);

-- 0220 general_ledger migration — entity_id 있으나 인덱스 누락
CREATE INDEX IF NOT EXISTS idx_journal_entries_entity
  ON journal_entries(entity_id);
