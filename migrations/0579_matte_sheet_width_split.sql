-- 0579: 무광시트 SPM011M 을 **폭별 2종으로 분리** (105 / 127) — 용준님 지시 2026-09-07
--
-- 무엇이 뭉쳐 있었나:
--   `SPM011M` 한 품목에 **105폭과 127폭이 함께** 들어 있었다. 품목 자신이 그렇다고 말하고 있었다 —
--     · `ecount_code = 'C206,C207'` — 이카운트 코드가 **2개**(형제는 전부 1개: C201=105 · C202=127)
--     · `specification = '무광·재고1롤(소진용)'`
--   매입 전표(SMP-0079, 2026-03-31, ㈜서울경금속, 선명)가 결정적이다 — **품명에 폭이 적혀 있다**:
--     `SPM011M [105폭]` 1롤 92,700원 · `SPM011M [127폭]` 1롤 112,200원
--   두 값의 **평균이 정확히 102,450** 이고, 그게 `avg_unit_cost` 에 들어 있던 값이다.
--   판매 4건도 `specification` 칸에 '105폭'·'127폭' 이 적혀 있어 어느 쪽인지 확정된다.
--
-- ★단가는 폭별로 갈라진다(50M 롤 기준):
--     105폭 = 92,700 ÷ 50 = **1,854원/M**   (형제 일반시트 105폭 1,937원의 96%)
--     127폭 = 112,200 ÷ 50 = **2,244원/M**  (형제 127폭 2,325원의 97%)
--   무광이 일반보다 3~4% 싼 것이 두 폭에서 일관된다 — 축이 맞다는 교차검증이다.
--
-- ★`ecount_code` 대응은 **사다리에서 읽었다** — C200=090 · C201=105 · C202=127 · C203=137 · C204=152,
--   022G 도 C215=105 · C216=127 · C217=137 로 **폭 오름차순**이다. 따라서 C206=105 · C207=127.
--   (이 한 줄만 추론이다. 이카운트에서 다르게 확인되면 두 줄을 맞바꾸면 된다.)
--
-- ★BOM 은 **127폭으로 연결**한다 — 쓰는 제품 `UV-SHEETM-WC`(UV 무광시트 W+C) 14라인의 규격이
--   101~129cm 라 105폭(1,050mm)에는 애초에 들어가지 않는다. 종전엔 폭이 없어 ROLL 후보에서
--   탈락해 재료비가 **0** 이었다.
--
-- ⛔ **재고는 옮기지 않는다** — 선명2 창고의 1롤이 어느 폭인지 데이터에 없다
--   (원장 0행 · 실사 기록도 전부 0). 폭이 확인되면 별도로 옮긴다. 그때까지 `SPM011M` 은
--   **살려 둔다** — 재고를 가진 품목을 비활성화하면 실사·평가에서 조용히 사라진다.
--
-- ⚠️ 과금축은 그대로다(양쪽 다 `FIXED`) — `unit_price` 의 뜻이 바뀌지 않으므로 재산정이 필요 없다
--   ([[design-price-suggestion-structure]] §과금축을 바꾸면 unit_price 의 뜻이 바뀐다).
--
-- ⚠️ 앞으로 이 계열을 입고할 때 `POST /inventory-valuation/recalculate-avg` 를 돌리면
--   `inventory_transactions.unit_price`(롤당)로 `avg_unit_cost` 가 덮인다 — 그러면 다시 50배 어긋난다.
--   지금은 이 계열에 원장이 0행이라 그 작업이 건드리지 않는다. 입고를 시작하면 **M 단위로** 넣어야 한다.
--
-- 되돌리기: 두 신규 품목을 지우고 아래 UPDATE 의 대상 id 를 689 로 되돌리면 된다
--   (대상 = order_items 1370·1371·28450·28520 · purchase_order_items 318·319 · product_materials 509).

-- ── ① 폭별 품목 2종 (형제 계열 SPM011G-* 와 같은 축) ────────────────────────
INSERT INTO items (
  category_id, item_code, item_name, unit, base_price, is_active, category,
  is_sales_item, is_purchase_item, pricing_method, width_mm, item_group, group_sort,
  item_type, specification, sales_price, avg_unit_cost, production_required,
  ecount_code, deduction_method, base_unit, pack_size, stock_mode,
  search_keywords, min_billing_side_cm, price_suggest, waste_factor
)
SELECT 5, 'SPM011M-105', '무광시트 SPM011M', '롤', 105000, 1, '원자재',
       1, 1, 'FIXED', 1050, '무광시트 SPM011M', 0,
       'MATERIAL', '105cm', 0, 1854, 0,
       'C206', 'ROLL', 'M', 50, 'CONTINUOUS',
       '무광시트 시트 SPM011M 출력실', 100, 1, 1
 WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code = 'SPM011M-105');

INSERT INTO items (
  category_id, item_code, item_name, unit, base_price, is_active, category,
  is_sales_item, is_purchase_item, pricing_method, width_mm, item_group, group_sort,
  item_type, specification, sales_price, avg_unit_cost, production_required,
  ecount_code, deduction_method, base_unit, pack_size, stock_mode,
  search_keywords, min_billing_side_cm, price_suggest, waste_factor
)
SELECT 5, 'SPM011M-127', '무광시트 SPM011M', '롤', 124000, 1, '원자재',
       1, 1, 'FIXED', 1270, '무광시트 SPM011M', 0,
       'MATERIAL', '127cm', 0, 2244, 0,
       'C207', 'ROLL', 'M', 50, 'CONTINUOUS',
       '무광시트 시트 SPM011M 출력실', 100, 1, 1
 WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code = 'SPM011M-127');

-- ── ② 판매 4건 재배정 (규격 칸이 폭을 적어 두었다) ──────────────────────────
UPDATE order_items SET item_id = (SELECT id FROM items WHERE item_code = 'SPM011M-105')
 WHERE id IN (1370, 28450) AND item_id = 689;
UPDATE order_items SET item_id = (SELECT id FROM items WHERE item_code = 'SPM011M-127')
 WHERE id IN (1371, 28520) AND item_id = 689;

-- ── ③ 매입 2건 재배정 (품명이 폭을 적어 두었다) ────────────────────────────
UPDATE purchase_order_items SET item_id = (SELECT id FROM items WHERE item_code = 'SPM011M-105')
 WHERE id = 318 AND item_id = 689;
UPDATE purchase_order_items SET item_id = (SELECT id FROM items WHERE item_code = 'SPM011M-127')
 WHERE id = 319 AND item_id = 689;

-- ── ④ BOM = 127폭 (제품 라인 규격이 101~129cm) ─────────────────────────────
UPDATE product_materials SET material_item_id = (SELECT id FROM items WHERE item_code = 'SPM011M-127')
 WHERE id = 509 AND material_item_id = 689;

-- ── ⑤ 남은 통합 품목 — 재고 1롤 때문에 살려 두되, 상태를 적어 둔다 ──────────
UPDATE items
   SET specification = '무광·폭 분리됨(105/127)·재고 1롤 폭 확인 대기',
       ecount_code = ''
 WHERE item_code = 'SPM011M';
