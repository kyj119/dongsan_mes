-- inventory.safe_stock · reorder_point 채우기 (propose-count-scope.cjs 생성)
-- 리드타임 1주 가정 · safe = 주당소모 × 1 · reorder = 주당소모 × 2
-- ★창고별 다중 행이므로 (item_id, entity_id, storage_zone_id) 로 특정한다. 품목 단위 합산 금지.
-- 롤백: UPDATE inventory SET safe_stock=0, reorder_point=0 WHERE id IN (SELECT id FROM _bak_0825_safestock);

CREATE TABLE IF NOT EXISTS _bak_0825_safestock AS
SELECT id, item_id, entity_id, storage_zone_id, safe_stock, reorder_point, datetime('now') AS saved_at
  FROM inventory WHERE storage_zone_id IN (1,3);

UPDATE inventory SET safe_stock = 0.5, reorder_point = 1, last_updated = CURRENT_TIMESTAMP
 WHERE item_id = 494 AND storage_zone_id = 3;   -- RM-I0057
UPDATE inventory SET safe_stock = 0.8, reorder_point = 1.5, last_updated = CURRENT_TIMESTAMP
 WHERE item_id = 492 AND storage_zone_id = 3;   -- RM-I0055
UPDATE inventory SET safe_stock = 1, reorder_point = 2, last_updated = CURRENT_TIMESTAMP
 WHERE item_id = 493 AND storage_zone_id = 3;   -- RM-I0056
UPDATE inventory SET safe_stock = 1, reorder_point = 2, last_updated = CURRENT_TIMESTAMP
 WHERE item_id = 495 AND storage_zone_id = 3;   -- RM-I0058
UPDATE inventory SET safe_stock = 1250, reorder_point = 2500, last_updated = CURRENT_TIMESTAMP
 WHERE item_id = 202 AND storage_zone_id = 1;   -- AQ2-090
UPDATE inventory SET safe_stock = 780, reorder_point = 1560, last_updated = CURRENT_TIMESTAMP
 WHERE item_id = 215 AND storage_zone_id = 1;   -- AQ2-180
UPDATE inventory SET safe_stock = 1400, reorder_point = 2800, last_updated = CURRENT_TIMESTAMP
 WHERE item_id = 200 AND storage_zone_id = 1;   -- AQ2-070
UPDATE inventory SET safe_stock = 160, reorder_point = 310, last_updated = CURRENT_TIMESTAMP
 WHERE item_id = 214 AND storage_zone_id = 1;   -- AQ2-170
UPDATE inventory SET safe_stock = 130, reorder_point = 260, last_updated = CURRENT_TIMESTAMP
 WHERE item_id = 201 AND storage_zone_id = 1;   -- AQ2-080
UPDATE inventory SET safe_stock = 130, reorder_point = 260, last_updated = CURRENT_TIMESTAMP
 WHERE item_id = 207 AND storage_zone_id = 1;   -- AQ2-120
UPDATE inventory SET safe_stock = 260, reorder_point = 520, last_updated = CURRENT_TIMESTAMP
 WHERE item_id = 213 AND storage_zone_id = 1;   -- AQ2-160
UPDATE inventory SET safe_stock = 130, reorder_point = 260, last_updated = CURRENT_TIMESTAMP
 WHERE item_id = 209 AND storage_zone_id = 1;   -- AQ2-130
UPDATE inventory SET safe_stock = 310, reorder_point = 610, last_updated = CURRENT_TIMESTAMP
 WHERE item_id = 198 AND storage_zone_id = 1;   -- AQ2-050
UPDATE inventory SET safe_stock = 260, reorder_point = 520, last_updated = CURRENT_TIMESTAMP
 WHERE item_id = 199 AND storage_zone_id = 1;   -- AQ2-060
UPDATE inventory SET safe_stock = 150, reorder_point = 290, last_updated = CURRENT_TIMESTAMP
 WHERE item_id = 212 AND storage_zone_id = 1;   -- AQ2-152
UPDATE inventory SET safe_stock = 230, reorder_point = 460, last_updated = CURRENT_TIMESTAMP
 WHERE item_id = 204 AND storage_zone_id = 1;   -- AQ2-100
UPDATE inventory SET safe_stock = 60, reorder_point = 120, last_updated = CURRENT_TIMESTAMP
 WHERE item_id = 225 AND storage_zone_id = 1;   -- PAT-127
UPDATE inventory SET safe_stock = 55, reorder_point = 110, last_updated = CURRENT_TIMESTAMP
 WHERE item_id = 298 AND storage_zone_id = 1;   -- SPM011G-105
UPDATE inventory SET safe_stock = 210, reorder_point = 420, last_updated = CURRENT_TIMESTAMP
 WHERE item_id = 206 AND storage_zone_id = 1;   -- AQ2-110
UPDATE inventory SET safe_stock = 130, reorder_point = 260, last_updated = CURRENT_TIMESTAMP
 WHERE item_id = 211 AND storage_zone_id = 1;   -- AQ2-140
UPDATE inventory SET safe_stock = 130, reorder_point = 260, last_updated = CURRENT_TIMESTAMP
 WHERE item_id = 218 AND storage_zone_id = 1;   -- AQ2-320
UPDATE inventory SET safe_stock = 67, reorder_point = 140, last_updated = CURRENT_TIMESTAMP
 WHERE item_id = 401 AND storage_zone_id = 1;   -- MCP120-127
UPDATE inventory SET safe_stock = 260, reorder_point = 520, last_updated = CURRENT_TIMESTAMP
 WHERE item_id = 217 AND storage_zone_id = 1;   -- AQ2-250
UPDATE inventory SET safe_stock = 44, reorder_point = 88, last_updated = CURRENT_TIMESTAMP
 WHERE item_id = 223 AND storage_zone_id = 1;   -- PAT-060
UPDATE inventory SET safe_stock = 72, reorder_point = 150, last_updated = CURRENT_TIMESTAMP
 WHERE item_id = 299 AND storage_zone_id = 1;   -- SPM011G-127
UPDATE inventory SET safe_stock = 66, reorder_point = 140, last_updated = CURRENT_TIMESTAMP
 WHERE item_id = 303 AND storage_zone_id = 1;   -- SPM022G-127
UPDATE inventory SET safe_stock = 55, reorder_point = 110, last_updated = CURRENT_TIMESTAMP
 WHERE item_id = 307 AND storage_zone_id = 1;   -- SPP031M-105
UPDATE inventory SET safe_stock = 50, reorder_point = 100, last_updated = CURRENT_TIMESTAMP
 WHERE item_id = 308 AND storage_zone_id = 1;   -- SPP031M-127
UPDATE inventory SET safe_stock = 120, reorder_point = 230, last_updated = CURRENT_TIMESTAMP
 WHERE item_id = 195 AND storage_zone_id = 1;   -- AQ2-030
UPDATE inventory SET safe_stock = 150, reorder_point = 290, last_updated = CURRENT_TIMESTAMP
 WHERE item_id = 196 AND storage_zone_id = 1;   -- AQ2-040
UPDATE inventory SET safe_stock = 180, reorder_point = 350, last_updated = CURRENT_TIMESTAMP
 WHERE item_id = 216 AND storage_zone_id = 1;   -- AQ2-200
UPDATE inventory SET safe_stock = 50, reorder_point = 100, last_updated = CURRENT_TIMESTAMP
 WHERE item_id = 300 AND storage_zone_id = 1;   -- SPM011G-137
UPDATE inventory SET safe_stock = 180, reorder_point = 350, last_updated = CURRENT_TIMESTAMP
 WHERE item_id = 301 AND storage_zone_id = 1;   -- SPM011G-152
UPDATE inventory SET safe_stock = 59, reorder_point = 120, last_updated = CURRENT_TIMESTAMP
 WHERE item_id = 309 AND storage_zone_id = 1;   -- SPP031M-137
UPDATE inventory SET safe_stock = 50, reorder_point = 100, last_updated = CURRENT_TIMESTAMP
 WHERE item_id = 310 AND storage_zone_id = 1;   -- SPP031M-152
UPDATE inventory SET safe_stock = 88, reorder_point = 180, last_updated = CURRENT_TIMESTAMP
 WHERE item_id = 389 AND storage_zone_id = 1;   -- LD59HTG-137
UPDATE inventory SET safe_stock = 2.3, reorder_point = 4.5, last_updated = CURRENT_TIMESTAMP
 WHERE item_id = 1407 AND storage_zone_id = 1;   -- RM-I-UVNEW-M
UPDATE inventory SET safe_stock = 270, reorder_point = 540, last_updated = CURRENT_TIMESTAMP
 WHERE item_id = 186 AND storage_zone_id = 1;   -- AQ1-120
UPDATE inventory SET safe_stock = 58, reorder_point = 120, last_updated = CURRENT_TIMESTAMP
 WHERE item_id = 399 AND storage_zone_id = 1;   -- MCP120-060
UPDATE inventory SET safe_stock = 50, reorder_point = 100, last_updated = CURRENT_TIMESTAMP
 WHERE item_id = 422 AND storage_zone_id = 1;   -- SPC031G-137
UPDATE inventory SET safe_stock = 3.5, reorder_point = 7, last_updated = CURRENT_TIMESTAMP
 WHERE item_id = 1405 AND storage_zone_id = 1;   -- RM-I-UVNEW-C
UPDATE inventory SET safe_stock = 1.8, reorder_point = 3.5, last_updated = CURRENT_TIMESTAMP
 WHERE item_id = 1406 AND storage_zone_id = 1;   -- RM-I-UVNEW-K
UPDATE inventory SET safe_stock = 3.5, reorder_point = 7, last_updated = CURRENT_TIMESTAMP
 WHERE item_id = 1408 AND storage_zone_id = 1;   -- RM-I-UVNEW-Y
UPDATE inventory SET safe_stock = 1.8, reorder_point = 3.5, last_updated = CURRENT_TIMESTAMP
 WHERE item_id = 1669 AND storage_zone_id = 1;   -- RM-I-UVNEW-W
UPDATE inventory SET safe_stock = 90, reorder_point = 180, last_updated = CURRENT_TIMESTAMP
 WHERE item_id = 226 AND storage_zone_id = 1;   -- PAT-152
UPDATE inventory SET safe_stock = 25, reorder_point = 50, last_updated = CURRENT_TIMESTAMP
 WHERE item_id = 302 AND storage_zone_id = 1;   -- SPM022G-105
UPDATE inventory SET safe_stock = 45, reorder_point = 90, last_updated = CURRENT_TIMESTAMP
 WHERE item_id = 402 AND storage_zone_id = 1;   -- MCP120-152
UPDATE inventory SET safe_stock = 2.7, reorder_point = 5.3, last_updated = CURRENT_TIMESTAMP
 WHERE item_id = 466 AND storage_zone_id = 1;   -- RM-I0029
