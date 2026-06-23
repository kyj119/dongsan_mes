-- 0366: Phase1 전사 '깃발' 소분류 신설 + 전사 깃발/만장기/어구실명제 7제품 매핑 + 봉제·마감 후가공 연결
-- 용준님 결정: 깃발/만장기/어구실명제를 새 '깃발' 소분류로 통합. 전사 직접출력 봉제(하도매·부직포·수술)+마감 적용.
-- (idempotent: 존재하면 skip)

-- 1) '깃발' 소분류 신설 (전사 그룹)
INSERT INTO pp_applicable_subcategories (group_name, subcat_name, sort_order, is_active)
SELECT '전사', '깃발', 20, 1
WHERE NOT EXISTS (SELECT 1 FROM pp_applicable_subcategories WHERE subcat_name='깃발' AND group_name='전사');

-- 2) 전사 깃발/만장기/어구실명제 → sub_category='깃발'
UPDATE items SET sub_category='깃발'
WHERE item_type='PRODUCT' AND is_active=1 AND item_group IN ('깃발','만장기','어구실명제');

-- 3) 후가공 연결: 깃발 ↔ 하도매·부직포·수술·마감
INSERT INTO pp_option_subcategories (pp_option_id, subcat_id)
SELECT o.id, s.id
FROM post_processing_options o
JOIN pp_applicable_subcategories s ON s.subcat_name='깃발' AND s.group_name='전사'
WHERE o.option_code IN ('PP-GROMMET','PP-NONWOVEN','PP-TASSEL','PP-FINISHING')
  AND NOT EXISTS (SELECT 1 FROM pp_option_subcategories x WHERE x.pp_option_id=o.id AND x.subcat_id=s.id);
