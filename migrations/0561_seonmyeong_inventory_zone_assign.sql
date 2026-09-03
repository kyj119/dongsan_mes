-- 0561: 선명(entity 2) 재고를 구역 「선명2」(id 4) 에 배정 — 선명 실사를 가능하게 한다
--
-- 배경 = 선명 재고 228행이 **전부 `storage_zone_id` NULL** 이었다. 구역 실사는 INNER JOIN 이라
--   (`inventoryCount.ts` 구역 분기) 구역 미배정 재고는 실사 화면에 **한 줄도 안 뜬다**.
--   그래서 선명은 실사 이력이 0회이고, 잉크테크 1L 519통을 포함해 평가액 4,695만원이
--   이관 스냅샷 그대로 굳어 있었다(원장도 0행).
--
-- 결정 = **선명 실사 구역에는 선명 재고만 두고, 영업용 매입 품목을 대상으로 한다**(용준님 2026-09-04).
--   ⚠️ 「영업용 매입 품목」은 새 필터를 만들 필요가 없다 — 구역 실사 쿼리가 이미
--      `WHERE i.is_active = 1 AND i.is_purchase_item = 1` 로 그걸 본다.
--      선명 재고 228행은 **전량 `is_purchase_item = 1`** 이라 조건을 그대로 통과한다.
--
-- 구역은 **새로 만들지 않는다** — `id=4 선명2`(SM-02 · 복용동로 55 · entity_id=2 · is_default=1 ·
--   담당 manager_id=19)가 이미 있다. 사본을 만들면 기본창고가 둘이 된다.
--
-- 안전 확인(적용 전 실측):
--   ① UNIQUE `idx_inventory_item_entity_zone(item_id, entity_id, IFNULL(storage_zone_id,0))` —
--      선명에 품목 중복행이 **0건**이라 NULL(→0) 을 4 로 바꿔도 충돌하지 않는다.
--   ② 다른 법인 구역에 선명 재고가 섞인 행 **0건**(역방향도 깨끗).
--   ③ 대상 228행 = 수량 있음 163 · 0 인 것 65 · **음수 28**.
--      음수는 이관 후 출고가 재고를 넘긴 것이고, 실사가 바로 그걸 바로잡는 수단이다.
--
-- ⚠️ 0 수량 65행도 함께 배정한다 — 구역 실사는 수량을 안 가리므로 실사표에 0줄로 뜬다.
--    빼면 「그 품목은 실사에서 아예 못 세는」 상태가 되어 실물이 있어도 입력할 곳이 없다.
--    (법인 전수 실사 경로가 `getItemDefaultZones` 로 기본창고를 채우는 것과 같은 취급이다.)
--
-- ⚠️ 되돌리기 = UPDATE inventory SET storage_zone_id = NULL WHERE entity_id = 2 AND storage_zone_id = 4;
--    (같은 날 되돌릴 때만 안전하다 — 이후 정상 배정된 행까지 함께 지운다.)

UPDATE inventory
   SET storage_zone_id = 4
 WHERE entity_id = 2
   AND storage_zone_id IS NULL
   AND EXISTS (SELECT 1 FROM storage_zones z WHERE z.id = 4 AND z.entity_id = 2);
