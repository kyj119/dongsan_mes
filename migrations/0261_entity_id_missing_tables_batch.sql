-- ============================================================================
-- Migration 0261: entity_id 누락 테이블 일괄 추가
-- Issues: #198, #199, #200, #201, #202, #203, #208, #212, #214
-- ============================================================================

-- 1. attendance — 프로덕션에 이미 entity_id 존재 (0240에서 추가됨). 스킵.
-- ALTER TABLE attendance ADD COLUMN entity_id INTEGER DEFAULT 1; -- 이미 존재

-- 2. order_ai_files (#203/#208)
ALTER TABLE order_ai_files ADD COLUMN entity_id INTEGER DEFAULT 1;
UPDATE order_ai_files SET entity_id = (
  SELECT o.entity_id FROM orders o WHERE o.id = order_ai_files.order_id
) WHERE EXISTS (
  SELECT 1 FROM orders o WHERE o.id = order_ai_files.order_id
);
CREATE INDEX IF NOT EXISTS idx_order_ai_files_entity ON order_ai_files(entity_id);

-- 3. ai_analysis_requests (#208)
ALTER TABLE ai_analysis_requests ADD COLUMN entity_id INTEGER DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_ai_analysis_requests_entity ON ai_analysis_requests(entity_id);

-- 4. quotation_items (#201)
ALTER TABLE quotation_items ADD COLUMN entity_id INTEGER DEFAULT 1;
UPDATE quotation_items SET entity_id = (
  SELECT q.entity_id FROM quotations q WHERE q.id = quotation_items.quotation_id
) WHERE EXISTS (
  SELECT 1 FROM quotations q WHERE q.id = quotation_items.quotation_id
);
CREATE INDEX IF NOT EXISTS idx_quotation_items_entity ON quotation_items(entity_id);

-- 5. kakao_send_logs (#199)
ALTER TABLE kakao_send_logs ADD COLUMN entity_id INTEGER DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_kakao_send_logs_entity ON kakao_send_logs(entity_id);

-- 6. auto_process_jobs (#199)
ALTER TABLE auto_process_jobs ADD COLUMN entity_id INTEGER DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_auto_process_jobs_entity ON auto_process_jobs(entity_id);

-- 7. billing_groups (#199)
ALTER TABLE billing_groups ADD COLUMN entity_id INTEGER DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_billing_groups_entity ON billing_groups(entity_id);

-- 8. loan_rate_history (#198)
ALTER TABLE loan_rate_history ADD COLUMN entity_id INTEGER DEFAULT 1;
UPDATE loan_rate_history SET entity_id = (
  SELECT l.entity_id FROM loans l WHERE l.id = loan_rate_history.loan_id
) WHERE EXISTS (
  SELECT 1 FROM loans l WHERE l.id = loan_rate_history.loan_id
);
CREATE INDEX IF NOT EXISTS idx_loan_rate_history_entity ON loan_rate_history(entity_id);

-- 9. loan_payments (#198)
ALTER TABLE loan_payments ADD COLUMN entity_id INTEGER DEFAULT 1;
UPDATE loan_payments SET entity_id = (
  SELECT l.entity_id FROM loans l WHERE l.id = loan_payments.loan_id
) WHERE EXISTS (
  SELECT 1 FROM loans l WHERE l.id = loan_payments.loan_id
);
CREATE INDEX IF NOT EXISTS idx_loan_payments_entity ON loan_payments(entity_id);

-- 10. price_lists (#212)
ALTER TABLE price_lists ADD COLUMN entity_id INTEGER DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_price_lists_entity ON price_lists(entity_id);

-- 11. insurance_reports (#200)
ALTER TABLE insurance_reports ADD COLUMN entity_id INTEGER DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_insurance_reports_entity ON insurance_reports(entity_id);

-- 12. bank_match_rules UNIQUE 인덱스 수정 (#214) — entity_id별 분리
DROP INDEX IF EXISTS idx_bank_match_rules_name;
CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_match_rules_entity_name
  ON bank_match_rules(entity_id, counterpart_name);
