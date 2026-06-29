-- 0407: 범용 '선택 옵션' 첫 사용 — 배너 형(型) 주문옵션. pp_category='형'(하드코딩 카테고리 외=범용 select 렌더).
-- 윈드배너=S/F, 워킹배너=S/F/H. 무비용·무차감(material_item_group NULL). display_on_card=1. (idempotent)
-- 향후 다른 선택형 옵션은 pp_category 신설 + 링크(마이그)만으로 추가 — 코드 불요.

-- 1) sub_category 보장(전사 그룹; 이미 존재 시 skip)
INSERT INTO pp_applicable_subcategories (group_name, subcat_name, sort_order, is_active)
SELECT '전사', v.name, v.sort, 1
FROM (SELECT '윈드배너' name, 22 sort UNION ALL SELECT '워킹배너' name, 23 sort) v
WHERE NOT EXISTS (SELECT 1 FROM pp_applicable_subcategories s WHERE s.subcat_name=v.name AND s.group_name='전사');

-- 2) 형 옵션 3종 (pp_category='형', 무차감·무비용)
INSERT INTO post_processing_options (option_code, option_name, additional_cost, description, is_active, pricing_type, unit_price, pp_category, display_on_card, material_item_group)
SELECT v.code, v.name, 0, '배너 거치대 형식(주문옵션)', 1, 'fixed', 0, '형', 1, NULL
FROM (SELECT 'TYPE-S' code,'S형' name UNION ALL SELECT 'TYPE-F' code,'F형' name UNION ALL SELECT 'TYPE-H' code,'H형' name) v
WHERE NOT EXISTS (SELECT 1 FROM post_processing_options WHERE option_code=v.code);

-- 3) 게이팅: 윈드=S/F, 워킹=S/F/H
INSERT INTO pp_option_subcategories (pp_option_id, subcat_id)
SELECT o.id, s.id
FROM post_processing_options o
JOIN pp_applicable_subcategories s ON s.group_name='전사'
WHERE o.pp_category='형'
  AND ( (s.subcat_name='윈드배너' AND o.option_code IN ('TYPE-S','TYPE-F'))
     OR (s.subcat_name='워킹배너' AND o.option_code IN ('TYPE-S','TYPE-F','TYPE-H')) )
  AND NOT EXISTS (SELECT 1 FROM pp_option_subcategories x WHERE x.pp_option_id=o.id AND x.subcat_id=s.id);
