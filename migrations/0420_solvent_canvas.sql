-- 0420_solvent_canvas.sql
-- 솔벤캔버스 등록 (판매기록 있으나 미등록 — 원천주문 4건 확인)
-- 캔버스천 127폭 단일 · 20m/롤 · 솔벤 인쇄 · 원단 재단판매 없음(순수 매입)
-- 세트: ① 원자재(매입품목) 캔버스원단 + ② 제품(판매·출력) 솔벤 캔버스 + ③ 연결(자동차감)
-- 필드 패턴: 제품=SV-BANNER, 원단=AQ1-127 그대로 따름. base_price=0(매입/㎡단가 추후)

-- ① 원자재(매입품목): 솔벤 캔버스원단 127cm (ROLL 폭매칭 차감, yd)
INSERT INTO items (
  category_id, item_code, item_name, item_group, category, sub_category,
  item_type, unit, specification, width_mm, deduction_method, pricing_method,
  is_sales_item, is_purchase_item, production_required, group_sort, is_favorite,
  waste_factor, stock_mode, base_price, sales_price, avg_unit_cost, is_active,
  description, created_at, updated_at
) VALUES (
  5, 'SVCV-127', '솔벤 캔버스원단', '솔벤 캔버스원단', '원자재', NULL,
  'MATERIAL', 'yd', '127cm', 1270, 'ROLL', 'FIXED',
  0, 1, 0, 0, 0,
  1, 'CONTINUOUS', 0, 0, 0, 1,
  '한 롤 20m · 127폭 단일', datetime('now'), datetime('now')
);

-- ② 제품(판매·출력): 솔벤 캔버스 (AREA 면적단가, ROLL → ①번 원단 차감)
INSERT INTO items (
  category_id, item_code, item_name, category, sub_category,
  item_type, unit, deduction_method, pricing_method, pricing_profile,
  is_sales_item, is_purchase_item, production_required, group_sort, is_favorite,
  waste_factor, stock_mode, base_price, sales_price, avg_unit_cost, is_active,
  created_at, updated_at
) VALUES (
  3, 'SV-CANVAS', '솔벤 캔버스', '솔벤', '현수막',
  'PRODUCT', 'EA', 'ROLL', 'AREA', 'AREA',
  1, 0, 1, 0, 0,
  1, 'CONTINUOUS', 0, 0, 0, 1,
  datetime('now'), datetime('now')
);

-- ③ 연결: 제품 → 원자재 (is_default=1) → 출고 시 127폭 캔버스원단 자동차감
INSERT INTO product_materials (product_item_id, material_item_id, is_default, created_at)
SELECT p.id, m.id, 1, datetime('now')
FROM items p, items m
WHERE p.item_code = 'SV-CANVAS' AND m.item_code = 'SVCV-127';
