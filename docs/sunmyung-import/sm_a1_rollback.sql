-- A1(켈/합성지/패트/솔벤) 매칭 롤백
UPDATE purchase_order_items SET item_id=NULL, updated_at=CURRENT_TIMESTAMP
 WHERE po_id IN (SELECT id FROM purchase_orders WHERE entity_id=2 AND notes='선명 이관 매입')
   AND item_id IN (SELECT id FROM items WHERE item_code LIKE 'SVB%' OR item_code LIKE 'SVM%' OR item_code LIKE 'KEL%' OR item_code LIKE 'SYN%' OR item_code LIKE 'PAT%' OR item_code LIKE 'PJ-%' OR item_code LIKE 'SV-PATB%');
DELETE FROM items WHERE item_code IN ('SVB-050','SVB-060','SVB-080','SVB-110','KEL-IT-127','PAT-IT-127','PAT-IT-152','SYN-NA-127','SV-PATB-NAT','SVB-PR-152','SVB-040');
UPDATE items SET item_code='SVB-150' WHERE item_code='SVB-152';
