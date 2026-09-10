-- 0575: 솔벤 캔버스 1520폭 품목 신설 + LC2000 단가 반영
--
-- `0574` 에서 폭이 어긋나 손대지 않고 남겨 둔 둘을 용준님 확인으로 처리한다(2026-09-08).
--
-- ① 솔벤 캔버스원단 — 이카운트 발주는 「솔벤캔버스 [1520*20M] 232,000」(케이엠테크 08-13)인데
--    MES 에는 **1,270폭 품목만** 있었다. 그 값을 SVCV-127 에 넣으면 다른 폭의 단가를 덮어쓰게 되므로
--    0574 는 건너뛰었고, 여기서 **1520폭 품목을 새로 만든다**.
--    · 단가 = 232,000 ÷ 20m = **11,600원/m** (base_unit='M' · pack_size=20)
--    · SVCV-127 의 7,900원/m 은 **그대로 둔다** — 과거 1270폭 매입에서 나온 값이고, 폭이 다르면
--      단가도 다른 게 정상이다.
--    · 제품 BOM(`SV-CANVAS`)에도 붙인다. 붙이지 않으면 자재 선택 후보에 없어서 넓은 캔버스 주문이
--      들어와도 1270폭으로 계산된다(「출력물이 들어가는 최소 폭」 규칙이 후보 안에서만 고른다).
--
-- ② LC2000 — 발주 표기는 「[105폭]」이지만 **100폭이 맞다**(용준님 확인). 폭은 손대지 않고
--    단가만 반영한다: 93,100 ÷ 50m = **1,862원/m** (현재 1,931.4 → -3.6%).
--    ⚠️ 이 품목은 `item_type='GOODS'`(상품)라 0574 의 자재 대조 범위 밖이었다 — 시트류인데
--       유통 상품으로 등록돼 있다. 분류가 맞는지는 별건으로 볼 일이고 여기서는 단가만 맞춘다.
--
-- 보류: 아크릴 30종은 **외주가공**이라(우진아크릴에서 완성품으로 들어온다) 자재 BOM 구조 자체를
--   바꿔야 하는데, 어떻게 담을지 판단이 서지 않아 이번에는 손대지 않는다(용준님 2026-09-08).
--
-- 되돌리기: `_bak_0575` 에 LC2000 원값이 있고, 신설 품목은 item_code 로 지우면 된다
--   (`DELETE FROM product_materials WHERE material_item_id=(SELECT id FROM items WHERE item_code='SVCV-152');`
--    `DELETE FROM items WHERE item_code='SVCV-152';`)

CREATE TABLE IF NOT EXISTS _bak_0575 AS
SELECT id, item_code, item_name, avg_unit_cost FROM items WHERE item_code = 'LC2000-100';

-- ── 1. 솔벤 캔버스 1520폭 신설 ───────────────────────────────────────────────
-- 컬럼 구성은 형제 품목(SVCV-127)을 그대로 따른다. category_id 는 NOT NULL 이라 폴백을 둔다.
INSERT INTO items (item_code, item_name, item_group, category_id, category, item_type,
                   unit, base_unit, pack_size, width_mm, specification,
                   avg_unit_cost, deduction_method, is_active, pricing_method, search_keywords)
SELECT 'SVCV-152', '솔벤 캔버스원단', '솔벤 캔버스원단',
       COALESCE((SELECT category_id FROM items WHERE item_code = 'SVCV-127'), 5),
       COALESCE((SELECT category    FROM items WHERE item_code = 'SVCV-127'), '원자재'),
       'MATERIAL', '롤', 'M', 20, 1520, '152cm',
       11600, 'ROLL', 1, 'FIXED',
       '솔벤캔버스 캔버스원단 152폭 1520 20M 케이엠테크'
 WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code = 'SVCV-152');

-- 제품 BOM 에 연결 — 형제(SVCV-127)가 붙어 있는 제품과 같은 곳에 붙인다.
INSERT INTO product_materials (product_item_id, material_item_id)
SELECT pm.product_item_id, (SELECT id FROM items WHERE item_code = 'SVCV-152')
  FROM product_materials pm
 WHERE pm.material_item_id = (SELECT id FROM items WHERE item_code = 'SVCV-127')
   AND NOT EXISTS (
     SELECT 1 FROM product_materials x
      WHERE x.product_item_id = pm.product_item_id
        AND x.material_item_id = (SELECT id FROM items WHERE item_code = 'SVCV-152'));

-- ── 2. LC2000 단가 ──────────────────────────────────────────────────────────
UPDATE items SET avg_unit_cost = 1862 WHERE item_code = 'LC2000-100';  -- 93,100 ÷ 50m

-- ── 3. 검증 ────────────────────────────────────────────────────────────────
--  ① SELECT item_code, width_mm, pack_size, avg_unit_cost FROM items WHERE item_code LIKE 'SVCV%';
--     → SVCV-127 1270/20/7,900 · SVCV-152 1520/20/11,600
--  ② SELECT p.item_code FROM product_materials pm JOIN items p ON p.id=pm.product_item_id
--      WHERE pm.material_item_id=(SELECT id FROM items WHERE item_code='SVCV-152');
--     → SV-CANVAS
--  ③ SELECT avg_unit_cost FROM items WHERE item_code='LC2000-100';  → 1862
