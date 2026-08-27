-- ============================================================================
-- 2026-08-27 (7) 「영광엔터테인먼트」 뭉친 전표 적요 분해 — 1,242만 중 1,038만
--
-- ★배경: 앞서 "적요에 수량이 있는 건 2건(880만)" 이라고 보고했으나, `poi.notes` 를
--   전수로 펼쳐 보니 **7건(1,038만)** 이었다. 2건만 센 것은 「적요분 = 공급가」인
--   경우만 세었기 때문이고, 실제로는 **적요분 < 공급가** 인 건이 대부분이다
--   (세무장부 적요는 거래명세서의 **대표 품명 1줄만** 싣는다 — poi 3418 주석에
--    이미 "대표품명+그 외" 라고 적혀 있었다).
--
-- ⇒ 그래서 분해 규약은 「적요 수량줄 + (미상) 잔액줄」 이다. 바로 07-22 선례와 동일
--   (`purchase_order_items` id 3408 + 3958).
--
-- ★단가 교차확인 — 적요만 믿지 않는다:
--   ACC-051 22,000 → 01-31 전표에 **수량이 실린 진짜 라인**(10 X 22,000)이 이미 있다
--   ACC-052 35,000 → 04-30(5개) · 08-05(5개) 두 수량 라인이 이미 있다
--   ACC-053 11,000 → 수량 라인 없음. **적요가 유일 근거**(잔액 50,000 은 미상 유지)
--
-- ⚠️전표 합계는 절대 바뀌지 않는다 — 「적요분 + 잔액 = 원금액」 이므로
--   `purchase_orders.total_amount` = 라인합 불변식이 유지된다(영광 9전표 전부 성립 중).
--   매입 총액·손익·AP 에 영향 0. 바뀌는 것은 **수량과 품목별 원가**뿐이다.
--
-- 대상 7행 (합 11,705,000 = 적요분 10,380,000 + 잔액 1,325,000)
--   poi 3418 (po 524) 380,000   → 우승기 부속 10 X 22,000 = 220,000   + 잔액 160,000
--   poi 3419 (po 525) 435,000   → 깃발부속   15 X 22,000 = 330,000   + 잔액 105,000
--   poi 3420 (po 526) 5,750,000 → 우승기 부속 250 X 22,000 = 5,500,000 + 잔액 250,000
--   poi 3422 (po 526) 235,000   → 깃발부속   10 X 22,000 = 220,000   + 잔액  15,000
--   poi 3423 (po 527) 3,825,000 → 우승기 부속 150 X 22,000 = 3,300,000 + 잔액 525,000
--   poi 3425 (po 528) 160,000   → 우승기 깃대 10 X 11,000 = 110,000   + 잔액  50,000
--   poi 3426 (po 529) 920,000   → 원형 받침대 20 X 35,000 = 700,000   + 잔액 220,000
--
-- ⛔건드리지 않는 2행 = 01-31 poi 3416(445,000) · 3417(270,000).
--   적요에 수량이 아예 없다(「금액 전용」) → 청구서 없이는 근거가 없다.
--   ⇒ 영광엔터 미해소 잔액 = 1,325,000 + 715,000 = **2,040,000**
--
-- 의존행 0 확인: inventory_receipts · inventory_transactions(PURCHASE) · purchase_invoices
--   모두 po 523~530 에 대해 0건 → 라인 수정의 파급 없음.
-- 멱등 = UPDATE 는 원값 조건으로, INSERT 는 item_name NOT EXISTS 로 막는다.
-- ============================================================================

-- ── 백업 ────────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS _bak_0827_yg_poi;
CREATE TABLE _bak_0827_yg_poi AS
  SELECT * FROM purchase_order_items WHERE id IN (3418,3419,3420,3422,3423,3425,3426);

DROP TABLE IF EXISTS _bak_0827_yg_items;
CREATE TABLE _bak_0827_yg_items AS
  SELECT id, item_code, avg_unit_cost FROM items WHERE item_code IN ('ACC-051','ACC-052','ACC-053','ACC-054-NS');

-- ── 1) 뭉친 라인 → 적요 수량 라인으로 전환 ──────────────────────────────────
UPDATE purchase_order_items SET quantity=10, received_quantity=10, unit_price=22000, amount=220000,
  notes='02-11 전표 50015 · 적요 「우승기 부속 10 X 22,000」 (2026-08-27 분해 · 잔액 별도 라인)',
  updated_at=datetime('now','+9 hours')
WHERE id=3418 AND quantity=1 AND amount=380000;

UPDATE purchase_order_items SET quantity=15, received_quantity=15, unit_price=22000, amount=330000,
  notes='03-25 전표 50012 · 적요 「깃발부속 15 X 22,000」 (2026-08-27 분해 · 잔액 별도 라인)',
  updated_at=datetime('now','+9 hours')
WHERE id=3419 AND quantity=1 AND amount=435000;

UPDATE purchase_order_items SET quantity=250, received_quantity=250, unit_price=22000, amount=5500000,
  notes='04-06 전표 50011 · 적요 「우승기 부속 250 X 22,000」 (2026-08-27 분해 · 잔액 별도 라인)',
  updated_at=datetime('now','+9 hours')
WHERE id=3420 AND quantity=1 AND amount=5750000;

UPDATE purchase_order_items SET quantity=10, received_quantity=10, unit_price=22000, amount=220000,
  notes='04-30 전표 50014 · 적요 「깃발부속 10 X 22,000」 (2026-08-27 분해 · 잔액 별도 라인)',
  updated_at=datetime('now','+9 hours')
WHERE id=3422 AND quantity=1 AND amount=235000;

UPDATE purchase_order_items SET quantity=150, received_quantity=150, unit_price=22000, amount=3300000,
  notes='05-14 전표 50016 · 적요 「우승기 부속 150 X 22,000」 (2026-08-27 분해 · 잔액 별도 라인)',
  updated_at=datetime('now','+9 hours')
WHERE id=3423 AND quantity=1 AND amount=3825000;

UPDATE purchase_order_items SET quantity=10, received_quantity=10, unit_price=11000, amount=110000,
  notes='06-10 전표 50003 · 적요 「우승기 깃대 10 X 11,000」 (2026-08-27 분해 · 잔액 별도 라인) ⚠️수량 라인 교차확인 없음',
  updated_at=datetime('now','+9 hours')
WHERE id=3425 AND quantity=1 AND amount=160000;

UPDATE purchase_order_items SET quantity=20, received_quantity=20, unit_price=35000, amount=700000,
  notes='07-06 전표 50010 · 적요 「원형 받침대 20 X 35,000」 (2026-08-27 분해 · 잔액 별도 라인)',
  updated_at=datetime('now','+9 hours')
WHERE id=3426 AND quantity=1 AND amount=920000;

-- ── 2) 잔액 라인 신설 (품목 미상 · 청구서 오면 여기서 다시 쪼갠다) ──────────
INSERT INTO purchase_order_items (po_id, item_id, item_name, category_name, quantity, received_quantity,
  unit, unit_price, amount, vat_included, sort_order, line_status, price_status, notes)
SELECT s.po_id, s.item_id, s.nm, s.category_name, 1, 1, s.unit, s.amt, s.amt, s.vat_included,
       s.sort_order + 50, s.line_status, s.price_status, s.nt
FROM (
  SELECT p.po_id, p.item_id, p.category_name, p.unit, p.vat_included, p.sort_order, p.line_status, p.price_status,
         '(미상) 02-11 전표 50015 잔액' AS nm, 160000 AS amt,
         '공급가 380,000 − 적요분 220,000. 세무장부 적요는 대표품명 1줄만 실린다 → 나머지 품목 미상. 영광엔터 거래명세서 필요' AS nt
    FROM purchase_order_items p WHERE p.id=3418
) s WHERE NOT EXISTS (SELECT 1 FROM purchase_order_items x WHERE x.po_id=s.po_id AND x.item_name=s.nm);

INSERT INTO purchase_order_items (po_id, item_id, item_name, category_name, quantity, received_quantity,
  unit, unit_price, amount, vat_included, sort_order, line_status, price_status, notes)
SELECT s.po_id, s.item_id, s.nm, s.category_name, 1, 1, s.unit, s.amt, s.amt, s.vat_included,
       s.sort_order + 50, s.line_status, s.price_status, s.nt
FROM (
  SELECT p.po_id, p.item_id, p.category_name, p.unit, p.vat_included, p.sort_order, p.line_status, p.price_status,
         '(미상) 03-25 전표 50012 잔액' AS nm, 105000 AS amt,
         '공급가 435,000 − 적요분 330,000. 품목 미상 — 영광엔터 거래명세서 필요' AS nt
    FROM purchase_order_items p WHERE p.id=3419
) s WHERE NOT EXISTS (SELECT 1 FROM purchase_order_items x WHERE x.po_id=s.po_id AND x.item_name=s.nm);

INSERT INTO purchase_order_items (po_id, item_id, item_name, category_name, quantity, received_quantity,
  unit, unit_price, amount, vat_included, sort_order, line_status, price_status, notes)
SELECT s.po_id, s.item_id, s.nm, s.category_name, 1, 1, s.unit, s.amt, s.amt, s.vat_included,
       s.sort_order + 50, s.line_status, s.price_status, s.nt
FROM (
  SELECT p.po_id, p.item_id, p.category_name, p.unit, p.vat_included, p.sort_order, p.line_status, p.price_status,
         '(미상) 04-06 전표 50011 잔액' AS nm, 250000 AS amt,
         '공급가 5,750,000 − 적요분 5,500,000. 품목 미상 — 영광엔터 거래명세서 필요' AS nt
    FROM purchase_order_items p WHERE p.id=3420
) s WHERE NOT EXISTS (SELECT 1 FROM purchase_order_items x WHERE x.po_id=s.po_id AND x.item_name=s.nm);

INSERT INTO purchase_order_items (po_id, item_id, item_name, category_name, quantity, received_quantity,
  unit, unit_price, amount, vat_included, sort_order, line_status, price_status, notes)
SELECT s.po_id, s.item_id, s.nm, s.category_name, 1, 1, s.unit, s.amt, s.amt, s.vat_included,
       s.sort_order + 50, s.line_status, s.price_status, s.nt
FROM (
  SELECT p.po_id, p.item_id, p.category_name, p.unit, p.vat_included, p.sort_order, p.line_status, p.price_status,
         '(미상) 04-30 전표 50014 잔액' AS nm, 15000 AS amt,
         '공급가 235,000 − 적요분 220,000. 품목 미상 — 영광엔터 거래명세서 필요' AS nt
    FROM purchase_order_items p WHERE p.id=3422
) s WHERE NOT EXISTS (SELECT 1 FROM purchase_order_items x WHERE x.po_id=s.po_id AND x.item_name=s.nm);

INSERT INTO purchase_order_items (po_id, item_id, item_name, category_name, quantity, received_quantity,
  unit, unit_price, amount, vat_included, sort_order, line_status, price_status, notes)
SELECT s.po_id, s.item_id, s.nm, s.category_name, 1, 1, s.unit, s.amt, s.amt, s.vat_included,
       s.sort_order + 50, s.line_status, s.price_status, s.nt
FROM (
  SELECT p.po_id, p.item_id, p.category_name, p.unit, p.vat_included, p.sort_order, p.line_status, p.price_status,
         '(미상) 05-14 전표 50016 잔액' AS nm, 525000 AS amt,
         '공급가 3,825,000 − 적요분 3,300,000. 품목 미상 — 영광엔터 거래명세서 필요' AS nt
    FROM purchase_order_items p WHERE p.id=3423
) s WHERE NOT EXISTS (SELECT 1 FROM purchase_order_items x WHERE x.po_id=s.po_id AND x.item_name=s.nm);

INSERT INTO purchase_order_items (po_id, item_id, item_name, category_name, quantity, received_quantity,
  unit, unit_price, amount, vat_included, sort_order, line_status, price_status, notes)
SELECT s.po_id, s.item_id, s.nm, s.category_name, 1, 1, s.unit, s.amt, s.amt, s.vat_included,
       s.sort_order + 50, s.line_status, s.price_status, s.nt
FROM (
  SELECT p.po_id, p.item_id, p.category_name, p.unit, p.vat_included, p.sort_order, p.line_status, p.price_status,
         '(미상) 06-10 전표 50003 잔액' AS nm, 50000 AS amt,
         '공급가 160,000 − 적요분 110,000. 품목 미상 — 영광엔터 거래명세서 필요' AS nt
    FROM purchase_order_items p WHERE p.id=3425
) s WHERE NOT EXISTS (SELECT 1 FROM purchase_order_items x WHERE x.po_id=s.po_id AND x.item_name=s.nm);

INSERT INTO purchase_order_items (po_id, item_id, item_name, category_name, quantity, received_quantity,
  unit, unit_price, amount, vat_included, sort_order, line_status, price_status, notes)
SELECT s.po_id, s.item_id, s.nm, s.category_name, 1, 1, s.unit, s.amt, s.amt, s.vat_included,
       s.sort_order + 50, s.line_status, s.price_status, s.nt
FROM (
  SELECT p.po_id, p.item_id, p.category_name, p.unit, p.vat_included, p.sort_order, p.line_status, p.price_status,
         '(미상) 07-06 전표 50010 잔액' AS nm, 220000 AS amt,
         '공급가 920,000 − 적요분 700,000. 품목 미상 — 영광엔터 거래명세서 필요' AS nt
    FROM purchase_order_items p WHERE p.id=3426
) s WHERE NOT EXISTS (SELECT 1 FROM purchase_order_items x WHERE x.po_id=s.po_id AND x.item_name=s.nm);

-- ── 3) 원가 공백 메우기 ─────────────────────────────────────────────────────
-- 분해 후 수량 라인이 생기므로 가중평균이 계산된다. 셋 다 `is_sales_item=1` 인데
-- `avg_unit_cost` 가 **0** 이었다 → 마진이 100% 로 잡히던 품목들이다.
--   ACC-051 우승기 부속/깃발부속 : 445개(10+10+15+250+10+150) 전부 22,000 → 22,000
--   ACC-053 우승기 깃대          : 10개 11,000 → 11,000  (⚠️적요 단일 근거)
--   ACC-054-NS 목창꽂이(창없이)  : 350개(200−200+200+150) 전부 3,500 → 3,500
--       ★이건 분해와 무관하다 — 애초에 수량 라인 3건이 다 3,500 인데 avg 가 0이었다.
--   ACC-052 원형 받침대          : 이미 35,000, 신설 20개도 35,000 → 변경 없음
-- ⚠️`POST /inventory-valuation/recalculate-avg` 는 `inventory_transactions` IN 행이
--   있는 품목만 UPDATE 한다(`inventoryValuation.ts:150-158`). 이 4품목은 IN 행이 0건이라
--   **대상 밖** → 여기서 넣은 값이 되돌아가지 않는다. (ACC-038 과 동일 근거)
UPDATE items SET avg_unit_cost=22000, updated_at=datetime('now','+9 hours')
WHERE item_code='ACC-051' AND avg_unit_cost=0;
UPDATE items SET avg_unit_cost=11000, updated_at=datetime('now','+9 hours')
WHERE item_code='ACC-053' AND avg_unit_cost=0;
UPDATE items SET avg_unit_cost=3500, updated_at=datetime('now','+9 hours')
WHERE item_code='ACC-054-NS' AND avg_unit_cost=0;

-- ============================================================================
-- 검증
--   -- (1) 전표 합계 불변식 — 9전표 전부 diff 0 이어야 한다
--   SELECT po.po_number, po.total_amount,
--          (SELECT SUM(x.amount) FROM purchase_order_items x WHERE x.po_id=po.id) AS line_sum
--     FROM purchase_orders po JOIN clients c ON c.id=po.supplier_id
--    WHERE c.client_name LIKE '%영광%' AND po.total_amount > 0;
--
--   -- (2) 남은 뭉친 라인 = 2,040,000 (미상 잔액 7 + 01-31 금액전용 2)
--   SELECT SUM(poi.amount) FROM purchase_order_items poi
--     JOIN purchase_orders po ON po.id=poi.po_id JOIN clients c ON c.id=po.supplier_id
--    WHERE c.client_name LIKE '%영광%' AND poi.quantity=1;
--
--   -- (3) 원가
--   SELECT item_code, avg_unit_cost, base_price FROM items
--    WHERE item_code IN ('ACC-051','ACC-052','ACC-053','ACC-054-NS');
--
-- ── 롤백 ────────────────────────────────────────────────────────────────────
-- DELETE FROM purchase_order_items WHERE item_name LIKE '(미상) %전표 5%잔액'
--   AND po_id IN (524,525,526,527,528,529);
-- UPDATE purchase_order_items SET quantity=(SELECT b.quantity FROM _bak_0827_yg_poi b WHERE b.id=purchase_order_items.id),
--   received_quantity=(SELECT b.received_quantity FROM _bak_0827_yg_poi b WHERE b.id=purchase_order_items.id),
--   unit_price=(SELECT b.unit_price FROM _bak_0827_yg_poi b WHERE b.id=purchase_order_items.id),
--   amount=(SELECT b.amount FROM _bak_0827_yg_poi b WHERE b.id=purchase_order_items.id),
--   notes=(SELECT b.notes FROM _bak_0827_yg_poi b WHERE b.id=purchase_order_items.id)
--   WHERE id IN (SELECT id FROM _bak_0827_yg_poi);
-- UPDATE items SET avg_unit_cost=(SELECT b.avg_unit_cost FROM _bak_0827_yg_items b WHERE b.id=items.id)
--   WHERE id IN (SELECT id FROM _bak_0827_yg_items);
-- ============================================================================
