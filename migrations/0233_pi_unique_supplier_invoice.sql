-- #128: purchase_invoices 중복 인보이스 방지
-- supplier_id + invoice_number + entity_id 복합 UNIQUE
CREATE UNIQUE INDEX IF NOT EXISTS idx_pi_unique_supplier_invoice
  ON purchase_invoices(supplier_id, invoice_number, entity_id);
