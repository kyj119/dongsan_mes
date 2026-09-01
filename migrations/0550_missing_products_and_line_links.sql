-- 0550: 미연결 주문 라인이 가리키던 품목 3종 신설 + 각목 복구 + 확실한 라인 8줄 연결
--
-- 배경 = 2026-09-01 품목 연결 점검. 주문 라인 23,162줄 중 767줄이 `item_id` 없이 이름만
--   적혀 있었다. 그중 「마스터에 아예 없는 것」을 계열 열거로 가려낸 결과다.
--   ⚠️ 신설 전 계열 열거는 필수다(memory: feedback-item-duplicate-before-create — 재발 4회).
--      아래 3종은 전부 열거 후 「없음」이 확인된 것이고, 있는 것은 신설하지 않았다:
--        · 엠보(EP115)  → 자재 393·394 + 제품 395 `UV 엠보시트` 존재 → 신설 안 함
--        · 각목        → 676 존재하나 **비활성** → 신설이 아니라 복구
--        · LED투광기    → 자재 803(백/백)·804(백/웜)·805(검/백) 존재 → 신설 안 함
--                        (빠진 조합은 검정/웜 하나뿐이고 주문 이력 0)
--        · 고무자석시트  → 자재 1018(60cm)·1019(100cm) 존재. **제품이 없다** → 제품만 신설
--
-- 분류 주의: 도안지는 1558(100폭)이 이미 `category_id=5(원자재)` 에 있다. 신설분을 다른 분류에
--   넣으면 같은 계열이 두 곳으로 갈린다 — 계열 내 일관성을 우선해 1558 과 같은 5 로 넣는다.
--   ⚠️ `category_id=5` 인데 `item_type='PRODUCT'` 인 행이 **85행**(대부분 2026-08 등록분) 있다.
--      분류 축 정리는 이 마이그레이션의 범위가 아니다 — 별건으로 남긴다.

-- ── 1. 각목 복구 ─────────────────────────────────────────────────────────────
-- 676 WDS-01 은 규격·분류가 다 있는데 `is_active=0` 이라 검색에서 사라져 있었다.
-- 그 사이 「각목 9줄 · 각목나무[낱개) 3줄 · 각목나무 120cm 1줄」이 이름만으로 청구됐다.
UPDATE items SET is_active = 1, updated_at = datetime('now')
 WHERE item_code = 'WDS-01' AND COALESCE(is_active, 1) = 0;

-- ── 2. 도안지 125폭 (제품) ───────────────────────────────────────────────────
-- 간판 출고 시 플로터로 도안을 그려 함께 나가는 판매 품목. 폭 2종(100·125) 중
-- 100폭만 제품(1558)으로 있었다. 자재 843(125폭·yd)은 매입 축이라 별개다.
-- 규격이 없는 라인이 대부분이라 과금은 FIXED. 기준단가는 미정이라 0으로 둔다.
INSERT INTO items (category_id, item_code, item_name, unit, base_price, is_active,
                   category, is_sales_item, is_purchase_item, pricing_method, item_type,
                   specification, min_billing_side_cm, stock_mode, deduction_method,
                   created_at, updated_at)
SELECT 5, 'RM-DOAN-125', '도안지', 'EA', 0, 1,
       '원자재', 1, 1, 'FIXED', 'PRODUCT',
       '125폭', 100, 'CONTINUOUS', 'NONE',
       datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code = 'RM-DOAN-125');

-- ── 3. UV 무광시트 W+C (제품) ────────────────────────────────────────────────
-- 「화이트를 깔고 그 위에 컬러를 얹는」 출력 방식이라 시트 종류가 아니라 **공정**이 다르다.
-- 백색 잉크를 쓰므로 UV 계열로 판단했다(솔벤 장비에는 백색 잉크가 없다).
-- 라인 15줄이 119×134 처럼 규격을 갖고 있어 면적 과금(AREA)이 맞다.
-- 실제 단가 22,000 수준 = UV 시트(7,900)의 약 2.8배 — 백색 1도가 더 들어가는 만큼이다.
-- 기준단가는 미정이라 0. 형제(294 UV 시트)와 같은 분류·과금·최소변으로 맞춘다.
INSERT INTO items (category_id, item_code, item_name, unit, base_price, is_active,
                   category, sub_category, is_sales_item, is_purchase_item, pricing_method,
                   item_type, min_billing_side_cm, stock_mode, deduction_method,
                   created_at, updated_at)
SELECT 2, 'UV-SHEETM-WC', 'UV 무광시트 W+C', 'EA', 0, 1,
       'UV', '시트', 1, 0, 'AREA', 'PRODUCT',
       100, 'CONTINUOUS', 'NONE',
       datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code = 'UV-SHEETM-WC');

-- ── 4. UV 자석시트 (제품) ────────────────────────────────────────────────────
-- 자재는 폭 2종(1018 60cm · 1019 100cm)이 활성인데 **제품이 없어서** 인쇄물 9줄이
-- 「UV자석시트」라는 이름만으로 청구됐다(70×87 등 규격 보유 → AREA).
INSERT INTO items (category_id, item_code, item_name, unit, base_price, is_active,
                   category, sub_category, is_sales_item, is_purchase_item, pricing_method,
                   item_type, min_billing_side_cm, stock_mode, deduction_method,
                   created_at, updated_at)
SELECT 2, 'UV-MAGS', 'UV 자석시트', 'EA', 0, 1,
       'UV', '시트', 1, 0, 'AREA', 'PRODUCT',
       100, 'CONTINUOUS', 'NONE',
       datetime('now'), datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code = 'UV-MAGS');

-- ── 5. 제품 → 자재 매핑 ──────────────────────────────────────────────────────
-- 매핑이 있으면 재단 패널 [자재] 후보가 좁혀지고, 1개면 자동으로 채워진다.
INSERT INTO product_materials (product_item_id, material_item_id, is_default, created_at)
SELECT p.id, m.id, 0, datetime('now')
  FROM items p, items m
 WHERE p.item_code = 'UV-MAGS' AND m.item_code IN ('MAG-060', 'MAG-100')
   AND NOT EXISTS (SELECT 1 FROM product_materials x
                    WHERE x.product_item_id = p.id AND x.material_item_id = m.id);

INSERT INTO product_materials (product_item_id, material_item_id, is_default, created_at)
SELECT p.id, m.id, 0, datetime('now')
  FROM items p, items m
 WHERE p.item_code = 'UV-SHEETM-WC' AND m.item_code = 'SPM011M'
   AND NOT EXISTS (SELECT 1 FROM product_materials x
                    WHERE x.product_item_id = p.id AND x.material_item_id = m.id);

INSERT INTO product_materials (product_item_id, material_item_id, is_default, created_at)
SELECT p.id, m.id, 0, datetime('now')
  FROM items p, items m
 WHERE p.item_code = 'RM-DOAN-125' AND m.item_code = 'RM-DOAN'
   AND NOT EXISTS (SELECT 1 FROM product_materials x
                    WHERE x.product_item_id = p.id AND x.material_item_id = m.id);

-- ── 6. 미연결 라인 연결 (8줄) ────────────────────────────────────────────────
-- ⚠️ **이름만으로 연결하지 않는다.** 「태극기」로 적힌 9줄 중 8줄만 규격이 마스터와
--    정확히 일치한다(45×30 → TGK-SG45 · 30×20 → TGK-SG30). 나머지는 근거가 없어 남긴다:
--      · 태극기 34×20 1줄  — 마스터에 34×20 규격이 없다
--      · 만국기 9줄        — 마스터는 135×90·90×60 뿐인데 라인은 168×112·120×80·105×70·60×40
--      · 수기 14줄         — 이름이 「수기」뿐이라 어느 기(旗)의 수기인지 알 수 없다
--      · 수기대 12줄       — 길이(40/50/60)가 라인에 없다. 단가도 마스터 100 vs 라인 300~500
--      · 볼로프 8줄        — 4mm/5mm 구분 불가   · 큐방 5줄 — 원터치/압축·파이 구분 불가
--    틀린 품목을 붙이면 매출 귀속이 어긋나고, `/api/prices` 의 거래처별 최근거래가 제안까지
--    오염된다(그 거래처×품목의 다음 견적이 틀린 값에서 출발한다). 되돌리기보다 안 붙이는 게 싸다.
UPDATE order_items
   SET item_id = (SELECT id FROM items WHERE item_code = 'TGK-SG45'),
       updated_at = datetime('now')
 WHERE item_id IS NULL AND item_name = '태극기' AND width = 45 AND height = 30;

UPDATE order_items
   SET item_id = (SELECT id FROM items WHERE item_code = 'TGK-SG30'),
       updated_at = datetime('now')
 WHERE item_id IS NULL AND item_name = '태극기' AND width = 30 AND height = 20;
