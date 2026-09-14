-- 0615: 3축 규격 오분해 라인 정정 (2026-09-15)
-- 2026-09-04 소급 분해가 3숫자 규격(W*D*H)의 두 숫자를 가로·세로 cm 로 넣었다 — `1700x300x100mm` → 30×10.
-- 규칙: 3숫자 규격은 2칸으로 뜯지 않는다(width/height NULL, specification 원문 유지).
-- AREA 품목이던 큐브 제작 2건(광학산PC, 라인 4364·10014)은 그 치수 탓에 단가가 6,333,333·1,166,667원/㎡ 가 되어
-- 「같은 규격 직전가」 제안(routes/prices.ts)을 오염했다 → 라인 축을 FIXED 로 스냅샷(0600 규칙: 축이 바뀌면
-- 같은 커밋에서 환산)하고 단가 = 금액/수량. amount 는 건드리지 않는다.
-- prod 행 id 하드코딩 → 규격 원문·현재 치수까지 일치할 때만 바뀐다(신규 환경·재실행 = no-op).
-- spec = docs/superpowers/specs/2026-09-14-three-axis-and-single-spec-lines.md ③
UPDATE order_items SET width = NULL, height = NULL, pricing_method = 'FIXED',
       unit_price = ROUND(amount / CASE WHEN IFNULL(quantity, 0) = 0 THEN 1 ELSE quantity END)
 WHERE id = 4364 AND specification = '1200x250x150mm' AND width = 25 AND height = 15;
UPDATE order_items SET width = NULL, height = NULL, pricing_method = 'FIXED',
       unit_price = ROUND(amount / CASE WHEN IFNULL(quantity, 0) = 0 THEN 1 ELSE quantity END)
 WHERE id = 10014 AND specification = '1700x300x100mm' AND width = 30 AND height = 10;
UPDATE order_items SET width = NULL, height = NULL
 WHERE id = 9467 AND specification = '2500x1300x70mm' AND width = 130 AND height = 7;
UPDATE order_items SET width = NULL, height = NULL
 WHERE id = 10802 AND specification = '3660x150x100mm' AND width = 15 AND height = 10;
UPDATE order_items SET width = NULL, height = NULL
 WHERE id = 12667 AND specification = '170*100*270' AND width = 170 AND height = 100;
