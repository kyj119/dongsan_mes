-- 회계허브용 신 매입 인보이스 512M. 재고매입 purchase_orders(SMP-, notes='선명 이관 매입') 기반.
-- 기초채무/회계매입 제외(실 매입발생만). po 연결(po_id). invoice_number=SMI-nnnn.
INSERT INTO purchase_invoices
  (invoice_number, supplier_id, po_id, invoice_date, subtotal, vat_amount, total_amount,
   match_status, variance_amount, payment_status, notes, entity_id, created_by)
SELECT 'SMI-' || substr(po_number, 5), supplier_id, id, order_date,
       total_amount, vat_amount, final_amount, 'MATCHED', 0, 'UNPAID',
       '선명 이관 매입', entity_id, created_by
FROM purchase_orders
WHERE entity_id = 2 AND notes = '선명 이관 매입';
