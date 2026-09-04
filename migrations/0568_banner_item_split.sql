-- 0568: 수성 현수막(172) 품목 분리 — 장폭 / 게릴라
--
-- 근거 = 2026-09-04 prod 실측
--
-- [장폭] 짧은변 152cm 초과는 **수량과 독립된 별도 가격체계**다.
--      152 이하 : 1장 1,987 → 6~20장 1,314 → 100장~ 939 원/㎡ (수량이 반값을 만든다)
--      152 초과 : 1장 3,312 → 2~5장 3,301 → 6~20장 3,961 원/㎡ (수량이 늘어도 안 내려간다)
--    이어붙임·광폭원단 공수가 장당 붙기 때문이다.
--    같은 거래처가 양쪽을 다 시키는 곳이 162곳 6,399라인이고 그 안에서 장폭이 일반의 2.17배라,
--    폭을 안 보는 직전가 제안(/api/prices)이 지금 절반가 또는 2배가를 제안하고 있었다.
--
-- [게릴라] ★가격 수준으로는 안 갈린다. 최빈 규격 500x90 의 장당가가 3,500~8,500 연속 분포다.
--    처음엔 그래서 "소급 식별 불가"로 판단했는데 **틀렸다** — 축을 잘못 봤다.
--    갈리는 축은 가격 수준이 아니라 **거래처**이고, 보조 신호가 「장당 정액」과 「대량」이다:
--      A군(게릴라) : 장당 3,400~5,500원 · 500원 배수 비율 95~100% · **장폭 주문 0건**
--      B군(일반)   : 장당 6,600~8,660원 · 500원 배수 비율 30~58% · 장폭 주문 다수(애니룩스 246)
--    ★가장 깨끗한 신호는 「장폭을 아예 안 시킨다」였다. 게릴라 전문은 대형 현수막을 안 한다.
--    라벨 검증 = content 에 '게릴라'가 명시된 트윈디자인이 A군에 정확히 들어온다(100%·5,000원·장폭 0).
--    ⚠️거래처 확정은 데이터가 아니라 **사람이 했다**(2026-09-04 용준님, 장수 1,000 이상 8곳).
--      오케이애드공사가 게릴라 전문인지 대량 도매처인지는 숫자로 안 갈린다 — 둘 다 싸고 대량이다.
--    ⚠️규칙이 놓치는 것 = **소량 게릴라**. 명시 22라인 중 트윈디자인 3건만 거래처 규칙에 잡힌다
--      (인쇄하는사람들 7장 7,500원 등은 일반과 가격이 겹친다) → 명시 규칙과 **합집합**으로 쓴다.
--
-- 참조 영향 = order_items 뿐이다(실측). quotation_items·inventory·inventory_transactions·
--   bom_items·client_item_prices·price_sheet_items·purchase_order_items 전부 0건.
--   card_items 는 order_item_id 를 참조하므로 재배정을 그대로 따라온다.
--
-- 되돌리기:
--   UPDATE order_items SET item_id=(SELECT item_id FROM _bak_0568_banner_split b WHERE b.id=order_items.id)
--    WHERE id IN (SELECT id FROM _bak_0568_banner_split);
--   DELETE FROM product_materials WHERE product_item_id IN (SELECT id FROM items WHERE item_code IN ('AQ-WDB','AQ-GRB'));
--   DELETE FROM items WHERE item_code IN ('AQ-WDB','AQ-GRB');

-- 1) 원복용 스냅샷 (재실행해도 최초 상태를 지킨다)
CREATE TABLE IF NOT EXISTS _bak_0568_banner_split AS
  SELECT id, item_id FROM order_items WHERE item_id = 172;

-- 2) 품목 2종 신설 — 172 를 원본으로 복제하고 base_price 만 실측값으로 바꾼다
--    장폭 3,300 = 152 초과 1,782라인 가중 실효 ㎡단가 3,348 의 반올림.
--    게릴라  900 = 최종 집합 136라인 가중 872 의 반올림. 500x90(청구 5㎡) 에 곱하면 4,500원/장이라
--                 실측 최빈 장당가(4,500)와 맞는다.
INSERT INTO items (
  category_id, item_code, item_name, unit, base_price, is_active,
  category, sub_category, is_sales_item, pricing_method, item_type,
  production_required, pricing_profile, deduction_method, waste_factor,
  stock_mode, search_keywords, min_billing_side_cm
)
SELECT 15, 'AQ-WDB', '수성 장폭 현수막', 'EA', 3300, 1,
       '수성', '현수막', 1, 'AREA', 'PRODUCT',
       1, 'AREA', 'NONE', 1,
       'CONTINUOUS', '수성 장폭 현수막,장폭,광폭,대형 현수막,이어붙임', 100
 WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code = 'AQ-WDB');

INSERT INTO items (
  category_id, item_code, item_name, unit, base_price, is_active,
  category, sub_category, is_sales_item, pricing_method, item_type,
  production_required, pricing_profile, deduction_method, waste_factor,
  stock_mode, search_keywords, min_billing_side_cm
)
SELECT 15, 'AQ-GRB', '수성 게릴라 현수막', 'EA', 900, 1,
       '수성', '현수막', 1, 'AREA', 'PRODUCT',
       1, 'AREA', 'NONE', 1,
       'CONTINUOUS', '수성 게릴라 현수막,게릴라,게릴라 현수막', 100
 WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code = 'AQ-GRB');

-- 3) 원단 후보 목록 복제 — 172 에 달린 19종을 그대로 준다.
--    폭을 좁히지 않는 이유: deduction_method='NONE' 이라 자동차감이 아니라 **영업이 고르는 후보**이고,
--    장폭도 152 원단을 이어붙여 뽑는 경우가 있어 미리 막으면 입력이 도리어 막힌다.
INSERT INTO product_materials (product_item_id, material_item_id, is_default)
SELECT (SELECT id FROM items WHERE item_code = 'AQ-WDB'), pm.material_item_id, pm.is_default
  FROM product_materials pm
 WHERE pm.product_item_id = 172
   AND NOT EXISTS (SELECT 1 FROM product_materials x
                    WHERE x.product_item_id = (SELECT id FROM items WHERE item_code = 'AQ-WDB')
                      AND x.material_item_id = pm.material_item_id);

INSERT INTO product_materials (product_item_id, material_item_id, is_default)
SELECT (SELECT id FROM items WHERE item_code = 'AQ-GRB'), pm.material_item_id, pm.is_default
  FROM product_materials pm
 WHERE pm.product_item_id = 172
   AND NOT EXISTS (SELECT 1 FROM product_materials x
                    WHERE x.product_item_id = (SELECT id FROM items WHERE item_code = 'AQ-GRB')
                      AND x.material_item_id = pm.material_item_id);

-- 4) 소급 재배정 — 게릴라를 먼저 옮긴다. 두 조건의 겹침은 실측 0건이다.
--    거래처 8곳 = 오케이애드공사 2103 · 성진광고기획 2068 · 동아애드넷 730 · 크리에이티브온 161
--               · 주안애드 2193 · 엠에스이 2097 · 성진 현수막출력센터 1297 · 트윈디자인 2410
--    (2026-09-04 용준님 확정. 게릴라형 규격 1,000장 이상 · 장당 정액 · 장폭 0 인 곳)
--    ⚠️엠에스이는 장폭 23라인도 있는 혼합 거래처라, 거래처 전체가 아니라 **게릴라형 규격 라인만** 옮긴다.
UPDATE order_items
   SET item_id = (SELECT id FROM items WHERE item_code = 'AQ-GRB')
 WHERE item_id = 172
   AND (
     content LIKE '%게릴라%'
     OR (
       order_id IN (SELECT id FROM orders WHERE client_id IN (2103, 2068, 730, 161, 2193, 2097, 1297, 2410))
       AND MIN(width, height) BETWEEN 60 AND 90
       AND MAX(width, height) BETWEEN 300 AND 900
     )
   );

UPDATE order_items
   SET item_id = (SELECT id FROM items WHERE item_code = 'AQ-WDB')
 WHERE item_id = 172 AND MIN(width, height) > 152;
