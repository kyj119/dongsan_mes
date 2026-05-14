-- Area 4 Data Integrity: missing indexes on frequently queried FK columns
-- quality_issues: reporter/resolver/rework tracking columns
CREATE INDEX IF NOT EXISTS idx_quality_issues_reported_by   ON quality_issues(reported_by);
CREATE INDEX IF NOT EXISTS idx_quality_issues_resolved_by   ON quality_issues(resolved_by);
CREATE INDEX IF NOT EXISTS idx_quality_issues_rework_card   ON quality_issues(rework_card_id);
CREATE INDEX IF NOT EXISTS idx_quality_issues_work_record   ON quality_issues(work_record_id);

-- purchase_requests: supplier and approver lookups
CREATE INDEX IF NOT EXISTS idx_purchase_requests_supplier   ON purchase_requests(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_requests_approved   ON purchase_requests(approved_by);

-- tax_invoices: buyer client lookup
CREATE INDEX IF NOT EXISTS idx_tax_invoices_buyer_client    ON tax_invoices(buyer_client_id);

-- cards: order_item linkage and hold-by user
CREATE INDEX IF NOT EXISTS idx_cards_order_item_id          ON cards(order_item_id);
CREATE INDEX IF NOT EXISTS idx_cards_hold_by                ON cards(hold_by);
