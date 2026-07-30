-- 0503: (구 0501 — 동시 세션 order_item_line_discount 와 번호 충돌로 개명. prod 적용은 완료 상태) 동산기획 이카운트 이관 — 깃대조립·수기대조립 SET 품목화 + BOM(product_materials) + UV 2종
-- 근거: 용준님 2026-07-30 "SET 품목 만들어서 한 줄 처리 + BOM 등록" (0499 원칙⑤ 2라인 분해를 대체)
--       + "UV투명패트·UV텐트천 품목 만들어서 연결"
--
-- 원칙
--  ① SET 조합은 원천 실측에 존재하는 것만 생성(신규 최소화) — 깃대조립 9종·수기대조립 5종.
--     표기 불완전 라인(구수·깃대·규격 미상 ~10L·5M)은 item_id NULL 보존 → 소급 연결.
--  ② BOM 정본 = product_materials (bom_items 는 동결·은퇴 테이블 — routes/bom.ts 주석).
--     수량 컬럼이 없어 구성품 1EA 해석 — SET 구성이 전부 기1+깃대1 이라 현재 손실 없음.
--  ③ SET item_type=PRODUCT·category 태극기·deduction NONE (TGK-JASUSET-S135X90 전례 승계).
--     UV 2종은 형제(AQ/SV-TENT·AQ-PAT) 승계: PRODUCT·AREA·ROLL·is_purchase 0.
--  ④ base_price 0 유지(실단가 산포 — 0499 원칙④). 실측 범위는 description 기록.
--  ⑤ 멱등: items = INSERT OR IGNORE(item_code UNIQUE) / product_materials = NOT EXISTS 가드.
--
-- ⚠️ category_id: 태극기=10 · 상품=4 · UV=2 (prod 실측)

-- ════════════════════════════════════════════════════════════════════
-- 1) 깃대 R120 3구 — R120 조합 지원용 부속 (형제 ACC-030-R130-3 승계)
-- ════════════════════════════════════════════════════════════════════
INSERT OR IGNORE INTO items (category_id, category, item_code, item_name, item_type, unit, base_price, is_sales_item, is_purchase_item, pricing_method, production_required, deduction_method, item_group, specification, ecount_code, description) VALUES
 (4, '상품', 'ACC-030-R120-3', '가로기 깃대(조립) R120 3구', 'GOODS', 'EA', 0, 1, 1, 'FIXED', 0, 'ROLL', '가로기 깃대(조립)', 'R120·3구', NULL, '이카운트 이관 2026-07-30 · 깃대조립 SET R120 조합 1L 2,750,000 지원');

-- ════════════════════════════════════════════════════════════════════
-- 2) 깃대조립 SET 9종 (기 종류 × 호수 × 깃대 × 구수 — 원천 실측 조합만)
-- ════════════════════════════════════════════════════════════════════
INSERT OR IGNORE INTO items (category_id, category, item_code, item_name, item_type, unit, base_price, is_sales_item, is_purchase_item, pricing_method, production_required, deduction_method, item_group, specification, ecount_code, description) VALUES
 (10, '태극기', 'TGK-GDSET-7-1-R150-3', '태극기 깃대조립 SET 7호-1 R150 3구', 'PRODUCT', 'EA', 0, 1, 1, 'FIXED', 1, 'NONE', '깃대조립 SET', '7호-1 120×80 · R150 3구', NULL, '이카운트 이관 2026-07-30 · 18L 42,043,500 · 실단가 4,000~5,700'),
 (10, '태극기', 'TGK-GDSET-7-R150-3',   '태극기 깃대조립 SET 7호 R150 3구',   'PRODUCT', 'EA', 0, 1, 1, 'FIXED', 1, 'NONE', '깃대조립 SET', '7호 135×90 · R150 3구',   NULL, '이카운트 이관 2026-07-30 · 14L 36,060,000 · 실단가 4,000~5,500'),
 (10, '태극기', 'TGK-GDSET-8-R130-2',   '태극기 깃대조립 SET 8호 R130 2구',   'PRODUCT', 'EA', 0, 1, 1, 'FIXED', 1, 'NONE', '깃대조립 SET', '8호 90×60 · R130 2구',    NULL, '이카운트 이관 2026-07-30 · 6L 4,345,000 · 실단가 3,800~4,000'),
 (10, '태극기', 'TGK-GDSET-7-1-R120-3', '태극기 깃대조립 SET 7호-1 R120 3구', 'PRODUCT', 'EA', 0, 1, 1, 'FIXED', 1, 'NONE', '깃대조립 SET', '7호-1 120×80 · R120 3구', NULL, '이카운트 이관 2026-07-30 · 1L 2,750,000 · 단가 5,500'),
 (10, '태극기', 'TGK-GDSET-7-1-R150-2', '태극기 깃대조립 SET 7호-1 R150 2구', 'PRODUCT', 'EA', 0, 1, 1, 'FIXED', 1, 'NONE', '깃대조립 SET', '7호-1 120×80 · R150 2구', NULL, '이카운트 이관 2026-07-30 · 1L 1,880,000 · 단가 4,700'),
 (10, '태극기', 'TGK-GDSET-8-R150-2',   '태극기 깃대조립 SET 8호 R150 2구',   'PRODUCT', 'EA', 0, 1, 1, 'FIXED', 1, 'NONE', '깃대조립 SET', '8호 90×60 · R150 2구',    NULL, '이카운트 이관 2026-07-30 · 1L 432,000 · 단가 4,800'),
 (10, '태극기', 'SMG-GDSET-7-R150-3',   '새마을기 깃대조립 SET 7호 R150 3구', 'PRODUCT', 'EA', 0, 1, 1, 'FIXED', 1, 'NONE', '깃대조립 SET', '7호 135×90 · R150 3구',   NULL, '이카운트 이관 2026-07-30 · 1L 1,100,000 · 단가 5,500'),
 (10, '태극기', 'MBG-GDSET-8-R130-2',   '민방위기 깃대조립 SET 8호 R130 2구', 'PRODUCT', 'EA', 0, 1, 1, 'FIXED', 1, 'NONE', '깃대조립 SET', '8호 90×60 · R130 2구',    NULL, '이카운트 이관 2026-07-30 · 1L 740,000 · 단가 3,700'),
 (10, '태극기', 'MBG-GDSET-7-1-R150-3', '민방위기 깃대조립 SET 7호-1 R150 3구', 'PRODUCT', 'EA', 0, 1, 1, 'FIXED', 1, 'NONE', '깃대조립 SET', '7호-1 120×80 · R150 3구', NULL, '이카운트 이관 2026-07-30 · 1L 360,000 · 단가 3,600');

-- ════════════════════════════════════════════════════════════════════
-- 3) 수기대조립 SET 5종 (수기 규격 × 수기대 길이 — 원천 실측 조합만)
-- ════════════════════════════════════════════════════════════════════
INSERT OR IGNORE INTO items (category_id, category, item_code, item_name, item_type, unit, base_price, is_sales_item, is_purchase_item, pricing_method, production_required, deduction_method, item_group, specification, ecount_code, description) VALUES
 (10, '태극기', 'TGK-SGSET-30-L40', '태극기 수기대조립 SET 30×20 수기대 40cm', 'PRODUCT', 'EA', 0, 1, 1, 'FIXED', 1, 'NONE', '수기대조립 SET', '30×20 · P-40', NULL, '이카운트 이관 2026-07-30 · 6L 3,560,000 · 실단가 500~900'),
 (10, '태극기', 'TGK-SGSET-30-L50', '태극기 수기대조립 SET 30×20 수기대 50cm', 'PRODUCT', 'EA', 0, 1, 1, 'FIXED', 1, 'NONE', '수기대조립 SET', '30×20 · P-50', NULL, '이카운트 이관 2026-07-30 · 32L 167,593,710 = SET 최대 · 실단가 770~1,000'),
 (10, '태극기', 'TGK-SGSET-30-L60', '태극기 수기대조립 SET 30×20 수기대 60cm', 'PRODUCT', 'EA', 0, 1, 1, 'FIXED', 1, 'NONE', '수기대조립 SET', '30×20 · P-60', NULL, '이카운트 이관 2026-07-30 · 1L 200,000 · 단가 1,000'),
 (10, '태극기', 'TGK-SGSET-45-L50', '태극기 수기대조립 SET 45×30 수기대 50cm', 'PRODUCT', 'EA', 0, 1, 1, 'FIXED', 1, 'NONE', '수기대조립 SET', '45×30 · P-50', NULL, '이카운트 이관 2026-07-30 · 9L 2,361,000 · 실단가 1,000~1,300'),
 (10, '태극기', 'TGK-SGSET-45-L60', '태극기 수기대조립 SET 45×30 수기대 60cm', 'PRODUCT', 'EA', 0, 1, 1, 'FIXED', 1, 'NONE', '수기대조립 SET', '45×30 · P-60', NULL, '이카운트 이관 2026-07-30 · 1L 140,000 · 단가 1,400');

-- ════════════════════════════════════════════════════════════════════
-- 4) UV 2종 (형제 승계: AQ-TENT/SV-TENT · AQ-PAT — PRODUCT·AREA·ROLL·is_purchase 0)
-- ════════════════════════════════════════════════════════════════════
INSERT OR IGNORE INTO items (category_id, category, item_code, item_name, item_type, unit, base_price, is_sales_item, is_purchase_item, pricing_method, production_required, deduction_method, item_group, specification, ecount_code, description) VALUES
 (2, 'UV', 'UV-TENT', 'UV 텐트천',   'PRODUCT', 'EA', 0, 1, 0, 'AREA', 1, 'ROLL', NULL, NULL, NULL, '이카운트 이관 2026-07-30 · UV텐트천 2L 97,000 · 형제 AQ-TENT/SV-TENT 승계'),
 (2, 'UV', 'UV-PATC', 'UV 투명패트', 'PRODUCT', 'EA', 0, 1, 0, 'AREA', 1, 'ROLL', NULL, NULL, NULL, '이카운트 이관 2026-07-30 · UV투명패트-2WAY/3WAY 3L 168,000 · 형제 AQ-PAT 승계');

-- ════════════════════════════════════════════════════════════════════
-- 5) SET BOM — product_materials (정본 BOM 테이블. 수량 컬럼 없음 = 구성품 1EA 해석)
--    깃대조립 SET = 기 본품 1 + 가로기 깃대(조립) 1 / 수기대조립 SET = 수기 1 + 수기대 1
-- ════════════════════════════════════════════════════════════════════
-- ⚠️ D1 함정(실측 2건): 행값 IN 은 괄호 목록이든 `IN (VALUES ...)` 든 **에러 없이 0행 매칭**된다.
--    반드시 CTE(VALUES) + JOIN 으로 쓸 것.
WITH pairs(pc, mc) AS (VALUES
  ('TGK-GDSET-7-1-R150-3', 'TGK-7-1'), ('TGK-GDSET-7-1-R150-3', 'ACC-030-R150-3'),
  ('TGK-GDSET-7-R150-3',   'TGK-7'),   ('TGK-GDSET-7-R150-3',   'ACC-030-R150-3'),
  ('TGK-GDSET-8-R130-2',   'TGK-8'),   ('TGK-GDSET-8-R130-2',   'ACC-030-R130-2'),
  ('TGK-GDSET-7-1-R120-3', 'TGK-7-1'), ('TGK-GDSET-7-1-R120-3', 'ACC-030-R120-3'),
  ('TGK-GDSET-7-1-R150-2', 'TGK-7-1'), ('TGK-GDSET-7-1-R150-2', 'ACC-030-R150-2'),
  ('TGK-GDSET-8-R150-2',   'TGK-8'),   ('TGK-GDSET-8-R150-2',   'ACC-030-R150-2'),
  ('SMG-GDSET-7-R150-3',   'SMG-7'),   ('SMG-GDSET-7-R150-3',   'ACC-030-R150-3'),
  ('MBG-GDSET-8-R130-2',   'MBG-8'),   ('MBG-GDSET-8-R130-2',   'ACC-030-R130-2'),
  ('MBG-GDSET-7-1-R150-3', 'MBG-7-1'), ('MBG-GDSET-7-1-R150-3', 'ACC-030-R150-3'),
  ('TGK-SGSET-30-L40', 'TGK-SG30'), ('TGK-SGSET-30-L40', 'ACC-036-L40'),
  ('TGK-SGSET-30-L50', 'TGK-SG30'), ('TGK-SGSET-30-L50', 'ACC-036-L50'),
  ('TGK-SGSET-30-L60', 'TGK-SG30'), ('TGK-SGSET-30-L60', 'ACC-036-L60'),
  ('TGK-SGSET-45-L50', 'TGK-SG45'), ('TGK-SGSET-45-L50', 'ACC-036-L50'),
  ('TGK-SGSET-45-L60', 'TGK-SG45'), ('TGK-SGSET-45-L60', 'ACC-036-L60')
)
INSERT INTO product_materials (product_item_id, material_item_id, is_default)
SELECT p.id, m.id, 1
FROM pairs
JOIN items p ON p.item_code = pairs.pc
JOIN items m ON m.item_code = pairs.mc
WHERE NOT EXISTS (SELECT 1 FROM product_materials x WHERE x.product_item_id = p.id AND x.material_item_id = m.id);
