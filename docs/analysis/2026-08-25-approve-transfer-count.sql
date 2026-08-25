-- 전사출력실 8/24 실사 회차 승인 (2026-08-25, 용준님 요청)
-- 대상 = IC-20260825153000 (zone 3 · entity 1 · SUBMITTED)
--
-- routes/inventoryCount.ts PATCH /:id/approve (:745-795) 로직을 그대로 복제한다:
--   ①없는 재고행 생성 ②quantity = counted 로 덮기 ③inventory_transactions ADJUST/STOCK_COUNT 기록 ④상태 APPROVED
--   ★`counted_quantity IS NULL`(미입력 11품목)은 보정 제외 — NULL 바인드 시 재고가 소실된다.
--   ★`handled_by` 는 users(id) FK (문자열이면 FK 위반) → 5 = admin. `approved_by` 는 TEXT(username).
-- ⚠️전사출력실은 12주치가 전부 미승인이라 이 회차가 **첫 승인**이다. 8/07 이전 회차는 승인하지 않는다
--   (재승인은 날짜 오름차순이어야 하고, 옛 회차를 나중에 승인하면 그게 최종값이 된다).
--
-- 롤백: 백업 `_bak_0825_approve_inv` 로 수량 복원 +
--   DELETE FROM inventory_transactions WHERE reference_type='STOCK_COUNT' AND reference_id=(회차 id);
--   UPDATE inventory_counts SET status='SUBMITTED', approved_by=NULL, approved_at=NULL WHERE count_number='IC-20260825153000';

CREATE TABLE IF NOT EXISTS _bak_0825_approve_inv AS
SELECT id, item_id, entity_id, storage_zone_id, quantity, datetime('now') AS saved_at
  FROM inventory WHERE entity_id = 1 AND storage_zone_id = 3;

-- ① 대상 창고 행이 없으면 생성 (키 = item, entity, zone)
INSERT OR IGNORE INTO inventory (item_id, entity_id, storage_zone_id, quantity)
SELECT ci.item_id, c.entity_id, ci.storage_zone_id, 0
  FROM inventory_count_items ci
  JOIN inventory_counts c ON c.id = ci.count_id
 WHERE c.count_number = 'IC-20260825153000' AND c.status = 'SUBMITTED'
   AND ci.counted_quantity IS NOT NULL;

-- ② 수량 보정 (counted 로 덮어쓰기)
UPDATE inventory
   SET quantity = (
         SELECT ci.counted_quantity FROM inventory_count_items ci
           JOIN inventory_counts c ON c.id = ci.count_id
          WHERE c.count_number = 'IC-20260825153000' AND c.status = 'SUBMITTED'
            AND ci.item_id = inventory.item_id
            AND IFNULL(ci.storage_zone_id,0) = IFNULL(inventory.storage_zone_id,0)
            AND ci.counted_quantity IS NOT NULL),
       last_updated = CURRENT_TIMESTAMP
 WHERE inventory.entity_id = 1
   AND EXISTS (
         SELECT 1 FROM inventory_count_items ci
           JOIN inventory_counts c ON c.id = ci.count_id
          WHERE c.count_number = 'IC-20260825153000' AND c.status = 'SUBMITTED'
            AND ci.item_id = inventory.item_id
            AND IFNULL(ci.storage_zone_id,0) = IFNULL(inventory.storage_zone_id,0)
            AND ci.counted_quantity IS NOT NULL);

-- ③ 거래 기록 (재실행 시 중복 방지 — 같은 회차·품목이 있으면 건너뜀)
INSERT INTO inventory_transactions
  (item_id, transaction_type, quantity, balance_after, reference_type, reference_id, reason, notes, handled_by, transaction_date, entity_id, storage_zone_id)
SELECT ci.item_id, 'ADJUST',
       ci.counted_quantity - ci.system_quantity,
       ci.counted_quantity,
       'STOCK_COUNT', c.id, 'STOCK_COUNT', 'Inventory Count ID: ' || c.id,
       5, datetime('now'), c.entity_id, ci.storage_zone_id
  FROM inventory_count_items ci
  JOIN inventory_counts c ON c.id = ci.count_id
 WHERE c.count_number = 'IC-20260825153000' AND c.status = 'SUBMITTED'
   AND ci.counted_quantity IS NOT NULL
   AND NOT EXISTS (
         SELECT 1 FROM inventory_transactions t
          WHERE t.reference_type = 'STOCK_COUNT' AND t.reference_id = c.id AND t.item_id = ci.item_id);

-- ④ 상태 전환
UPDATE inventory_counts
   SET status = 'APPROVED', approved_by = 'admin', approved_at = CURRENT_TIMESTAMP
 WHERE count_number = 'IC-20260825153000' AND status = 'SUBMITTED';
