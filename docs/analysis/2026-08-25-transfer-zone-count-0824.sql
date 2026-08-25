-- 전사출력실(zone 3) 2026-08-24 현장 실사 적재 (용준님 전달 자료)
--
-- 상태 = SUBMITTED (제출 완료·미승인). 승인은 화면에서 용준님이 — 승인 시 `inventory` 보정 +
--   `inventory_transactions('ADJUST','STOCK_COUNT')` 가 생긴다.
-- ⚠️전사출력실은 12주치 회차가 **전부 SUBMITTED(미승인)** 라 재고가 계속 0 이었다. 이번 건도
--   승인해야 재고에 반영된다.
--
-- 야드 재검산 (용준님 표기 = 야드수×롤수):
--   폰지 85폭  300×13=3,900 + 130×1=130 + 250×3=750                        = 4,780 (17롤)
--   폰지 95폭  250×17=4,250 + 190×1=190                                    = 4,440 (18롤)
--   폰지 155폭 0                                                            =     0 ( 0롤)
--   폰지 180폭 250×1                                                        =   250 ( 1롤)
--   폰지 130폭 230+240+260×2+255+245×2+256+230×8+500×5
--              =230+240+520+255+490+256+1,840+2,500                        = 6,331 (21롤)
--   매쉬 160폭 226+240×2+232+225+235+163+220×3+200×13
--              =226+480+232+225+235+163+660+2,600                          = 4,821 (23롤)
--   샤틴 155폭 153+152×3+149+135+137 =153+456+149+135+137                  = 1,030 ( 7롤)
--   ─────────────────────────────────────────────────────────────────────────────────
--   원단 합계                                                               =21,652 (87롤)
--   KM잉크 M 27통 · Y 73통 (1통 = 1L, base_unit L·pack_size 1 이라 base 수량 = 27 / 73)
--
-- 매칭: 샤틴 = `SATIN300-155`(300D 무연새틴 · search_keywords 에 '샤틴' 보유).
--   별도 `SATIN-155`(샤틴)는 비활성이라 실사표에 없다.
-- 미입력(NULL) 11품목 = 현장 목록에 없는 것: MESH-127 · KM잉크 C/K/Re/Lk/Bl/Or 6종 ·
--   코스테크 CMYK 4종. 승인 시 NULL 은 보정 대상에서 제외되므로 안전하다.
--
-- 롤백: DELETE FROM inventory_count_items WHERE count_id=(SELECT id FROM inventory_counts WHERE count_number='IC-20260825153000');
--       DELETE FROM inventory_counts WHERE count_number='IC-20260825153000';

INSERT INTO inventory_counts
  (count_number, count_date, count_type, status, notes, entity_id, storage_zone_id, submitted_by, submitted_at)
SELECT 'IC-20260825153000', '2026-08-24', 'ZONE', 'SUBMITTED',
       '전사출력실 8/24 현장 실사 — 용준님 전달 자료 적재(야드수×롤수 합산)',
       1, 3, 'admin', '2026-08-25 15:30:00'
WHERE NOT EXISTS (SELECT 1 FROM inventory_counts WHERE count_number = 'IC-20260825153000');

-- 라인 스냅샷: 구역 실사와 동일 규칙(routes/inventoryCount.ts:345-351, 402-406)
INSERT INTO inventory_count_items (count_id, item_id, system_quantity, unit, storage_zone_id, per_pack_qty)
SELECT c.id,
       i.id,
       COALESCE(inv.quantity, 0),
       CASE lower(COALESCE(i.base_unit, '')) WHEN 'm' THEN 'm' WHEN 'cm' THEN 'cm' ELSE 'yd' END,
       3,
       CASE WHEN i.pack_size > 0 THEN i.pack_size ELSE NULL END
  FROM items i
  JOIN inventory inv ON i.id = inv.item_id AND inv.entity_id = 1 AND inv.storage_zone_id = 3
 CROSS JOIN (SELECT id FROM inventory_counts WHERE count_number = 'IC-20260825153000') c
 WHERE i.is_active = 1 AND i.is_purchase_item = 1
   AND NOT EXISTS (SELECT 1 FROM inventory_count_items x WHERE x.count_id = c.id AND x.item_id = i.id);

-- 실측값 (difference = counted - system, system 이 0 이므로 pct = 0)
UPDATE inventory_count_items
   SET counted_quantity = 27, difference = 27 - system_quantity, difference_pct = 0,
       notes = 'KM잉크 M 27통 (1통=1L)'
 WHERE count_id = (SELECT id FROM inventory_counts WHERE count_number='IC-20260825153000')
   AND item_id  = (SELECT id FROM items WHERE item_code='RM-I0056');

UPDATE inventory_count_items
   SET counted_quantity = 73, difference = 73 - system_quantity, difference_pct = 0,
       notes = 'KM잉크 Y 73통 (1통=1L)'
 WHERE count_id = (SELECT id FROM inventory_counts WHERE count_number='IC-20260825153000')
   AND item_id  = (SELECT id FROM items WHERE item_code='RM-I0057');

UPDATE inventory_count_items
   SET counted_quantity = 4780, difference = 4780 - system_quantity, difference_pct = 0,
       notes = '300×13, 130×1, 250×3 = 17롤'
 WHERE count_id = (SELECT id FROM inventory_counts WHERE count_number='IC-20260825153000')
   AND item_id  = (SELECT id FROM items WHERE item_code='PONGE-085');

UPDATE inventory_count_items
   SET counted_quantity = 4440, difference = 4440 - system_quantity, difference_pct = 0,
       notes = '250×17, 190×1 = 18롤'
 WHERE count_id = (SELECT id FROM inventory_counts WHERE count_number='IC-20260825153000')
   AND item_id  = (SELECT id FROM items WHERE item_code='PONGE-095');

UPDATE inventory_count_items
   SET counted_quantity = 6331, difference = 6331 - system_quantity, difference_pct = 0,
       notes = '230, 240, 260×2, 255, 245×2, 256, 230×8, 500×5 = 21롤'
 WHERE count_id = (SELECT id FROM inventory_counts WHERE count_number='IC-20260825153000')
   AND item_id  = (SELECT id FROM items WHERE item_code='PONGE-130');

UPDATE inventory_count_items
   SET counted_quantity = 0, difference = 0 - system_quantity, difference_pct = 0,
       notes = '재고 없음'
 WHERE count_id = (SELECT id FROM inventory_counts WHERE count_number='IC-20260825153000')
   AND item_id  = (SELECT id FROM items WHERE item_code='PONGE-155');

UPDATE inventory_count_items
   SET counted_quantity = 250, difference = 250 - system_quantity, difference_pct = 0,
       notes = '250×1 = 1롤'
 WHERE count_id = (SELECT id FROM inventory_counts WHERE count_number='IC-20260825153000')
   AND item_id  = (SELECT id FROM items WHERE item_code='PONGE-180');

UPDATE inventory_count_items
   SET counted_quantity = 4821, difference = 4821 - system_quantity, difference_pct = 0,
       notes = '226, 240×2, 232, 225, 235, 163, 220×3, 200×13 = 23롤'
 WHERE count_id = (SELECT id FROM inventory_counts WHERE count_number='IC-20260825153000')
   AND item_id  = (SELECT id FROM items WHERE item_code='MESH-160');

UPDATE inventory_count_items
   SET counted_quantity = 1030, difference = 1030 - system_quantity, difference_pct = 0,
       notes = '153, 152×3, 149, 135, 137 = 7롤'
 WHERE count_id = (SELECT id FROM inventory_counts WHERE count_number='IC-20260825153000')
   AND item_id  = (SELECT id FROM items WHERE item_code='SATIN300-155');
