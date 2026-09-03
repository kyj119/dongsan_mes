-- 0562: 아누코 거래 종료 — 선명 잔여 재고 35통을 0 으로 (원장 동반)
--
-- 확정 = **아누코와 더 이상 거래하지 않고, 잔여 재고도 남아 있지 않다(소모·폐기)**(용준님 2026-09-04).
--   16품목 전부 `is_active = 0` 이라 구역 실사(`is_active = 1` 조건)에 뜨지 않는다 →
--   실사로는 영원히 0 이 되지 않는 재고였다. 그래서 조정으로 직접 내린다.
--
-- 대상 = 선명(entity 2) · 구역 4(선명2) · 수량 ≠ 0 인 **14품목 35통**.
--   BKLT-AN-090 4 · BKLT-AN-127 1 · KEL-AN-060 2 · KEL-AN-127 1 · KEL-AN-152 3
--   KELG-AN-060 1 · KELG-AN-090 7 · KELG-AN-127 1 · KELG-AN-152 1 · PAT-AN-060 1
--   SYN-AN-060 1 · SYN-AN-090 5 · SYNG-AN-090 5 · SYNG-AN-127 2
--   (PAT-AN-090 · PAT-AN-152 는 이미 0 이라 손댈 것이 없다.)
--
-- 영향면 확인(적용 전 실측): `product_materials` 0 · `bom_items` 0 · `order_items` 0 ·
--   `purchase_order_items` 0 · 동산기획(1) 아누코 재고 0. **평가액도 0원**이다
--   (16품목 전부 `avg_unit_cost = 0`) → 재고 평가 총액은 변하지 않는다.
--
-- ★재고를 바꾸면 원장에 남긴다(CLAUDE.md 「누적 캐시」). INSERT 두 건을 **UPDATE 앞에** 둬서
--   조정 전 수량을 읽게 한다 — 순서를 바꾸면 quantity_before 가 0 으로 박힌다.
--   `--file` 실행은 문장 순서대로 적용되므로 이 순서가 곧 보장이다.
-- ★사유 = `COUNT_ERROR`(실사 차이) — 장부 35 vs 실물 0 이 정확히 그 형태다. 실제 경위(소모·폐기)는
--   notes 에 남긴다. `handled_by`/`adjusted_by` = 5(admin) — 기존 ADJUSTMENT 원장과 같은 계정.
-- ★멱등 = `quantity <> 0` 가드. 재실행하면 세 문장 모두 0행이라 원장이 중복되지 않는다.
--
-- ⚠️ 되돌리기 = 수량 복구 + 원장 철회를 함께 해야 한다(원장만 남기면 대사가 어긋난다):
--     DELETE FROM inventory_transactions WHERE reference_type='ADJUSTMENT' AND entity_id=2
--       AND notes LIKE '아누코 거래 종료%';
--     DELETE FROM inventory_adjustments  WHERE entity_id=2 AND notes LIKE '아누코 거래 종료%';
--     그 뒤 위 14품목 수량을 주석의 값으로 되돌린다.

-- ── 1. 조정 기록 (조정 전 수량을 읽는다) ────────────────────────────────────
INSERT INTO inventory_adjustments
  (item_id, adjustment_date, quantity_before, quantity_after,
   adjustment_quantity, reason, adjusted_by, notes, entity_id)
SELECT inv.item_id, date('now', '+9 hours'), inv.quantity, 0,
       -inv.quantity, 'COUNT_ERROR', 5,
       '아누코 거래 종료 — 잔여 재고 소모·폐기 확인(2026-09-04)', inv.entity_id
  FROM inventory inv
  JOIN items i ON i.id = inv.item_id
 WHERE inv.entity_id = 2
   AND inv.quantity <> 0
   AND i.item_code IN ('BKLT-AN-090','BKLT-AN-127','KEL-AN-060','KEL-AN-127','KEL-AN-152',
                       'KELG-AN-060','KELG-AN-090','KELG-AN-127','KELG-AN-152','PAT-AN-060',
                       'PAT-AN-090','PAT-AN-152','SYN-AN-060','SYN-AN-090','SYNG-AN-090','SYNG-AN-127');

-- ── 2. 증감내역 원장 ────────────────────────────────────────────────────────
INSERT INTO inventory_transactions
  (item_id, transaction_type, transaction_date, quantity,
   reference_type, balance_after, reason, handled_by, notes, entity_id, storage_zone_id)
SELECT inv.item_id,
       CASE WHEN inv.quantity > 0 THEN 'OUT' ELSE 'IN' END,
       datetime('now', '+9 hours'),
       -inv.quantity,
       'ADJUSTMENT', 0, 'COUNT_ERROR', 5,
       '아누코 거래 종료 — 잔여 재고 소모·폐기 확인(2026-09-04)', inv.entity_id, inv.storage_zone_id
  FROM inventory inv
  JOIN items i ON i.id = inv.item_id
 WHERE inv.entity_id = 2
   AND inv.quantity <> 0
   AND i.item_code IN ('BKLT-AN-090','BKLT-AN-127','KEL-AN-060','KEL-AN-127','KEL-AN-152',
                       'KELG-AN-060','KELG-AN-090','KELG-AN-127','KELG-AN-152','PAT-AN-060',
                       'PAT-AN-090','PAT-AN-152','SYN-AN-060','SYN-AN-090','SYNG-AN-090','SYNG-AN-127');

-- ── 3. 재고 0 ───────────────────────────────────────────────────────────────
UPDATE inventory
   SET quantity = 0, last_updated = CURRENT_TIMESTAMP
 WHERE entity_id = 2
   AND quantity <> 0
   AND item_id IN (SELECT id FROM items WHERE item_code IN
                   ('BKLT-AN-090','BKLT-AN-127','KEL-AN-060','KEL-AN-127','KEL-AN-152',
                    'KELG-AN-060','KELG-AN-090','KELG-AN-127','KELG-AN-152','PAT-AN-060',
                    'PAT-AN-090','PAT-AN-152','SYN-AN-060','SYN-AN-090','SYNG-AN-090','SYNG-AN-127'));
