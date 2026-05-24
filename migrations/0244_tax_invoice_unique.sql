-- #172: tax_invoices invoice_number + entity_id 복합 UNIQUE 인덱스
CREATE UNIQUE INDEX IF NOT EXISTS idx_ti_number_entity
  ON tax_invoices(invoice_number, entity_id);
