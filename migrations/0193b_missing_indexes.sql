-- tax_invoice_items: tax_invoice_id로 매번 조회되지만 인덱스 없어 풀스캔 발생
CREATE INDEX IF NOT EXISTS idx_tax_invoice_items_invoice ON tax_invoice_items(tax_invoice_id);

-- tax_invoice_orders: tax_invoice_id 필터 인덱스 누락 (order_id만 있었음)
CREATE INDEX IF NOT EXISTS idx_tax_invoice_orders_invoice ON tax_invoice_orders(tax_invoice_id);
