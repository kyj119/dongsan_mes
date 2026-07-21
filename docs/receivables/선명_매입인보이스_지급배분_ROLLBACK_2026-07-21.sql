UPDATE purchase_invoices SET paid_amount=0, payment_status='UNPAID', updated_at=CURRENT_TIMESTAMP WHERE entity_id=2;
