-- 0508: 간판 BOM P2 — product_materials 소요량 확장 + 간판 대표 품목 8종 + 표준 자재 BOM(가정치)
-- 근거: 간판BOM_초안_v1 검토(용준님 2026-08-01) — 프레임 신규/교체 분리 반영.
-- usage_type 의미: FIXED_QTY(quantity 고정) | PER_AREA(㎡×param개) | PER_AREA_SHEET(ceil(㎡/param)장)
--                | PER_PERIMETER(ceil(둘레m/param)개) | PER_LED(ceil(LED수/param)개) | PER_WIDTH(ceil(가로m/param)개)
--                | PER_AREA_ROLL(㎡/param롤). ★notes = 가정치(작업지시서 역산·디자이너 검토로 보정 예정).
-- ⚠️D1 함정: 다항 UNION ALL SELECT = "too many terms in compound SELECT" → 행별 INSERT.
-- (1) 소요량 컬럼 — NULL = 기존 '구성품 1EA' 해석 유지(깃대 SET·RM-TP BOM 하위호환)
ALTER TABLE product_materials ADD COLUMN quantity REAL;
ALTER TABLE product_materials ADD COLUMN usage_type TEXT;
ALTER TABLE product_materials ADD COLUMN usage_param REAL;
ALTER TABLE product_materials ADD COLUMN notes TEXT;

-- (2) 간판 대표 품목 8종 (item_categories 14='간판' 기존 행 사용. 교체/신규 분리 기준=판가 90,000원/㎡·'완제' 표기)
INSERT OR IGNORE INTO items (category_id, item_code, item_name, unit, category, item_type, is_purchase_item, is_sales_item, deduction_method, item_group, base_price, is_active, pricing_method, description)
VALUES
 (14, 'SIGN-CH',    '채널간판',              'EA', '간판', 'PRODUCT', 0, 1, 'NONE', '간판', 0, 1, 'FIXED', '구성요소형(면적 모델 불가 — 판가/㎡ IQR 267k~1.87M). 정확 원가는 2차 견적 BOM에서'),
 (14, 'SIGN-FRL',   '조명 프레임간판(신규 제작)', 'EA', '간판', 'PRODUCT', 0, 1, 'NONE', '간판', 0, 1, 'FIXED', '트러스바 프레임+조명. 이관 소급 기준: 판가≥90,000/㎡ 또는 완제 표기'),
 (14, 'SIGN-FRL-R', '조명 프레임간판(원단 교체)', 'EA', '간판', 'PRODUCT', 0, 1, 'NONE', '간판', 0, 1, 'FIXED', '기존 틀 유지·후렉스 원단 교체. 이관 매출 다수(판가 중앙 55k/㎡)'),
 (14, 'SIGN-FRN',   '비조명 프레임간판(신규 제작)', 'EA', '간판', 'PRODUCT', 0, 1, 'NONE', '간판', 0, 1, 'FIXED', '이관 소급 기준: 판가≥90,000/㎡ 또는 완제 표기'),
 (14, 'SIGN-FRN-R', '비조명 프레임간판(원단 교체)', 'EA', '간판', 'PRODUCT', 0, 1, 'NONE', '간판', 0, 1, 'FIXED', '기존 틀 유지·원단 교체(판가 중앙 38k/㎡)'),
 (14, 'SIGN-PRT',   '돌출간판',              'EA', '간판', 'PRODUCT', 0, 1, 'NONE', '간판', 0, 1, 'FIXED', '판가 중앙 172k/㎡. 스텐원형·포인트 완제는 SGM-SRND/PRND 기존 활용'),
 (14, 'SIGN-SCS',   '스카시(입체문자)',        'EA', '간판', 'PRODUCT', 0, 1, 'NONE', '간판', 0, 1, 'FIXED', '포맥스/아크릴 재단 — 두께·소재 옵션 미정이라 BOM 보류'),
 (14, 'SIGN-ETC',   '간판 기타(일반)',         'EA', '간판', 'PRODUCT', 0, 1, 'NONE', '간판', 0, 1, 'FIXED', '유형 분류 불가 잔여 흡수용');

-- (3) 표준 자재 BOM (가정치 — ★는 보정 대상. 행별 INSERT = D1 compound 한도 회피)
INSERT OR IGNORE INTO product_materials (product_item_id, material_item_id, is_default, quantity, usage_type, usage_param, notes) SELECT p.id, m.id, 1, NULL, 'PER_AREA_SHEET', 2.5, '백판 — 장당 유효 2.5㎡(로스 16%)' FROM items p, items m WHERE p.item_code='SIGN-CH' AND m.item_code='ALM-2T-WH-48';
INSERT OR IGNORE INTO product_materials (product_item_id, material_item_id, is_default, quantity, usage_type, usage_param, notes) SELECT p.id, m.id, 1, NULL, 'PER_AREA_SHEET', 2.5, '전면 광확산(아크릴 대체 옵션)' FROM items p, items m WHERE p.item_code='SIGN-CH' AND m.item_code='PC-1.8T-M-48';
INSERT OR IGNORE INTO product_materials (product_item_id, material_item_id, is_default, quantity, usage_type, usage_param, notes) SELECT p.id, m.id, 1, NULL, 'PER_AREA', 35, '★가정 35개/㎡ — 작업지시서 역산 보정 예정(100/㎡ 가능성)' FROM items p, items m WHERE p.item_code='SIGN-CH' AND m.item_code='SGM-LED3-2835';
INSERT OR IGNORE INTO product_materials (product_item_id, material_item_id, is_default, quantity, usage_type, usage_param, notes) SELECT p.id, m.id, 1, NULL, 'PER_LED', 300, 'SMPS N개용=LED N개 — ceil(LED수/300)' FROM items p, items m WHERE p.item_code='SIGN-CH' AND m.item_code='SGM-SMPS-W300';
INSERT OR IGNORE INTO product_materials (product_item_id, material_item_id, is_default, quantity, usage_type, usage_param, notes) SELECT p.id, m.id, 1, NULL, 'PER_PERIMETER', 3, '측면 입체바 80mm — 개당 3m' FROM items p, items m WHERE p.item_code='SIGN-CH' AND m.item_code='SGM-IPB-WH';
INSERT OR IGNORE INTO product_materials (product_item_id, material_item_id, is_default, quantity, usage_type, usage_param, notes) SELECT p.id, m.id, 1, NULL, 'PER_PERIMETER', 3, '★검토 — 캡바 사용 여부·색상' FROM items p, items m WHERE p.item_code='SIGN-CH' AND m.item_code='SGM-KPB-WH';
INSERT OR IGNORE INTO product_materials (product_item_id, material_item_id, is_default, quantity, usage_type, usage_param, notes) SELECT p.id, m.id, 1, NULL, 'PER_LED', 833, '★가정 LED 0.12m/개 → 100m 롤당 833개' FROM items p, items m WHERE p.item_code='SIGN-CH' AND m.item_code='SGM-LEDW';
INSERT OR IGNORE INTO product_materials (product_item_id, material_item_id, is_default, quantity, usage_type, usage_param, notes) SELECT p.id, m.id, 1, NULL, 'PER_PERIMETER', 7, '★폭 선택 규칙 검토(세로≥1.5m→300mm) — 개당 7m' FROM items p, items m WHERE p.item_code='SIGN-FRL' AND m.item_code='SGM-TRB-R200-WH';
INSERT OR IGNORE INTO product_materials (product_item_id, material_item_id, is_default, quantity, usage_type, usage_param, notes) SELECT p.id, m.id, 1, NULL, 'PER_PERIMETER', 7, '날개 — 개당 7m' FROM items p, items m WHERE p.item_code='SIGN-FRL' AND m.item_code='SGM-TRW-WH';
INSERT OR IGNORE INTO product_materials (product_item_id, material_item_id, is_default, quantity, usage_type, usage_param, notes) SELECT p.id, m.id, 1, 2, 'FIXED_QTY', NULL, '옆마구리 좌우 2개 ★검토' FROM items p, items m WHERE p.item_code='SIGN-FRL' AND m.item_code='SGM-CSM-R200-WH';
INSERT OR IGNORE INTO product_materials (product_item_id, material_item_id, is_default, quantity, usage_type, usage_param, notes) SELECT p.id, m.id, 1, NULL, 'PER_WIDTH', 0.9, '★가정 — 보강대 가로 0.9m당 1개' FROM items p, items m WHERE p.item_code='SIGN-FRL' AND m.item_code='SGM-TRF';
INSERT OR IGNORE INTO product_materials (product_item_id, material_item_id, is_default, quantity, usage_type, usage_param, notes) SELECT p.id, m.id, 1, NULL, 'PER_AREA_ROLL', 65, '조명 후렉스 롤=1.3m×50m=65㎡ (폭 변종 대체 가능)' FROM items p, items m WHERE p.item_code='SIGN-FRL' AND m.item_code='FLEXL-130';
INSERT OR IGNORE INTO product_materials (product_item_id, material_item_id, is_default, quantity, usage_type, usage_param, notes) SELECT p.id, m.id, 1, NULL, 'PER_AREA', 4, '★가정 4개/㎡ — LED형광등 20W' FROM items p, items m WHERE p.item_code='SIGN-FRL' AND m.item_code='SGM-LEDF-F20S';
INSERT OR IGNORE INTO product_materials (product_item_id, material_item_id, is_default, quantity, usage_type, usage_param, notes) SELECT p.id, m.id, 1, NULL, 'PER_PERIMETER', 7, '★폭 선택 규칙 검토' FROM items p, items m WHERE p.item_code='SIGN-FRN' AND m.item_code='SGM-TRB-R200-WH';
INSERT OR IGNORE INTO product_materials (product_item_id, material_item_id, is_default, quantity, usage_type, usage_param, notes) SELECT p.id, m.id, 1, NULL, 'PER_PERIMETER', 7, '날개' FROM items p, items m WHERE p.item_code='SIGN-FRN' AND m.item_code='SGM-TRW-WH';
INSERT OR IGNORE INTO product_materials (product_item_id, material_item_id, is_default, quantity, usage_type, usage_param, notes) SELECT p.id, m.id, 1, 2, 'FIXED_QTY', NULL, '옆마구리 좌우 2개' FROM items p, items m WHERE p.item_code='SIGN-FRN' AND m.item_code='SGM-CSM-R200-WH';
INSERT OR IGNORE INTO product_materials (product_item_id, material_item_id, is_default, quantity, usage_type, usage_param, notes) SELECT p.id, m.id, 1, NULL, 'PER_WIDTH', 0.9, '★가정' FROM items p, items m WHERE p.item_code='SIGN-FRN' AND m.item_code='SGM-TRF';
INSERT OR IGNORE INTO product_materials (product_item_id, material_item_id, is_default, quantity, usage_type, usage_param, notes) SELECT p.id, m.id, 1, NULL, 'PER_AREA_ROLL', 65, '비조명 후렉스(그레이=SK 예스후렉스 대체 가능)' FROM items p, items m WHERE p.item_code='SIGN-FRN' AND m.item_code='FLEXN-130';
INSERT OR IGNORE INTO product_materials (product_item_id, material_item_id, is_default, quantity, usage_type, usage_param, notes) SELECT p.id, m.id, 1, NULL, 'PER_AREA_ROLL', 65, '원단 교체 — 원단만 소요' FROM items p, items m WHERE p.item_code='SIGN-FRL-R' AND m.item_code='FLEXL-130';
INSERT OR IGNORE INTO product_materials (product_item_id, material_item_id, is_default, quantity, usage_type, usage_param, notes) SELECT p.id, m.id, 1, NULL, 'PER_AREA_ROLL', 65, '원단 교체 — 원단만 소요' FROM items p, items m WHERE p.item_code='SIGN-FRN-R' AND m.item_code='FLEXN-130';
INSERT OR IGNORE INTO product_materials (product_item_id, material_item_id, is_default, quantity, usage_type, usage_param, notes) SELECT p.id, m.id, 1, NULL, 'PER_AREA', NULL, '★프레임 갈바 산정 규칙 미정' FROM items p, items m WHERE p.item_code='SIGN-PRT' AND m.item_code='SGM-GALVA';
INSERT OR IGNORE INTO product_materials (product_item_id, material_item_id, is_default, quantity, usage_type, usage_param, notes) SELECT p.id, m.id, 1, NULL, 'PER_AREA_SHEET', 1.25, '양면 = 장당 유효 1.25㎡' FROM items p, items m WHERE p.item_code='SIGN-PRT' AND m.item_code='PC-1.8T-M-48';
INSERT OR IGNORE INTO product_materials (product_item_id, material_item_id, is_default, quantity, usage_type, usage_param, notes) SELECT p.id, m.id, 1, NULL, 'PER_AREA', 70, '★양면 70개/㎡ 가정' FROM items p, items m WHERE p.item_code='SIGN-PRT' AND m.item_code='SGM-LED3-2835';
INSERT OR IGNORE INTO product_materials (product_item_id, material_item_id, is_default, quantity, usage_type, usage_param, notes) SELECT p.id, m.id, 1, NULL, 'PER_LED', 300, 'ceil(LED수/300)' FROM items p, items m WHERE p.item_code='SIGN-PRT' AND m.item_code='SGM-SMPS-W300';
