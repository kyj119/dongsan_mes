-- 0228: entity_id 컬럼 존재하나 인덱스 누락된 테이블 8개 보강
-- (0150에서 컬럼 추가 시 index 생략된 것, 0193에서 일부 누락)

-- adjustments (0150에서 entity_id 추가, 인덱스 미생성)
CREATE INDEX IF NOT EXISTS idx_adjustments_entity ON adjustments(entity_id);

-- payment_requests (0150에서 entity_id 추가, 인덱스 미생성)
CREATE INDEX IF NOT EXISTS idx_payment_requests_entity ON payment_requests(entity_id);

-- purchase_payments (0150에서 entity_id 추가, 인덱스 미생성)
CREATE INDEX IF NOT EXISTS idx_purchase_payments_entity ON purchase_payments(entity_id);

-- inventory_transactions (0150에서 entity_id 추가, 인덱스 미생성)
-- UNIQUE 부분 인덱스(reference_type, reference_id, item_id, tx_type)와 별개로 entity 필터 최적화
CREATE INDEX IF NOT EXISTS idx_inventory_tx_entity ON inventory_transactions(entity_id);

-- hometax_jobs (0193에서 entity_id 추가, 인덱스 미생성)
CREATE INDEX IF NOT EXISTS idx_hometax_jobs_entity ON hometax_jobs(entity_id);

-- portal_access_logs (0193에서 entity_id 추가, 인덱스 미생성)
CREATE INDEX IF NOT EXISTS idx_portal_access_logs_entity ON portal_access_logs(entity_id);

-- journal_entries (0220에서 테이블 생성 시 entity_id 인덱스 미생성)
CREATE INDEX IF NOT EXISTS idx_journal_entries_entity ON journal_entries(entity_id);

-- budgets (0219에서 테이블 생성 시 entity_id 인덱스 미생성)
-- UNIQUE(fiscal_year, department, category, budget_type, entity_id)와 별개로 entity 단독 필터 최적화
CREATE INDEX IF NOT EXISTS idx_budgets_entity ON budgets(entity_id);
