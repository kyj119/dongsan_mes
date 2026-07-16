-- 매입 품목 매칭(1~3단계) 롤백
UPDATE purchase_order_items SET item_id=NULL, updated_at=CURRENT_TIMESTAMP WHERE po_id IN (SELECT id FROM purchase_orders WHERE entity_id=2 AND notes='선명 이관 매입');
DELETE FROM items WHERE item_code='AQD-070';
UPDATE items SET item_code='AQ1-150' WHERE item_code='AQ1-152';
UPDATE items SET item_code='AQ2-150' WHERE item_code='AQ2-152';
UPDATE items SET item_code='AQ2-105' WHERE item_code='AQ2-106';
