-- 0565: 미배정(storage_zone_id NULL) 재고 행 44개 정리 — 구역 배정 또는 삭제
--
-- 무엇인가 = 동산기획(entity 1) **44행 전부 수량 0 · 원장 0행**이다(미배정 원장 tx 0건).
--   재고가 아니라 **껍데기 행**이다. 「이 품목을 취급한다」는 흔적만 남아 있고 위치가 없다.
--
-- 왜 생겼나 = 재고 행을 만드는 경로가 `getItemDefaultZone` 을 쓰는데, 그 헬퍼는
--   `items.storage_zone_id`(축1)가 NULL 이면 **NULL 을 그대로 돌려준다**. 그러면 INSERT 가
--   구역 없는 행을 만든다. 축1 만 바꾸고 재고를 안 옮긴 일괄배정도 같은 결과를 남겼다
--   (32행이 「축1엔 구역이 있는데 재고행은 미배정」이었다).
--
-- 왜 없애야 하나 = 구역 실사는 `inv.storage_zone_id = ?` 로 잡으므로 이 행들은 **어느 실사에도
--   안 뜬다**. 그런데 실사 화면의 「미배정 품목」 패널에는 뜬다 — 셀 수는 없는데 목록에는 있는,
--   사람을 헷갈리게 하는 상태다. 용준님 지시 = **구역에 배정하고 미배정을 없앤다**(2026-09-04).
--
-- ⚠️ UNIQUE `idx_inventory_item_entity_zone(item_id, entity_id, IFNULL(storage_zone_id,0))` —
--    NULL 행과 목적지 구역 행을 **둘 다 가진 품목이 4건** 있다. 그대로 UPDATE 하면 UNIQUE 위반이다.
--    그래서 **①충돌 행 삭제 → ②나머지 이동** 순서를 지킨다.
-- ⚠️ 전 단계에 `quantity = 0` 가드를 건다. 지금 44행 전부 0 이지만, 수량이 있는 행이 섞이면
--    삭제는 재고 소실이고 이동은 원장이 필요하다 — 가드가 그걸 막는다.
-- ⚠️ 원장을 남기지 않는다. 수량 0 행의 생성·삭제·구역 이동은 **재고 총량을 바꾸지 않는다**
--    (CLAUDE.md 「재고를 바꾸면 원장에 남긴다」의 대상이 아니다).

-- ── ① 충돌 4건 — 목적지 구역에 이미 행이 있으면 NULL 껍데기를 지운다 ────────────
DELETE FROM inventory
 WHERE storage_zone_id IS NULL
   AND quantity = 0
   AND EXISTS (
     SELECT 1 FROM items i
      WHERE i.id = inventory.item_id
        AND i.storage_zone_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM inventory v2
                     WHERE v2.item_id = inventory.item_id
                       AND v2.entity_id = inventory.entity_id
                       AND v2.storage_zone_id = i.storage_zone_id)
   );

-- ── ② 축1 이 **자법인 활성 구역**인 행을 그 구역으로 옮긴다 (출력실 24 · 전사출력실 8) ──
--    타법인 구역이 축1 로 박힌 경우는 옮기지 않는다 — 그건 남의 창고다.
UPDATE inventory
   SET storage_zone_id = (SELECT i.storage_zone_id FROM items i WHERE i.id = inventory.item_id),
       last_updated = CURRENT_TIMESTAMP
 WHERE storage_zone_id IS NULL
   AND quantity = 0
   AND EXISTS (
     SELECT 1 FROM items i JOIN storage_zones z ON z.id = i.storage_zone_id
      WHERE i.id = inventory.item_id
        AND z.entity_id = inventory.entity_id
        AND z.is_active = 1
   );

-- ── ③ 갈 곳이 없는 행은 지운다 (축1 없음 12행) ──────────────────────────────────
--    환봉나무 깃대봉 3 · UV-l3200-ES 5 · 전사잉크 KM테크 8색기 4.
--    뒤 둘은 재고 0·원가 0 인 사실상 죽은 품목이다.
--    ★법인 기본창고(출력실)로 밀어 넣지 않는다 — 근거 없는 배정은 「배정」이 아니라 떠넘기기이고,
--      출력실 실사표에 재고 0 줄 12개가 영구히 늘어난다.
--    ★지워도 잃는 것이 없다 — 수량 0·원장 0이고, 입고되면 행이 다시 생긴다.
--      의도적으로 두고 싶으면 이제 창고 페이지 「품목 배정」에서 사람이 명시적으로 넣는다.
DELETE FROM inventory
 WHERE storage_zone_id IS NULL
   AND quantity = 0
   AND EXISTS (SELECT 1 FROM items i WHERE i.id = inventory.item_id AND i.storage_zone_id IS NULL);

-- ⚠️ 되돌리기 = 이 행들은 수량 0 껍데기라 **복구가 필요 없다**. 구역 배정을 되돌리려면
--    UPDATE inventory SET storage_zone_id = NULL WHERE entity_id = 1 AND quantity = 0
--      AND storage_zone_id IN (1, 3);
--    ⚠️단 그러면 원래부터 그 구역에 있던 수량 0 행까지 같이 풀린다 — 대상 id 를 특정해서 쓸 것.
--
-- ⚠️ **재발한다** — 위 「왜 생겼나」의 뿌리(`getItemDefaultZone` 이 축1 NULL 이면 NULL 반환)는
--    그대로다. 입고·차감이 축1 없는 품목을 만나면 다시 구역 없는 행을 만든다.
--    막으려면 헬퍼가 **법인 기본창고로 폴백**해야 하는데, 그건 입고 귀속 규칙 자체를 바꾸는 일이라
--    이번 정리와 분리했다(별건).
