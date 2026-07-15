-- 선명 이관 주문 회계반영 (orders 레벨 billing_status='BILLED' — setOrderBillingStatus 미러)
UPDATE orders SET billing_status='BILLED', billed_at=order_date, billed_by=5,
  billed_amount=final_amount, accounting_date=order_date, updated_at=CURRENT_TIMESTAMP
WHERE entity_id=2 AND notes LIKE '선명 이관%' AND (billing_status IS NULL OR billing_status != 'BILLED');
