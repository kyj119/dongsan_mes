-- hometax_invoices: job_id, matched_invoice_id JOIN 인덱스 누락 보완
-- hometaxInvoices.ts GET 핸들러에서 LEFT JOIN hometax_jobs ON hi.job_id = hj.id
-- 및 LEFT JOIN tax_invoices ON hi.matched_invoice_id = ti.id 사용 — 인덱스 없으면 풀스캔 발생
CREATE INDEX IF NOT EXISTS idx_hometax_invoices_job ON hometax_invoices(job_id);
CREATE INDEX IF NOT EXISTS idx_hometax_invoices_matched_invoice ON hometax_invoices(matched_invoice_id);
