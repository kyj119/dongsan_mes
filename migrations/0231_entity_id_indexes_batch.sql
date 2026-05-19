-- 0231: entity_id 인덱스 일괄 추가
-- 이유: entity_id 컬럼은 있으나 인덱스 누락으로 entityFilter() WHERE 절에서 full table scan 발생
-- 영향: inventory_transactions(대용량), journal_entries(회계), adjustments(미수금 집계) 등 핵심 쿼리 성능 저하

-- 재고 트랜잭션 (가장 빈번, entity 격리 필수)
CREATE INDEX IF NOT EXISTS idx_inventory_tx_entity ON inventory_transactions(entity_id);
CREATE INDEX IF NOT EXISTS idx_inventory_tx_entity_date ON inventory_transactions(entity_id, transaction_date);

-- 총계정원장 분개 (회계 조회)
CREATE INDEX IF NOT EXISTS idx_journal_entries_entity ON journal_entries(entity_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_entity_date ON journal_entries(entity_id, entry_date);

-- 조정 (미수금 집계 집중 쿼리)
CREATE INDEX IF NOT EXISTS idx_adjustments_entity ON adjustments(entity_id);

-- 구매 대금 지급
CREATE INDEX IF NOT EXISTS idx_purchase_payments_entity ON purchase_payments(entity_id);

-- 결제 요청
CREATE INDEX IF NOT EXISTS idx_payment_requests_entity ON payment_requests(entity_id);

-- 고정자산 (감가상각 계산 시 entity 격리)
CREATE INDEX IF NOT EXISTS idx_fixed_assets_entity ON fixed_assets(entity_id);

-- 구매 인보이스 (3-way match)
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_entity ON purchase_invoices(entity_id);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_entity_status ON purchase_invoices(entity_id, match_status);

-- 반품
CREATE INDEX IF NOT EXISTS idx_returns_entity ON returns(entity_id);
CREATE INDEX IF NOT EXISTS idx_returns_entity_status ON returns(entity_id, status);

-- 불용 추적
CREATE INDEX IF NOT EXISTS idx_waste_records_entity ON waste_records(entity_id);

-- 홈택스 배치 작업
CREATE INDEX IF NOT EXISTS idx_hometax_jobs_entity ON hometax_jobs(entity_id);

-- 예산
CREATE INDEX IF NOT EXISTS idx_budgets_entity ON budgets(entity_id);
CREATE INDEX IF NOT EXISTS idx_budgets_entity_year ON budgets(entity_id, fiscal_year);

-- 직원 (HR 조회)
CREATE INDEX IF NOT EXISTS idx_employees_entity ON employees(entity_id);
