-- ⚠️ 재생 가드 (2026-09-10) — 이 마이그는 **prod 의 발주 id 를 하드코딩**한다(489·491·493·494·496·498·517).
--   신규 환경(`db:bootstrap:ci`·`db:reset`)에는 그 발주가 없어 FK 위반으로 죽었다 → 회수하면서
--   각 INSERT 를 `WHERE EXISTS (purchase_orders.id=…)` 로 감쌌다. **prod 동작은 안 바뀐다**
--   (거기엔 행이 있고, 이미 적용도 끝났다). 로컬에서는 통째로 no-op 이 된다.

-- 0573: 재현테크 UV 잉크 매입을 **색상별 라인**으로 펴고, 바니시 품목을 만든다
--
-- 무엇이 잘못돼 있었나 (2026-09-08 이카운트 발주서현황으로 확인)
--   이관이 재현테크 전표를 「수량 1 · 단가=전표금액」 한 줄로 넣었다. 품명 원문에 남은
--   「5 X 184,000」을 제가 처음엔 뭉친 전표로 읽었는데, 용준님 확인 결과 **그 5는 수량이 아니라
--   색상 라인 수**였다. 금액은 처음부터 맞았다 — 1,840,000 ÷ 184,000 = 정확히 10통이고,
--   무상 1통을 더하면 이카운트 발주 수량 11개와 일치한다.
--   ⇒ 뭉침이 아니라 **수량·색상이 통째로 비어 있던 것**이다.
--
-- 왜 고치나 — 금액은 안 바뀌므로 매입총액·AP·손익에 영향이 **0**이다. 바뀌는 것은
--   ① 색상별 소비 추적이 가능해지고 ② 재고 통수가 실물과 맞고 ③ `avg_unit_cost` 가 실제값이 된다.
--   지금은 통당 단가가 1,840,000원으로 잡혀 재고 평가액이 10배 부풀어 있다.
--
-- ★무상 공급은 **10개당 1개**다(용준님 2026-09-08). 반영 방식 = **수량에 더하고 단가를 낮춘다**
--   (용준님 선택). 전표 금액 ÷ 실물 통수 = 균등단가 167,273원. 무상이 붙은 색만 깎지 않는 이유는
--   무상이 전표 전체에 대한 서비스이지 특정 색에 대한 할인이 아니기 때문이다.
--   ⇒ 재고 통수가 실물과 맞고, 잉크 ㎡단가도 자동으로 정확해진다.
--
-- ★평판잉크 단가가 2배로 틀려 있었다 — 184,000 은 R50(2L)의 값인데 평판에 복사돼 있었다.
--   이카운트 실제는 **92,000**(C·M·Y·K)이고, **바니시(V)는 150,000 으로 품목 자체가 없었다**.
--
-- 대조표 (MES 일자 = 세무장부 납품일 · 이카운트 = 발주일. 일자는 MES 것을 유지한다)
--   MES 01-15 1,840,000 ← 01/14  R50   C5 · Y4+무상1 · M1        = 11통
--   MES 03-03 1,762,000 ← 02/26  평판  M3 · Y6 · K2 @92,000 + V5 @150,000 = 16통
--   MES 03-18 1,840,000 ← 03/17  R50   C1 · M5 · Y3+무상1 · K1   = 11통
--   MES 04-24 1,840,000 ← 04/24  R50   C3 · M3 · Y3+무상1 · K1   = 11통
--   MES 06-15 3,680,000 ← 06/12  R50   C6 · M5 · Y5+무상2 · K4   = 22통
--   MES 07-31 1,070,000 ← 07/16  평판  C3 · M3 · Y4 @92,000 + V1 @150,000 = 11통
--   MES 04-08   942,000 ← 이카운트에 **없는 건**(발주서·구매현황 모두). 용준님 확인으로 풀렸다 —
--                          C·M·Y·K 각 2통 @92,000 + **W 2통 @103,000** = 942,000.
--   ⚠️ 이카운트 08/14 발주 1,840,000(11통)은 **MES 에 아직 적재되지 않았다**(8월 매입 미반영).
--
-- 안전성
--   · `purchase_invoice_items` 참조 **0건** 확인 후 분해한다(계산서에 물린 라인이 없다).
--   · 기존 라인은 **삭제하지 않고 첫 색상으로 UPDATE** 하고 나머지 색상만 INSERT 한다 — id 보존.
--   · 전표별 금액 합이 보존되므로 `purchase_orders.total_amount` = 라인합 불변식이 유지된다.
--   · 잉크는 `inventory_transactions` 가 0행이라 `recalculate-avg` 가 닿지 않는다 →
--     `avg_unit_cost` 를 여기서 직접 넣는다(그래서 이 값은 다음 입고 때도 덮이지 않는다).
--
-- 되돌리기: `_bak_0573_jaehyun_ink` 에 원래 7줄이 그대로 있다.

-- ── 0. 백업 ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS _bak_0573_jaehyun_ink AS
SELECT id, po_id, item_id, item_name, quantity, unit, unit_price, amount, notes
  FROM purchase_order_items
 WHERE id IN (3105, 3107, 3109, 3110, 3112, 3114, 3503);

CREATE TABLE IF NOT EXISTS _bak_0573_ink_avgcost AS
SELECT id, item_code, item_name, avg_unit_cost
  FROM items WHERE item_code IN
  ('RM-I0040','RM-I0041','RM-I0042','RM-I0043','RM-I0044',
   'RM-I0045','RM-I0046','RM-I0047','RM-I0048','RM-I0049');

-- ── 1. 바니시 품목 신설 ──────────────────────────────────────────────────────
-- 평판 4x8 전용. 이카운트 발주에 「평판잉크 [V]」로 6통 들어와 있는데 MES 에 품목이 없었다.
-- 다른 색(92,000)보다 비싼 150,000 이라 한 품목으로 뭉치면 평균이 틀어진다.
-- 컬럼 구성은 형제 품목(RM-I0045 평판잉크 C)을 그대로 따른다 — unit='통' · pricing_method='FIXED'.
-- ⚠️`category_id` 는 NOT NULL 이다(로컬 적용에서 걸렸다). 문자열 `category` 만 채우면 INSERT 가 막힌다.
--   형제 품목에서 그대로 읽어 와 둘이 갈리지 않게 한다.
INSERT INTO items (item_code, item_name, item_group, category_id, category, item_type, unit,
                   avg_unit_cost, deduction_method, is_active, pricing_method, search_keywords)
SELECT 'RM-I0086', '평판잉크 V (바니시)', 'UV잉크 평판',
       -- 형제에서 읽되 **폴백을 둔다** — 로컬 D1 은 비어 있어 서브쿼리가 NULL 이 되고,
       -- category_id 가 NOT NULL 이라 그대로면 마이그레이션 문법 검증 자체가 불가능해진다.
       COALESCE((SELECT category_id FROM items WHERE item_code = 'RM-I0045'), 5),
       COALESCE((SELECT category    FROM items WHERE item_code = 'RM-I0045'), '원자재'),
       'MATERIAL', '통', 150000, 'NONE', 1, 'FIXED',
       '평판 4x8 플랫베드 Flatbed 바니시 바니쉬 Varnish V 재현테크 유브이'
 WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code = 'RM-I0086');

-- ── 2. 전표별 색상 분해 ──────────────────────────────────────────────────────
-- R50 균등단가 = 167,273원 (1,840,000 ÷ 11통 · 3,680,000 ÷ 22통 — 둘 다 같다).
-- 금액은 반올림 잔차를 마지막 색에 몰아 전표 합계를 정확히 맞춘다.

-- 2-1. 01-15 (poi 3105) — C5 · Y5 · M1 = 11통 / 1,840,000
UPDATE purchase_order_items
   SET item_id = (SELECT id FROM items WHERE item_code = 'RM-I0040'),
       item_name = 'R50 UV 잉크-C [2L]', quantity = 5, unit = 'EA',
       unit_price = 167273, amount = 836364,
       notes = '[0573] 이카운트 발주 01/14 · 11통(유상10+무상1) 균등단가'
 WHERE id = 3105;
INSERT INTO purchase_order_items (po_id, item_id, item_name, quantity, unit, unit_price, amount, sort_order, notes)
SELECT * FROM (
SELECT 489, (SELECT id FROM items WHERE item_code='RM-I0042'), 'R50 UV 잉크-Y [2L]', 5, 'EA', 167273, 836364, 2, '[0573] 이카운트 발주 01/14 (무상 1통 포함)'
UNION ALL SELECT 489, (SELECT id FROM items WHERE item_code='RM-I0041'), 'R50 UV 잉크-M [2L]', 1, 'EA', 167272, 167272, 3, '[0573] 이카운트 발주 01/14'
) WHERE EXISTS (SELECT 1 FROM purchase_orders WHERE id = 489);

-- 2-2. 03-03 (poi 3107) — 평판 M3 · Y6 · K2 @92,000 + V5 @150,000 = 16통 / 1,762,000
UPDATE purchase_order_items
   SET item_id = (SELECT id FROM items WHERE item_code = 'RM-I0046'),
       item_name = '평판잉크 M', quantity = 3, unit = 'EA',
       unit_price = 92000, amount = 276000,
       notes = '[0573] 이카운트 발주 02/26 · 무상 없음(원 단가 그대로)'
 WHERE id = 3107;
INSERT INTO purchase_order_items (po_id, item_id, item_name, quantity, unit, unit_price, amount, sort_order, notes)
SELECT * FROM (
SELECT 491, (SELECT id FROM items WHERE item_code='RM-I0047'), '평판잉크 Y', 6, 'EA', 92000, 552000, 2, '[0573] 이카운트 발주 02/26'
UNION ALL SELECT 491, (SELECT id FROM items WHERE item_code='RM-I0048'), '평판잉크 K', 2, 'EA', 92000, 184000, 3, '[0573] 이카운트 발주 02/26'
UNION ALL SELECT 491, (SELECT id FROM items WHERE item_code='RM-I0086'), '평판잉크 V (바니시)', 5, 'EA', 150000, 750000, 4, '[0573] 이카운트 발주 02/26 · 바니시는 단가가 다르다'
) WHERE EXISTS (SELECT 1 FROM purchase_orders WHERE id = 491);

-- 2-3. 03-18 (poi 3109) — C1 · M5 · Y4 · K1 = 11통 / 1,840,000
UPDATE purchase_order_items
   SET item_id = (SELECT id FROM items WHERE item_code = 'RM-I0040'),
       item_name = 'R50 UV 잉크-C [2L]', quantity = 1, unit = 'EA',
       unit_price = 167273, amount = 167273,
       notes = '[0573] 이카운트 발주 03/17 · 11통(유상10+무상1) 균등단가'
 WHERE id = 3109;
INSERT INTO purchase_order_items (po_id, item_id, item_name, quantity, unit, unit_price, amount, sort_order, notes)
SELECT * FROM (
SELECT 493, (SELECT id FROM items WHERE item_code='RM-I0041'), 'R50 UV 잉크-M [2L]', 5, 'EA', 167273, 836364, 2, '[0573] 이카운트 발주 03/17'
UNION ALL SELECT 493, (SELECT id FROM items WHERE item_code='RM-I0042'), 'R50 UV 잉크-Y [2L]', 4, 'EA', 167273, 669091, 3, '[0573] 이카운트 발주 03/17 (무상 1통 포함)'
UNION ALL SELECT 493, (SELECT id FROM items WHERE item_code='RM-I0043'), 'R50 UV 잉크-K [2L]', 1, 'EA', 167272, 167272, 4, '[0573] 이카운트 발주 03/17'
) WHERE EXISTS (SELECT 1 FROM purchase_orders WHERE id = 493);

-- 2-4. 04-24 (poi 3112) — C3 · M3 · Y4 · K1 = 11통 / 1,840,000
UPDATE purchase_order_items
   SET item_id = (SELECT id FROM items WHERE item_code = 'RM-I0040'),
       item_name = 'R50 UV 잉크-C [2L]', quantity = 3, unit = 'EA',
       unit_price = 167273, amount = 501818,
       notes = '[0573] 이카운트 발주 04/24 · 11통(유상10+무상1) 균등단가'
 WHERE id = 3112;
INSERT INTO purchase_order_items (po_id, item_id, item_name, quantity, unit, unit_price, amount, sort_order, notes)
SELECT * FROM (
SELECT 496, (SELECT id FROM items WHERE item_code='RM-I0041'), 'R50 UV 잉크-M [2L]', 3, 'EA', 167273, 501818, 2, '[0573] 이카운트 발주 04/24'
UNION ALL SELECT 496, (SELECT id FROM items WHERE item_code='RM-I0042'), 'R50 UV 잉크-Y [2L]', 4, 'EA', 167273, 669091, 3, '[0573] 이카운트 발주 04/24 (무상 1통 포함)'
UNION ALL SELECT 496, (SELECT id FROM items WHERE item_code='RM-I0043'), 'R50 UV 잉크-K [2L]', 1, 'EA', 167273, 167273, 4, '[0573] 이카운트 발주 04/24'
) WHERE EXISTS (SELECT 1 FROM purchase_orders WHERE id = 496);

-- 2-5. 06-15 (poi 3114) — C6 · M5 · Y7 · K4 = 22통 / 3,680,000
UPDATE purchase_order_items
   SET item_id = (SELECT id FROM items WHERE item_code = 'RM-I0040'),
       item_name = 'R50 UV 잉크-C [2L]', quantity = 6, unit = 'EA',
       unit_price = 167273, amount = 1003636,
       notes = '[0573] 이카운트 발주 06/12 · 22통(유상20+무상2) 균등단가'
 WHERE id = 3114;
INSERT INTO purchase_order_items (po_id, item_id, item_name, quantity, unit, unit_price, amount, sort_order, notes)
SELECT * FROM (
SELECT 498, (SELECT id FROM items WHERE item_code='RM-I0041'), 'R50 UV 잉크-M [2L]', 5, 'EA', 167273, 836364, 2, '[0573] 이카운트 발주 06/12'
UNION ALL SELECT 498, (SELECT id FROM items WHERE item_code='RM-I0042'), 'R50 UV 잉크-Y [2L]', 7, 'EA', 167273, 1170909, 3, '[0573] 이카운트 발주 06/12 (무상 2통 포함)'
UNION ALL SELECT 498, (SELECT id FROM items WHERE item_code='RM-I0043'), 'R50 UV 잉크-K [2L]', 4, 'EA', 167273, 669091, 4, '[0573] 이카운트 발주 06/12'
) WHERE EXISTS (SELECT 1 FROM purchase_orders WHERE id = 498);

-- 2-6. 07-31 (poi 3503) — 평판 C3 · M3 · Y4 @92,000 + V1 @150,000 = 11통 / 1,070,000
--     ⚠️ 이 전표(po 517)에는 컷팅기 터치패드 600,000 라인이 함께 있다(총액 1,670,000). 건드리지 않는다.
UPDATE purchase_order_items
   SET item_id = (SELECT id FROM items WHERE item_code = 'RM-I0045'),
       item_name = '평판잉크 C', quantity = 3, unit = 'EA',
       unit_price = 92000, amount = 276000,
       notes = '[0573] 이카운트 발주 07/16 · 무상 없음'
 WHERE id = 3503;
INSERT INTO purchase_order_items (po_id, item_id, item_name, quantity, unit, unit_price, amount, sort_order, notes)
SELECT * FROM (
SELECT 517, (SELECT id FROM items WHERE item_code='RM-I0046'), '평판잉크 M', 3, 'EA', 92000, 276000, 3, '[0573] 이카운트 발주 07/16'
UNION ALL SELECT 517, (SELECT id FROM items WHERE item_code='RM-I0047'), '평판잉크 Y', 4, 'EA', 92000, 368000, 4, '[0573] 이카운트 발주 07/16'
UNION ALL SELECT 517, (SELECT id FROM items WHERE item_code='RM-I0086'), '평판잉크 V (바니시)', 1, 'EA', 150000, 150000, 5, '[0573] 이카운트 발주 07/16'
) WHERE EXISTS (SELECT 1 FROM purchase_orders WHERE id = 517);

-- 2-7. 04-08 (poi 3110) — C·M·Y·K·W **각 2통**, W 만 단가가 다르다(용준님 확인 2026-09-08).
--     이카운트 발주서에는 없는 건이라 품명 원문으로는 안 풀렸다.
--     W 단가는 **103,000**(다른 색 92,000). CMYK 8통 736,000 + W 2통 206,000 = 942,000 으로 정확히 맞는다.
--     ※적용 당시 102,000 으로 들었다가 2,000원이 남아 차액으로 처리했는데, 용준님이 곧바로
--       103,000 이 맞다고 정정해 주셨다(2026-09-08). 값은 그대로이고 라인 notes 만 고쳤다.
UPDATE purchase_order_items
   SET item_id = (SELECT id FROM items WHERE item_code = 'RM-I0045'),
       item_name = '평판잉크 C', quantity = 2, unit = 'EA',
       unit_price = 92000, amount = 184000,
       notes = '[0573] 용준님 확인 · CMYKW 각 2통 (이카운트 발주서에는 없는 건)'
 WHERE id = 3110;
INSERT INTO purchase_order_items (po_id, item_id, item_name, quantity, unit, unit_price, amount, sort_order, notes)
SELECT * FROM (
SELECT 494, (SELECT id FROM items WHERE item_code='RM-I0046'), '평판잉크 M', 2, 'EA', 92000, 184000, 2, '[0573] 용준님 확인 04-08'
UNION ALL SELECT 494, (SELECT id FROM items WHERE item_code='RM-I0047'), '평판잉크 Y', 2, 'EA', 92000, 184000, 3, '[0573] 용준님 확인 04-08'
UNION ALL SELECT 494, (SELECT id FROM items WHERE item_code='RM-I0048'), '평판잉크 K', 2, 'EA', 92000, 184000, 4, '[0573] 용준님 확인 04-08'
UNION ALL SELECT 494, (SELECT id FROM items WHERE item_code='RM-I0049'), '평판잉크 W', 2, 'EA', 103000, 206000, 5,
       '[0573] 용준님 확인 04-08 · W 단가 103,000 (다른 색 92,000과 다르다)'
) WHERE EXISTS (SELECT 1 FROM purchase_orders WHERE id = 494);

-- ── 3. avg_unit_cost 정정 ────────────────────────────────────────────────────
-- 잉크는 `inventory_transactions` IN 행이 0이라 `POST /inventory-valuation/recalculate-avg` 가
-- 닿지 않는다(`inventoryValuation.ts` 가 IN 행 있는 품목만 UPDATE). 그래서 직접 넣고,
-- 그래서 이 값은 다음 입고 때까지 유지된다.
UPDATE items SET avg_unit_cost = 167273
 WHERE item_code IN ('RM-I0040','RM-I0041','RM-I0042','RM-I0043');   -- R50 C·M·Y·K
UPDATE items SET avg_unit_cost = 92000
 WHERE item_code IN ('RM-I0045','RM-I0046','RM-I0047','RM-I0048');   -- 평판 C·M·Y·K
-- 평판 W 는 04-08 건으로 매입이 생겼다 — 103,000(다른 색 92,000과 다른 단가, 용준님 확인).
UPDATE items SET avg_unit_cost = 103000 WHERE item_code = 'RM-I0049';
-- ⚠️ R50 W(RM-I0044)만 **손대지 않는다** — 2026 매입이 0건이고 이카운트 발주에도 없다.
--    184,000 은 형제 색에서 복사된 값으로 보이지만, 근거 없이 고치면 없던 이력을 만든다.

-- ── 4. 검증 (적용 후 아래가 전부 참이어야 한다) ──────────────────────────────
--  ① 전표 금액 불변 — 라인합 = purchase_orders.total_amount
--     SELECT po.id, po.total_amount, SUM(poi.amount) FROM purchase_orders po
--       JOIN purchase_order_items poi ON poi.po_id=po.id
--      WHERE po.id IN (489,491,493,494,496,498,517) GROUP BY po.id;
--     → 489:1,840,000 · 491:1,762,000 · 493:1,840,000 · 494:942,000
--       496:1,840,000 · 498:3,680,000 · 517:1,670,000
--  ② 통수 — R50 55통(C15·M14·Y20·K6) · 평판 C5·M8·Y12·K4·W2 = 31통 · 바니시 6통
--     SELECT m.item_code, SUM(poi.quantity) FROM purchase_order_items poi
--       JOIN items m ON m.id=poi.item_id WHERE m.item_group LIKE 'UV잉크%' GROUP BY 1;
--  ③ UV 잉크 매입 총액 불변 — 12,974,000 (R50 9,200,000 + 평판 3,774,000)
--     ※ E413·UV-NEW 를 더한 전체 UV 잉크 매입은 21,024,000 (이건 이 마이그레이션이 건드리지 않는다)
