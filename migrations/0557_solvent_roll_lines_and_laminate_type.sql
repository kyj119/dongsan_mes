-- 0557: 원단 오분류 잔여 2건 — 솔벤 현수막 5줄 이관 + 양면코팅지(50m) 타입 정정
--
-- 배경 = 2026-09-03. `AQ-SYNG`·`AQ-GERILLA` 와 같은 병(제품 코드에 원단 판매)의 잔여분이다.
--   탐지 = PRODUCT 인데 라인이 「높이 0 + 폭만」. 원자료를 보니 둘의 성격이 달랐다.

-- ── 1. 솔벤 현수막(283) 의 5줄 — 셋으로 갈린다 ───────────────────────────────
-- 라인 이름·내용·규격이 각각 무엇인지 말해 준다. 하나로 뭉뚱그려 옮기면 틀린다.
--   1323·1696  「솔벤매쉬-배너」 60폭/50m  @84,000 ×2   → 솔벤 매쉬 60cm (SVM-060 등록 64,100/롤)
--   1847·2444  「솔밴매쉬-배너」 127폭     @168,000·173,000 → 솔벤 매쉬 127cm (SVM-127 등록 123,800/롤)
--   1895       「솔벤 현수막」 152폭 q=148 @1,400 · 내용 `148yd*1`
--                                                  → 솔벤 현수막 원단 150cm (SVB-152 등록 1,500/yd)
-- ⚠️ 1895 만 yd 단가가 등록값과 **거의 일치**(1,400 vs 1,500)해서 확실하다. 매쉬 4줄은 롤 단가라
--    등록 매입가 대비 31~40% 위인데, 그게 판매 마진이라 자연스럽다.
-- ⚠️ 되돌리기 = 아래 id 로 되돌린다. 대상 자재에는 원래 라인이 있어 폭으로는 구분이 안 된다.
--    복구 = UPDATE order_items SET item_id=(SELECT id FROM items WHERE item_code='SV-BANNER')
--           WHERE id IN (1323,1696,1847,2444,1895);
UPDATE order_items
   SET item_id = (SELECT id FROM items WHERE item_code = 'SVM-060'), updated_at = datetime('now')
 WHERE id IN (1323, 1696) AND item_id = (SELECT id FROM items WHERE item_code = 'SV-BANNER');

UPDATE order_items
   SET item_id = (SELECT id FROM items WHERE item_code = 'SVM-127'), updated_at = datetime('now')
 WHERE id IN (1847, 2444) AND item_id = (SELECT id FROM items WHERE item_code = 'SV-BANNER');

UPDATE order_items
   SET item_id = (SELECT id FROM items WHERE item_code = 'SVB-152'), updated_at = datetime('now')
 WHERE id = 1895 AND item_id = (SELECT id FROM items WHERE item_code = 'SV-BANNER');

-- ── 2. 양면코팅지(50m) 127폭 — 옮길 곳이 없다. 자기 타입이 틀렸다 ─────────────
-- 1578 은 이름부터 「양면코팅지(50m) 127폭」이고 분류가 `원자재` 인데 `item_type='PRODUCT'` 다.
-- 라인 3줄 전부 「127x0 · q=1~2 · 86,000~99,000원 · 영기획」 = 롤 판매다.
-- 계열 열거 결과 **50m 짜리는 이 하나뿐이고 MATERIAL 쌍이 없다** → 이관할 대상이 없다.
-- 형제는 전부 **GOODS**(사입 후 재판매)다:
--   HJ-YMSIDE-P90/P127(30m) · JG-A26-P90/P127(30m) — JG-A26-P127 은 매입 3줄도 있다.
-- 그래서 이관이 아니라 **자기 타입을 GOODS 로** 고친다. 라인은 그대로 붙어 있어도 맞다.
--
-- ⚠️ 이 행은 2026-08-08 등록 사고와 같은 대역(id 1578)이지만 `0551` 에서 안 걸렸다 —
--    그때 기준이 「같은 이름이 PRODUCT·MATERIAL 양쪽에 있는 계열」이었는데 이건 쌍이 없었다.
--    탐지 축이 다르면 같은 사고도 안 보인다는 뜻이다.
-- ⚠️ `category_id=5(원자재)` 는 **손대지 않는다** — 같은 상태인 PRODUCT 행이 85개 더 있고,
--    분류 축 정리는 별건으로 남겨 뒀다(0551 주석 참조). 여기만 고치면 기준이 갈린다.
UPDATE items
   SET item_type = 'GOODS', updated_at = datetime('now')
 WHERE item_code = 'HJ-YMSIDE50-P127' AND item_type = 'PRODUCT';
