-- 선명 매입 품목매칭(item_id) 전체 롤백. 미지급(246M)엔 영향 없음.
UPDATE purchase_order_items SET item_id=NULL, updated_at=CURRENT_TIMESTAMP
 WHERE po_id IN (SELECT id FROM purchase_orders WHERE entity_id=2 AND notes='선명 이관 매입');
-- 신규 등록 items 삭제
DELETE FROM items WHERE item_code IN
 ('AQD-070','SVB-050','SVB-060','SVB-080','SVB-110',
  'KEL-IT-127','PAT-IT-127','PAT-IT-152','SYN-NA-127','SV-PATB-NAT','SVB-PR-152','SVB-040',
  'ALM-2T-BK-48','ALM-2T-WH-48','GITBAL-070','LGSHT-122','LM5400-137','MIRROR-090',
  'PAT-BO-127','SGM-BR45','SVCOAT-127','ULTRA-BOJO-100','ULTRA-CAL-100','UV-PC-1.8T-M')
 OR item_code LIKE 'RM-I000%-ITP' OR item_code LIKE 'RM-I-TPM%'
 OR item_code LIKE 'ACC-JJ-%' OR item_code LIKE 'SGM-LEDPP%' OR item_code = 'ACC-BN-STR';
-- rename 복원
UPDATE items SET item_code='AQ1-150' WHERE item_code='AQ1-152';
UPDATE items SET item_code='AQ2-150' WHERE item_code='AQ2-152';
UPDATE items SET item_code='AQ2-105' WHERE item_code='AQ2-106';
UPDATE items SET item_code='SVB-150' WHERE item_code='SVB-152';
