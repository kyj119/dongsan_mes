-- 동산(e1) 출력실 실사표에서 「상품으로만 판매」 품목 6종 구역 배정 해제 (2026-08-25)
--
-- 배경: 용준님 확인 — 켈/켈그레이 60폭·시트 90폭·코팅지 90폭·SPM011M 은 동산에서 출력
--   원자재로 소모하지 않고 상품으로만 판매한다. 선명(e2)은 같은 품목의 모든 폭을 원자재로 취급한다.
--
-- ★법인별 취급 구분의 정본 축 = `inventory` 행이다.
--   구역 실사가 `JOIN inventory inv ON ... inv.entity_id=? AND inv.storage_zone_id=?`
--   (routes/inventoryCount.ts:348) 로 품목을 뽑으므로, e1 행의 zone 을 떼면 동산 출력실
--   실사표에서만 빠지고 선명은 전혀 영향받지 않는다.
-- ⛔ `items.is_purchase_item` 이나 `items.storage_zone_id` 로 처리하면 안 된다 — items 는
--    entity_id 가 없는 **전 법인 공유** 테이블이라 동산에서 끄면 선명에서도 꺼진다.
--
-- 영향: 대상 6행의 quantity 는 전부 0 이므로 재고평가 변동 없음. 재고 행 자체는 남으므로
--   판매·매입 이력과 평가 대상에서 사라지지 않는다(구역 뷰에서만 빠진다).
--
-- 롤백: UPDATE inventory SET storage_zone_id = 1
--         WHERE id IN (SELECT id FROM _bak_0825_goods_zone);

CREATE TABLE IF NOT EXISTS _bak_0825_goods_zone AS
SELECT inv.id, inv.item_id, inv.entity_id, inv.storage_zone_id, inv.quantity
  FROM inventory inv
  JOIN items i ON i.id = inv.item_id
 WHERE inv.entity_id = 1
   AND inv.storage_zone_id = 1
   AND i.item_code IN ('KEL-060','KELG-060','SPM011G-090','SPP031M-090','SPP031G-090','SPM011M');

UPDATE inventory
   SET storage_zone_id = NULL
 WHERE id IN (SELECT id FROM _bak_0825_goods_zone)
   AND storage_zone_id IS NOT NULL;
