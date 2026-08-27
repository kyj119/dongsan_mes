-- ============================================================================
-- 2026-08-27 환봉나무 규격 분리(90cm·70cm) + 「바로」 뭉친 전표 2건 분해
--
-- 근거 = 용준님이 준 「바로」 거래처원장 (2026-08-27)
--   25.03.20  환봉나무 90cm     54,600 × 140 =  7,644,000  (VAT 포함 8,408,400)
--   25.03.24  로프 3.5mm 200X4     130 × 37,000 = 4,810,000  (VAT 포함 5,291,000)  ⚠️MES 에 없음
--   04.03     환봉나무 90       22,750 × 140 =  3,185,000  (VAT 318,500)
--   04.03     환봉나무 70        5,200 × 140 =    728,000  (VAT  72,800)
--   04.03     로프 3.5 200x4       200 × 37,000 = 7,400,000  (VAT 740,000)
--                                              ─────────────
--                                    04.03 합계  11,313,000  ← MES 전표와 원 단위 일치
--
-- ★원장이 안 맞아 보였던 이유 = **부가세**. 원장은 VAT 포함, MES `amount` 는 공급가액이다
--   (`vat_included=1` 은 「금액에 VAT 가 포함」이 아니라 「과세 대상」이라는 뜻 — `invoice.js:98`
--    이 `supply × 0.1` 로 VAT 를 **더한다**). 7,644,000 × 1.1 = 8,408,400 로 확인.
--
-- ★단가는 4월에도 **140원**이었다. 앞서 「3월 중순~4월 초 150원 인상」으로 추정했던 것은 틀렸다 —
--   11,313,000 이 150 으로 정확히 나눠진 건(75,420) **우연**이었고, 실제로는 140짜리 환봉 2종 +
--   로프의 합이었다. 나눗셈만으로는 구성을 정할 수 없다는 사례다.
--
-- ============================================================================
-- 미해결 (원장 라인 필요) — 이 스크립트는 건드리지 않는다
--   · `E1-PO-3860-20260421`   105,000 — 원본 품명이 **「환봉나무25」** 다(제3의 규격).
--                             140 기준 750개로 딱 떨어지나 규격 확인 전에는 손대지 않는다.
--   · `E1-PO-3860-20260722` 12,815,000 — 140·150 어느 쪽으로도 안 나눠진다. 다른 품목 혼입.
--   ⇒ 위 2건은 `ACC-030-WOOD`(1627) 에 그대로 남긴다. 규격이 확인되면 그때 옮긴다.
--
-- ⚠️**03-24 로프 4,810,000 이 MES 에 없다** — 바로 매입은 4전표뿐이고 어디에도 안 들어간다.
--   재단로프 매입 이력도 판다코리아 01-12(100개·38,000)와 법인간 2건뿐이다.
--   전표를 새로 만들면 **매입 총액이 481만 늘어난다** → 회계 영향이 있어 여기서는 하지 않는다.
-- ============================================================================

-- ── 백업 ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS _bak_0827_wood_item AS
SELECT * FROM items WHERE id = 1627;

CREATE TABLE IF NOT EXISTS _bak_0827_wood_poi AS
SELECT * FROM purchase_order_items WHERE id IN (3407, 3409);

-- ── 1. 규격 품목 2종 신설 ───────────────────────────────────────────────────
-- 형제 규약 = `ACC-030-PIPE-1300`·`-1450`(길이로 갈린다) → `ACC-030-WOOD-90`·`-70`.
-- ★`deduction_method` 는 **NONE**. 형제들은 `ROLL` 인데 그건 DB 기본값이 흘러든 것이고,
--   `resolveStockUnit` 이 base_unit 없는 ROLL 을 **`yd`** 로 라벨한다 — 개수로 세는 봉을
--   야드로 표시하게 된다. (같은 상태의 활성 품목이 409개 있다. 별도 스윕 대상.)
INSERT INTO items (
  category_id, item_code, item_name, specification, unit, item_type, category,
  item_group, group_sort, is_sales_item, is_purchase_item,
  deduction_method, stock_mode, production_required, pricing_method,
  avg_unit_cost, base_price, is_active, search_keywords
) VALUES
  (5, 'ACC-030-WOOD-90', '환봉나무(원목 깃대봉) 90cm', '90cm', 'EA', 'PRODUCT', '원자재',
   '깃대 파이프', 0, 0, 1, 'NONE', 'CONTINUOUS', 0, 'FIXED', 140, 0, 1, '환봉나무 90'),
  (5, 'ACC-030-WOOD-70', '환봉나무(원목 깃대봉) 70cm', '70cm', 'EA', 'PRODUCT', '원자재',
   '깃대 파이프', 0, 0, 1, 'NONE', 'CONTINUOUS', 0, 'FIXED', 140, 0, 1, '환봉나무 70');

-- ── 2. 03-11 전표(7,644,000) → 90cm 54,600개 @140 ───────────────────────────
-- 금액은 그대로다. 수량 1 이 실수량으로 바뀔 뿐이라 매입 총액·회계는 불변.
-- ★`received_quantity` 도 같이 옮긴다 — `line_status='RECEIVED'` 인데 입고수량이 1 로 남으면
--   「54,600 중 1개만 입고」로 읽혀 미입고 잔량이 유령으로 생긴다.
UPDATE purchase_order_items SET
  item_id           = (SELECT id FROM items WHERE item_code = 'ACC-030-WOOD-90'),
  item_name         = '환봉나무(원목 깃대봉) 90cm',
  quantity          = 54600,
  received_quantity = 54600,
  unit_price        = 140,
  amount            = 7644000,
  updated_at        = datetime('now', '+9 hours')
WHERE id = 3407;

-- ── 3. 04-03 전표(11,313,000) → 3라인으로 분해 ──────────────────────────────
UPDATE purchase_order_items SET
  item_id           = (SELECT id FROM items WHERE item_code = 'ACC-030-WOOD-90'),
  item_name         = '환봉나무(원목 깃대봉) 90cm',
  quantity          = 22750,
  received_quantity = 22750,
  unit_price        = 140,
  amount            = 3185000,
  sort_order        = 1,
  updated_at        = datetime('now', '+9 hours')
WHERE id = 3409;

INSERT INTO purchase_order_items
  (po_id, item_id, item_name, category_name, quantity, received_quantity, unit,
   unit_price, amount, vat_included, sort_order, line_status, price_status, notes)
SELECT 674, i.id, '환봉나무(원목 깃대봉) 70cm', i.category, 5200, 5200, 'EA',
       140, 728000, 1, 2, 'RECEIVED', 'CONFIRMED', '2026-08-27 바로 원장으로 분해'
FROM items i WHERE i.item_code = 'ACC-030-WOOD-70';

INSERT INTO purchase_order_items
  (po_id, item_id, item_name, category_name, quantity, received_quantity, unit,
   unit_price, amount, vat_included, sort_order, line_status, price_status, notes)
SELECT 674, i.id, '재단로프 3.5mm (200X4)', i.category, 200, 200, 'EA',
       37000, 7400000, 1, 3, 'RECEIVED', 'CONFIRMED', '2026-08-27 바로 원장으로 분해'
FROM items i WHERE i.item_code = 'ACC-038';

-- ── 4. 재고 취급 등록 ───────────────────────────────────────────────────────
-- ★`inventory` 행이 **법인별 취급의 정본 축**이다([[project-inventory-entity]]) — 행이 없으면
--   재고·실사 화면에서 아예 안 보인다(구역 조회가 INNER JOIN).
-- ⚠️수량은 **0 으로 넣는다**. 매입 누계(90cm 77,350 · 70cm 5,200)는 재고가 아니다 —
--   3~4월 매입분이라 상당량이 이미 소진됐을 텐데 MES 에 소비 기록이 없어 역산이 안 된다.
--   실제 수량은 실사로 넣는다.
INSERT INTO inventory (item_id, quantity, safe_stock, reorder_point, entity_id, storage_zone_id)
SELECT i.id, 0, 0, 0, 1, NULL
FROM items i WHERE i.item_code IN ('ACC-030-WOOD-90', 'ACC-030-WOOD-70')
  AND NOT EXISTS (SELECT 1 FROM inventory v WHERE v.item_id = i.id AND v.entity_id = 1);

-- ============================================================================
-- 검증
--   SELECT po.po_number, poi.item_name, poi.quantity, poi.unit_price, poi.amount
--     FROM purchase_order_items poi JOIN purchase_orders po ON po.id = poi.po_id
--    WHERE poi.po_id IN (576, 674) ORDER BY poi.po_id, poi.sort_order;
--   -- 576 합계 7,644,000 · 674 합계 11,313,000 이어야 한다(전표 total_amount 와 일치)
--
-- ── 롤백 ────────────────────────────────────────────────────────────────────
-- DELETE FROM purchase_order_items
--   WHERE po_id = 674 AND notes = '2026-08-27 바로 원장으로 분해';
-- UPDATE purchase_order_items SET
--   item_id    = (SELECT b.item_id    FROM _bak_0827_wood_poi b WHERE b.id = purchase_order_items.id),
--   item_name  = (SELECT b.item_name  FROM _bak_0827_wood_poi b WHERE b.id = purchase_order_items.id),
--   quantity   = (SELECT b.quantity   FROM _bak_0827_wood_poi b WHERE b.id = purchase_order_items.id),
--   unit_price = (SELECT b.unit_price FROM _bak_0827_wood_poi b WHERE b.id = purchase_order_items.id),
--   amount     = (SELECT b.amount     FROM _bak_0827_wood_poi b WHERE b.id = purchase_order_items.id),
--   sort_order = (SELECT b.sort_order FROM _bak_0827_wood_poi b WHERE b.id = purchase_order_items.id)
-- WHERE id IN (SELECT id FROM _bak_0827_wood_poi);
-- DELETE FROM inventory WHERE item_id IN (SELECT id FROM items WHERE item_code IN ('ACC-030-WOOD-90','ACC-030-WOOD-70'));
-- DELETE FROM items WHERE item_code IN ('ACC-030-WOOD-90', 'ACC-030-WOOD-70');
-- ============================================================================
