-- 0208: entity_id 인덱스 누락 3건 추가
-- 0150에서 entity_id 컬럼은 추가됐으나 인덱스 생성이 빠짐
-- inventory_transactions: 재고 이력 법인 필터 (inventoryCount.ts, orders/queries.ts)
-- employees: 직원 목록 법인 필터 (hr.ts entityFilter)
-- adjustments: 수금 조정 법인 필터 (accounts-receivable.ts 6개소)
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_entity ON inventory_transactions(entity_id);
CREATE INDEX IF NOT EXISTS idx_employees_entity ON employees(entity_id);
CREATE INDEX IF NOT EXISTS idx_adjustments_entity ON adjustments(entity_id);
