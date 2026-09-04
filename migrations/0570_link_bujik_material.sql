-- 수성 부직포(AQ-BUJIK, id 1213) ↔ 부직포 원단 5폭 연결
--
-- 작업지시서가 라인마다 원단을 적는데(2026-09-04), 이 제품은 `product_materials` 행이
-- 하나도 없어 종이에 원단 칸이 통째로 비었다. 16라인이 그렇게 나갔다.
--
-- ★폭마다 한 행씩 넣는다 — 형제 제품(AQ-BANNER)이 같은 모양이고(수성 현수막원단 2코팅 ×6폭),
--   작업지시서는 후보들의 **이름**을 접어 보여 준다. 어느 폭을 거는지는 현장이 정한다.
-- ★`is_default = 0` 으로 둔다. 폭만 다른 같은 이름 후보에 기본값을 박으면 그 폭이 정답인 척
--   하게 되고, 원단 표기가 `is_default` 를 보지도 않는다(이름으로 접는다).
--
-- 멱등 — 이미 있으면 넣지 않는다.
INSERT INTO product_materials (product_item_id, material_item_id, is_default)
SELECT 1213, m.id, 0
  FROM items m
 WHERE m.item_code IN ('BUJIK-060','BUJIK-090','BUJIK-127','BUJIK-152','BUJIK-180')
   AND NOT EXISTS (
     SELECT 1 FROM product_materials pm
      WHERE pm.product_item_id = 1213 AND pm.material_item_id = m.id
   );
