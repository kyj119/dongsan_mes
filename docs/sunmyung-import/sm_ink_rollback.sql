-- 잉크(1+2) 매칭 롤백
UPDATE purchase_order_items SET item_id=NULL, updated_at=CURRENT_TIMESTAMP
 WHERE po_id IN (SELECT id FROM purchase_orders WHERE entity_id=2 AND notes='선명 이관 매입')
   AND item_id IN (SELECT id FROM items WHERE item_code LIKE 'RM-I%');
DELETE FROM items WHERE item_code LIKE 'RM-I000%-ITP';
