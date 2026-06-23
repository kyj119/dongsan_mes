-- 0369: 켈/합성지/패트 코팅 — '합성지' 소분류 + 전용 코팅지(무광120g/180g·유광127) + 무광/유광 코팅옵션.
-- 시트 코팅(SPP031)과 다른 코팅지 소모. 무광 120g/180g은 차감 자재가 달라 각각 별도 그룹·옵션. 유광 127 단일폭.
-- 코팅지=매입자재(yd, ROLL, 폭매칭). spec에 롤길이(120g: 60/127=61m·90/152=45m / 180g·유광=45m). (idempotent)

-- 1) '합성지' 소분류 신설 (실사출력)
INSERT INTO pp_applicable_subcategories (group_name, subcat_name, sort_order, is_active)
SELECT '실사출력','합성지',22,1
WHERE NOT EXISTS (SELECT 1 FROM pp_applicable_subcategories WHERE subcat_name='합성지' AND group_name='실사출력');

-- 2) 켈/켈그레이/합성지/합성지그레이/패트 → sub_category='합성지' (현수막에서 분리)
UPDATE items SET sub_category='합성지'
WHERE item_type='PRODUCT' AND is_active=1 AND item_name IN ('수성 켈','수성 켈 그레이','수성 합성지','수성 합성지 그레이','수성 패트');

-- 3) 현수막 후가공(마감/펀칭/주석) → 합성지 복사 (기존 후가공 유지)
INSERT INTO pp_option_subcategories (pp_option_id, subcat_id)
SELECT x.pp_option_id, (SELECT id FROM pp_applicable_subcategories WHERE subcat_name='합성지' AND group_name='실사출력')
FROM pp_option_subcategories x
JOIN pp_applicable_subcategories s ON s.id=x.subcat_id AND s.subcat_name='현수막' AND s.group_name='실사출력'
WHERE NOT EXISTS (
  SELECT 1 FROM pp_option_subcategories z
  WHERE z.pp_option_id=x.pp_option_id
    AND z.subcat_id=(SELECT id FROM pp_applicable_subcategories WHERE subcat_name='합성지' AND group_name='실사출력'));

-- 4) 코팅지 자재 9 SKU (무광120g 4·무광180g 4·유광 1). 매입자재, yd, ROLL, 폭매칭. spec=폭+롤길이.
INSERT OR IGNORE INTO items (item_code, item_name, item_type, category, category_id, unit, base_price, sales_price, pricing_method, is_active, is_sales_item, is_purchase_item, production_required, item_group, width_mm, specification, deduction_method) VALUES
 ('MCP120-060','무광코팅지 120g','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,0,1,0,'무광코팅지 120g',600, '60cm 61m','ROLL'),
 ('MCP120-090','무광코팅지 120g','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,0,1,0,'무광코팅지 120g',900, '90cm 45m','ROLL'),
 ('MCP120-127','무광코팅지 120g','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,0,1,0,'무광코팅지 120g',1270,'127cm 61m','ROLL'),
 ('MCP120-152','무광코팅지 120g','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,0,1,0,'무광코팅지 120g',1520,'152cm 45m','ROLL'),
 ('MCP180-060','무광코팅지 180g','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,0,1,0,'무광코팅지 180g',600, '60cm 45m','ROLL'),
 ('MCP180-090','무광코팅지 180g','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,0,1,0,'무광코팅지 180g',900, '90cm 45m','ROLL'),
 ('MCP180-127','무광코팅지 180g','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,0,1,0,'무광코팅지 180g',1270,'127cm 45m','ROLL'),
 ('MCP180-152','무광코팅지 180g','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,0,1,0,'무광코팅지 180g',1520,'152cm 45m','ROLL'),
 ('GCP-127',   '유광코팅지',    'MATERIAL','원자재',5,'yd',0,0,'FIXED',1,0,1,0,'유광코팅지',    1270,'127cm','ROLL');

-- 5) 합성지 코팅 옵션 3종 → 각 코팅지 그룹 차감
INSERT OR IGNORE INTO post_processing_options (option_code, option_name, additional_cost, description, is_active, pricing_type, unit_price, pp_category, display_on_card, material_item_group) VALUES
 ('PP-COAT-M120','무광코팅 120g',0,'켈/합성지/패트 무광코팅 120g (코팅지 폭매칭 소비)',1,'fixed',0,'coating',1,'무광코팅지 120g'),
 ('PP-COAT-M180','무광코팅 180g',0,'켈/합성지/패트 무광코팅 180g',1,'fixed',0,'coating',1,'무광코팅지 180g'),
 ('PP-COAT-G2',  '유광코팅',     0,'켈/합성지/패트 유광코팅 (127 단일폭)',1,'fixed',0,'coating',1,'유광코팅지');

-- 6) 합성지 코팅옵션 → 합성지 소분류 연결
INSERT INTO pp_option_subcategories (pp_option_id, subcat_id)
SELECT o.id, s.id
FROM post_processing_options o
JOIN pp_applicable_subcategories s ON s.subcat_name='합성지' AND s.group_name='실사출력'
WHERE o.option_code IN ('PP-COAT-M120','PP-COAT-M180','PP-COAT-G2')
  AND NOT EXISTS (SELECT 1 FROM pp_option_subcategories x WHERE x.pp_option_id=o.id AND x.subcat_id=s.id);
