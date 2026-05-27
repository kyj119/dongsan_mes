-- ============================================================================
-- Migration 0264: entity_id 누락 14개 테이블 일괄 추가
-- ALTER TABLE ADD COLUMN만 사용 (DROP TABLE 금지 — 데이터 안전)
-- ============================================================================

-- 1. print_events (212건, card_id → cards.requesting_entity_id로 backfill)
ALTER TABLE print_events ADD COLUMN entity_id INTEGER DEFAULT 1;
UPDATE print_events SET entity_id = (
  SELECT c.requesting_entity_id FROM cards c WHERE c.id = print_events.card_id
) WHERE card_id IS NOT NULL AND EXISTS (
  SELECT 1 FROM cards c WHERE c.id = print_events.card_id AND c.requesting_entity_id IS NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_print_events_entity ON print_events(entity_id);

-- 2. cost_snapshots (0건)
ALTER TABLE cost_snapshots ADD COLUMN entity_id INTEGER DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_cost_snapshots_entity ON cost_snapshots(entity_id);

-- 3. inventory_auto_deductions (0건)
ALTER TABLE inventory_auto_deductions ADD COLUMN entity_id INTEGER DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_inv_auto_deductions_entity ON inventory_auto_deductions(entity_id);

-- 4. price_policies (1건)
ALTER TABLE price_policies ADD COLUMN entity_id INTEGER DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_price_policies_entity ON price_policies(entity_id);

-- 5. notifications (179건, user_id → users → employees.entity_id)
ALTER TABLE notifications ADD COLUMN entity_id INTEGER DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_notifications_entity ON notifications(entity_id);

-- 6. year_end_settlements (0건)
ALTER TABLE year_end_settlements ADD COLUMN entity_id INTEGER DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_year_end_settlements_entity ON year_end_settlements(entity_id);

-- 7. leave_balances (48건, employee_id → employees.entity_id)
ALTER TABLE leave_balances ADD COLUMN entity_id INTEGER DEFAULT 1;
UPDATE leave_balances SET entity_id = (
  SELECT e.entity_id FROM employees e WHERE e.id = leave_balances.employee_id
) WHERE employee_id IS NOT NULL AND EXISTS (
  SELECT 1 FROM employees e WHERE e.id = leave_balances.employee_id AND e.entity_id IS NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_leave_balances_entity ON leave_balances(entity_id);

-- 8. leave_requests (0건)
ALTER TABLE leave_requests ADD COLUMN entity_id INTEGER DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_leave_requests_entity ON leave_requests(entity_id);

-- 9. inspection_results (0건)
ALTER TABLE inspection_results ADD COLUMN entity_id INTEGER DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_inspection_results_entity ON inspection_results(entity_id);

-- 10. portal_access_tokens (5건)
ALTER TABLE portal_access_tokens ADD COLUMN entity_id INTEGER DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_portal_access_tokens_entity ON portal_access_tokens(entity_id);

-- 11. portal_reorder_requests (0건)
ALTER TABLE portal_reorder_requests ADD COLUMN entity_id INTEGER DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_portal_reorder_requests_entity ON portal_reorder_requests(entity_id);

-- 12. collection_logs (0건)
ALTER TABLE collection_logs ADD COLUMN entity_id INTEGER DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_collection_logs_entity ON collection_logs(entity_id);

-- 13. client_notes (0건)
ALTER TABLE client_notes ADD COLUMN entity_id INTEGER DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_client_notes_entity ON client_notes(entity_id);

-- 14. client_accounts (0건)
ALTER TABLE client_accounts ADD COLUMN entity_id INTEGER DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_client_accounts_entity ON client_accounts(entity_id);
