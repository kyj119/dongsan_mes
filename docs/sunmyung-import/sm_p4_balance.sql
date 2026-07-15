UPDATE clients SET purchase_balance =
 COALESCE((SELECT SUM(final_amount) FROM purchase_orders WHERE supplier_id=clients.id AND entity_id=2 AND status IN('CONFIRMED','RECEIVED','PARTIAL_RECEIVED')),0)
 - COALESCE((SELECT SUM(amount) FROM purchase_payments WHERE supplier_id=clients.id AND entity_id=2),0)
 - COALESCE((SELECT SUM(amount) FROM purchase_adjustments WHERE supplier_id=clients.id AND entity_id=2),0),
 updated_at=CURRENT_TIMESTAMP
 WHERE id IN (53,92,116,126,167,176,291,528,683,962,1156,1733,2347,2593,2632,2649,3754,3755,3757);
