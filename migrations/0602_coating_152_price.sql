-- 0602: 무광코팅지 120g-호홍 152폭 단가 (용준님 2026-09-10)
--
-- 0598 로 코팅지를 원가에 넣었는데 `MCP120-152` 만 단가가 **0** 이었다 — 그 폭이 걸리는
-- 라인은 코팅 원가가 조용히 0 으로 잡힌다(폭 매칭은 성공하므로 커버리지는 FULL 이다).
--
-- ★단가 축 = **base_unit('M') 당**이지 롤당이 아니다. 73,300 은 **롤 가격**이고
--   `pack_size` 가 45m 이므로 73,300 ÷ 45 = **1,628.89원/m**.
--   롤가를 그대로 넣으면 45배가 된다(0530·avg-cost backfill 이 정확히 그 사고였다).
--
-- 검산 — 형제 폭의 롤가(단가×pack_size)와 이어진다:
--   60폭 32,380 · 90폭 39,313 · 127폭 64,750 · **152폭 73,300**
--
-- 되돌리기: `UPDATE items SET avg_unit_cost = 0 WHERE item_code = 'MCP120-152';`

UPDATE items
   SET avg_unit_cost = ROUND(73300.0 / 45.0, 2)   -- 1628.89
 WHERE item_code = 'MCP120-152'
   AND COALESCE(pack_size, 0) = 45;               -- 롤길이가 45m 일 때만(축이 바뀌면 멈춘다)

-- 검증: SELECT avg_unit_cost, avg_unit_cost*pack_size FROM items WHERE item_code='MCP120-152';
--       → 1628.89 · 73,300
