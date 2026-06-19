-- 0322: 제품종류 대분류 카테고리 추가 (품목 표준화 Phase 1a, 비파괴/additive)
-- 근거: 표준품목_등록구조_수정본.xlsx 대분류 9종 / spec 2026-06-19-item-master-load-phase1
-- 기존 인쇄방식(전사/UV/솔벤)·역할(상품) 카테고리는 삭제/비활성 안 함
--   → 103 재포인트(P1c) 후 비활성. 원자재·부속품은 대분류로 재사용.
-- ★멱등 가드 = category_name 기준 (item_categories.category_name UNIQUE).
--   prod(6종)=7개 전부 신규 / local(12종, 분기 시드)=이미 있는 이름은 skip.
-- 로드(P1b)는 대분류 NAME → category_id 매핑(name UNIQUE)이라 코드 분기 무관.

INSERT INTO item_categories (category_name, category_code, sort_order, is_active)
SELECT '현수막', 'HANGING', 1, 1
WHERE NOT EXISTS (SELECT 1 FROM item_categories WHERE category_name = '현수막');

INSERT INTO item_categories (category_name, category_code, sort_order, is_active)
SELECT '배너', 'BANNER', 2, 1
WHERE NOT EXISTS (SELECT 1 FROM item_categories WHERE category_name = '배너');

INSERT INTO item_categories (category_name, category_code, sort_order, is_active)
SELECT '깃발·기', 'FLAG', 3, 1
WHERE NOT EXISTS (SELECT 1 FROM item_categories WHERE category_name = '깃발·기');

INSERT INTO item_categories (category_name, category_code, sort_order, is_active)
SELECT '시트·스티커', 'SHEET', 4, 1
WHERE NOT EXISTS (SELECT 1 FROM item_categories WHERE category_name = '시트·스티커');

INSERT INTO item_categories (category_name, category_code, sort_order, is_active)
SELECT '판재출력', 'PANEL', 5, 1
WHERE NOT EXISTS (SELECT 1 FROM item_categories WHERE category_name = '판재출력');

INSERT INTO item_categories (category_name, category_code, sort_order, is_active)
SELECT '출력물', 'PRINTOUT', 6, 1
WHERE NOT EXISTS (SELECT 1 FROM item_categories WHERE category_name = '출력물');

INSERT INTO item_categories (category_name, category_code, sort_order, is_active)
SELECT '간판', 'SIGN', 7, 1
WHERE NOT EXISTS (SELECT 1 FROM item_categories WHERE category_name = '간판');

-- 기존 원자재·부속품 정렬만 뒤로 (제품종류 다음)
UPDATE item_categories SET sort_order = 8 WHERE category_name = '원자재';
UPDATE item_categories SET sort_order = 9 WHERE category_name = '부속품';
