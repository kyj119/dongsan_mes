-- 0368: Phase3 WAY — '윈도우필름' 소분류 신설 + 엠보/클리어 이동 + WAY(1/2/3WAY) print_layer 옵션 + 연결.
-- WAY=인쇄레이어 출력옵션(원단 동일·차감 없음). 윈도우필름(엠보·클리어)에만 노출(일반 시트 제외).
-- 기존 '시트' 후가공(돔보·펀칭·주석·오프셋)은 윈도우필름에 복사 유지, 코팅(SPP031)은 "시트에만"이라 제외. (idempotent)

-- 1) '윈도우필름' 소분류 신설 (실사출력 그룹)
INSERT INTO pp_applicable_subcategories (group_name, subcat_name, sort_order, is_active)
SELECT '실사출력', '윈도우필름', 21, 1
WHERE NOT EXISTS (SELECT 1 FROM pp_applicable_subcategories WHERE subcat_name='윈도우필름' AND group_name='실사출력');

-- 2) 엠보시트/클리어필름 → sub_category='윈도우필름'
UPDATE items SET sub_category='윈도우필름' WHERE item_code IN ('UV-EMBO','UV-CLEAR');

-- 3) WAY print_layer 옵션 3종 (차감 없음=material_item_group NULL)
INSERT INTO post_processing_options (option_code, option_name, additional_cost, description, is_active, pricing_type, unit_price, pp_category, display_on_card, material_item_group)
SELECT v.code, v.name, 0, 'UV 인쇄 레이어(시야방향) 옵션', 1, 'fixed', 0, 'print_layer', 1, NULL
FROM (SELECT 'WAY-1' code, '1WAY' name UNION ALL SELECT 'WAY-2','2WAY' UNION ALL SELECT 'WAY-3','3WAY') v
WHERE NOT EXISTS (SELECT 1 FROM post_processing_options WHERE option_code=v.code);

-- 4) WAY → 윈도우필름 연결
INSERT INTO pp_option_subcategories (pp_option_id, subcat_id)
SELECT o.id, s.id
FROM post_processing_options o
JOIN pp_applicable_subcategories s ON s.subcat_name='윈도우필름' AND s.group_name='실사출력'
WHERE o.pp_category='print_layer'
  AND NOT EXISTS (SELECT 1 FROM pp_option_subcategories x WHERE x.pp_option_id=o.id AND x.subcat_id=s.id);

-- 5) 기존 '시트' 후가공(코팅 제외) → 윈도우필름 복사 (마감/돔보/펀칭/주석/오프셋 유지)
INSERT INTO pp_option_subcategories (pp_option_id, subcat_id)
SELECT x.pp_option_id, (SELECT id FROM pp_applicable_subcategories WHERE subcat_name='윈도우필름' AND group_name='실사출력')
FROM pp_option_subcategories x
JOIN pp_applicable_subcategories s ON s.id=x.subcat_id AND s.subcat_name='시트' AND s.group_name='실사출력'
JOIN post_processing_options o ON o.id=x.pp_option_id
WHERE o.pp_category != 'coating'
  AND NOT EXISTS (
    SELECT 1 FROM pp_option_subcategories z
    WHERE z.pp_option_id=x.pp_option_id
      AND z.subcat_id=(SELECT id FROM pp_applicable_subcategories WHERE subcat_name='윈도우필름' AND group_name='실사출력'));
