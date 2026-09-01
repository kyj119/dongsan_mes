-- 0547: 평판을 UV 에서 분리 — FLAT-4X8-01 → FLATBED (2026-09-01 용준님)
--
-- 0546 은 평판을 UV 에 넣었다. 공정 코드 목록이 `items.category` 와 1:1 로 선언돼 있었고
-- 거기엔 '평판' 이 없어서다. 용준님 확인 후 **장비 축에서만** 분리한다 —
-- Flora 평판은 물리적으로 별개 장비라 UV 그룹에 묻히면 현장이 그룹을 못 쓴다.
--
-- ★ 재고까지 쪼개지는 않는다: `constants/process.ts` 의 FLATBED.category = 'UV' 라
--   PROCESS_CATEGORY(재고 집계용)는 종전대로 UV 로 흐른다. 품목 분류에 '평판' 을 만들 때
--   그 줄을 같이 고친다 — 지금 품목을 건드리면 55개 UV 품목의 분류가 흔들린다.
--
-- 순서도 품목코드 번호와 맞췄다: PM-1수성 / 2솔벤 / 3UV / **4평판** / 5전사 / 6태극기 / 7간판.
--
-- 멱등: 대상 1대뿐이고 UPDATE 라 재실행해도 같은 상태.

UPDATE equipment_processes
   SET process_code = 'FLATBED'
 WHERE equipment_id = 'FLAT-4X8-01'
   AND process_code = 'UV';
