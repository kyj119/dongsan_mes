-- ============================================================================
-- 2026-08-27 (3) 정정 — 25파이 단가는 350원이고, 07-22 전표는 적요로 풀린다
--
-- ★★**`purchase_order_items.notes` 에 세무장부 적요가 이미 들어 있었다.**
--   이관 스크립트가 「금액 전용 적재」를 하면서 원문 적요를 남겨 뒀는데, 뭉친 전표를
--   푼다면서 **정작 그 필드를 안 읽었다**. 원장을 사람에게 물어보기 전에 여기부터 봤어야 했다.
--
--   | 라인 | 적요 원문 | 해석 |
--   |---|---|---|
--   | 3407 (03-11) | 「환봉나무 54,600 X 140」 | 54,600 × 140 = 7,644,000 = 전표 전액 ✅ |
--   | 3409 (04-03) | 수량 표기 없음 | 용준님 원장으로 3라인 분해 ✅ |
--   | 3410 (04-21) | 「환봉나무25 **300 X 350**」 | 300 × 350 = 105,000 ✅ |
--   | 3408 (07-22) | 「환봉나무 54,600 X **150**」 | 54,600 × 150 = 8,190,000 (전표 12,815,000 중) |
--
-- ⛔**앞 스크립트에서 3410 을 750개 × 140원으로 넣은 것은 틀렸다.** 105,000 이 140 으로 나눠진다는
--   이유만으로 역산했는데, 실제는 **300개 × 350원**이다. 25파이는 굵어서 단가가 2.5배다.
--   ★이 건이 같은 날 두 번째 사례다 — **정수로 떨어지는 건 증거가 아니다**(04-03 도 150 으로 딱 떨어졌지만
--   실제는 140짜리 2종 + 로프였다). 단가 후보가 하나가 아닐 땐 나눗셈으로 결론을 내면 안 된다.
--
-- ★단가 인상 시점이 이제 확정된다 — 03·04 = **140** · 07 = **150**. 용준님 「최근에 올랐다」와 맞는다.
--
-- ── 07-22 전표(12,815,000) ──────────────────────────────────────────────────
--   적요로 확증되는 부분  환봉나무 54,600 × 150 =  8,190,000
--   잔액                                        =  4,625,000  ← **미상**
--   ⚠️잔액 4,625,000 은 37,000(로프 단가)으로 정확히 125 가 나오지만 **그걸로 확정하지 않는다** —
--     위에서 나눗셈을 믿었다가 두 번 틀렸다. 적요에 없는 건 원장으로 확인한다.
--     별도 라인으로 떼어 「미상」으로 표시만 해 둔다(전표 총액은 그대로).
--   ⚠️환봉 54,600 의 **규격은 적요에 없다**. 03-20 과 수량이 같아(54,600) 90cm 로 넣되 notes 에 남긴다.
--
-- 백업: _bak_0827_wood25_poi(3410 · 앞 스크립트에서 생성) · _bak_0827_wood_poi2(3408)
-- ============================================================================

CREATE TABLE IF NOT EXISTS _bak_0827_wood_poi2 AS
SELECT * FROM purchase_order_items WHERE id = 3408;

-- ── 1. 25파이 정정 — 750 × 140 → 300 × 350 ─────────────────────────────────
UPDATE purchase_order_items SET
  quantity          = 300,
  received_quantity = 300,
  unit_price        = 350,
  amount            = 105000,
  notes             = '세무장부 전표 50034 · 적요 「환봉나무25 300 X 350」 = 300개 × 350원',
  updated_at        = datetime('now', '+9 hours')
WHERE id = 3410;

UPDATE items SET avg_unit_cost = 350, updated_at = datetime('now', '+9 hours')
WHERE item_code = 'ACC-030-WOOD-25P';

-- ── 2. 07-22 전표 분해 — 적요분 + 미상 잔액 ────────────────────────────────
UPDATE purchase_order_items SET
  item_id           = (SELECT id FROM items WHERE item_code = 'ACC-030-WOOD-90'),
  item_name         = '환봉나무(원목 깃대봉) 90cm',
  quantity          = 54600,
  received_quantity = 54600,
  unit_price        = 150,
  amount            = 8190000,
  sort_order        = 1,
  notes             = '세무장부 전표 50009 · 적요 「환봉나무 54,600 X 150」. ⚠️규격은 적요에 없음 — 03-20 과 동일 수량이라 90cm 로 추정',
  updated_at        = datetime('now', '+9 hours')
WHERE id = 3408;

INSERT INTO purchase_order_items
  (po_id, item_id, item_name, category_name, quantity, received_quantity, unit,
   unit_price, amount, vat_included, sort_order, line_status, price_status, notes)
SELECT 519, i.id, '(미상) 07-22 전표 잔액', i.category, 1, 1, 'EA',
       4625000, 4625000, 1, 2, 'RECEIVED', 'CONFIRMED',
       '전표 12,815,000 − 적요분 8,190,000. 품목 미상 — 바로 원장 07월분 확인 필요'
FROM items i WHERE i.item_code = 'ACC-030-WOOD';

-- ── 3. 가중평균 원가 재설정 ────────────────────────────────────────────────
-- 90cm = (54,600×140 + 22,750×140 + 54,600×150) ÷ 131,950 = 19,019,000 ÷ 131,950 = 144.14
UPDATE items SET avg_unit_cost = 144.14, updated_at = datetime('now', '+9 hours')
WHERE item_code = 'ACC-030-WOOD-90';
-- 70cm = 5,200 × 140 단일 → 140 (변경 없음)

-- ============================================================================
-- 검증
--   SELECT po.po_number, poi.sort_order, poi.item_name, poi.quantity, poi.unit_price, poi.amount
--     FROM purchase_order_items poi JOIN purchase_orders po ON po.id=poi.po_id
--    WHERE poi.po_id IN (519,576,674,675) ORDER BY po.order_date, poi.sort_order;
--   -- 519 합계 12,815,000 · 576 = 7,644,000 · 674 = 11,313,000 · 675 = 105,000
--
-- ── 롤백 ────────────────────────────────────────────────────────────────────
-- DELETE FROM purchase_order_items WHERE po_id = 519 AND item_name = '(미상) 07-22 전표 잔액';
-- UPDATE purchase_order_items SET
--   item_id=(SELECT b.item_id FROM _bak_0827_wood_poi2 b WHERE b.id=purchase_order_items.id),
--   item_name=(SELECT b.item_name FROM _bak_0827_wood_poi2 b WHERE b.id=purchase_order_items.id),
--   quantity=(SELECT b.quantity FROM _bak_0827_wood_poi2 b WHERE b.id=purchase_order_items.id),
--   received_quantity=(SELECT b.received_quantity FROM _bak_0827_wood_poi2 b WHERE b.id=purchase_order_items.id),
--   unit_price=(SELECT b.unit_price FROM _bak_0827_wood_poi2 b WHERE b.id=purchase_order_items.id),
--   amount=(SELECT b.amount FROM _bak_0827_wood_poi2 b WHERE b.id=purchase_order_items.id),
--   notes=(SELECT b.notes FROM _bak_0827_wood_poi2 b WHERE b.id=purchase_order_items.id)
-- WHERE id = 3408;
-- ============================================================================
