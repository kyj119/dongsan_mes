-- 0553: 만국기 호수 3종 신설(7호-1 · 8호-1 · 9호) + 규격이 정확히 맞는 미연결 라인 5줄 연결
--
-- 배경 = 2026-09-02 미연결 라인 회수 시도. 「만국기」로 이름만 적힌 9줄을 거래처 관행 · 단가 ·
--   같은 주문의 다른 라인 3중으로 대조했더니, 회수가 아니라 **마스터의 규격 공백**이 원인이었다.
--     태극기 16종 · 새마을기 6 · 민방위기 4 · 무재해기 4 · 노인회기 4 · **만국기 2종**
--   다섯 계열이 전부 갖고 있는 7호-1(120×80)조차 만국기에만 없다.
--
-- 근거(같은 주문의 다른 라인이 호수 체계를 확인해 준다):
--   라인11171 120×80 ← 같은 주문에 「태극기 7호-1 게양용(120×80)」
--   라인22112 120×80 ← 같은 주문에 「태극기 7호-1 게양용(120×80)」
--   라인17804  60×40 ← 같은 주문에 「만국기 7호(135×90)」 = 만국기인데 다른 호수
--
-- ⚠️ `base_price` 는 **0 으로 둔다**. 실제 청구는 120×80 이 5,000·5,000·7,500 으로 갈리고,
--    태극기 대비 배율도 7호 2.0배(2,000→4,000) vs 8호 1.6배(1,500→2,400)로 일정하지 않다.
--    역산할 근거가 없으므로 넘겨짚지 않는다 — 판재 12종 기준단가와 같이 채운다.
-- 나머지 속성은 형제 행(MGG-7·MGG-8)을 그대로 따른다: `category_id=10` · `item_group='만국기'`
--    · FIXED · 매입 축도 함께(만국기는 사입 이력이 있다).

INSERT INTO items (category_id, item_code, item_name, unit, base_price, is_active,
                   category, sub_category, is_sales_item, is_purchase_item, pricing_method,
                   item_type, specification, item_group, group_sort,
                   min_billing_side_cm, stock_mode, deduction_method, created_at, updated_at)
SELECT 10, 'MGG-7-1', '만국기 7호-1', 'EA', 0, 1,
       '태극기', '태극기', 1, 1, 'FIXED', 'PRODUCT',
       '7호-1 120×80', '만국기', 0, 100, 'CONTINUOUS', 'NONE',
       datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code = 'MGG-7-1');

INSERT INTO items (category_id, item_code, item_name, unit, base_price, is_active,
                   category, sub_category, is_sales_item, is_purchase_item, pricing_method,
                   item_type, specification, item_group, group_sort,
                   min_billing_side_cm, stock_mode, deduction_method, created_at, updated_at)
SELECT 10, 'MGG-8-1', '만국기 8호-1', 'EA', 0, 1,
       '태극기', '태극기', 1, 1, 'FIXED', 'PRODUCT',
       '8호-1 105×70', '만국기', 0, 100, 'CONTINUOUS', 'NONE',
       datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code = 'MGG-8-1');

INSERT INTO items (category_id, item_code, item_name, unit, base_price, is_active,
                   category, sub_category, is_sales_item, is_purchase_item, pricing_method,
                   item_type, specification, item_group, group_sort,
                   min_billing_side_cm, stock_mode, deduction_method, created_at, updated_at)
SELECT 10, 'MGG-9', '만국기 9호', 'EA', 0, 1,
       '태극기', '태극기', 1, 1, 'FIXED', 'PRODUCT',
       '9호 60×40', '만국기', 0, 100, 'CONTINUOUS', 'NONE',
       datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code = 'MGG-9');

-- ── 연결: 이름이 「만국기」 + 규격이 **정확히** 호수 규격과 같은 라인만 ────────────────
-- 0550 에서 태극기 8줄에 쓴 것과 같은 기준이다(그때 형제 라인 재검에서 충돌 0건이었다).
-- 대상 5줄 — 120×80 3줄 · 105×70 1줄 · 60×40 1줄.
UPDATE order_items
   SET item_id = (SELECT id FROM items WHERE item_code = 'MGG-7-1'),
       updated_at = datetime('now')
 WHERE item_id IS NULL AND item_name = '만국기' AND width = 120 AND height = 80;

UPDATE order_items
   SET item_id = (SELECT id FROM items WHERE item_code = 'MGG-8-1'),
       updated_at = datetime('now')
 WHERE item_id IS NULL AND item_name = '만국기' AND width = 105 AND height = 70;

UPDATE order_items
   SET item_id = (SELECT id FROM items WHERE item_code = 'MGG-9'),
       updated_at = datetime('now')
 WHERE item_id IS NULL AND item_name = '만국기' AND width = 60 AND height = 40;

-- ⚠️ 남기는 4줄과 그 이유:
--   라인6365·6366  168×112 @15,000 — 호수 체계에 없는 규격이다(5호 180×120 과 6호 153×102 사이).
--                                    「특호」로 만들려면 이름·단가를 정해야 하는데 근거가 없다.
--   라인18816       60×90  @1,500  — 8호(90×60)의 가로세로가 뒤집힌 표기로 보이나, 같은 주문의
--                                    다른 라인이 「태극기 수기 45×30」이라 확인해 주지 않는다.
--   라인18913      규격없음 @1,000  — 같은 주문에 「태극기 9호(60×40)」가 있어 만국기 9호로 보이지만
--                                    라인 자체에 규격이 없다. 규격 없는 라인은 붙이지 않는다.
