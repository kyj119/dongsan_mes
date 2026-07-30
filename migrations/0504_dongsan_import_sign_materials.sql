-- 0504: (구 0502 — 번호 충돌 개명. prod 적용 완료 상태) 동산기획 이카운트 이관 — 간판 자재 연결 + 결정 11건 반영 품목 신설
-- 근거: 용준님 2026-07-30 결정 — ①간판 자재만 먼저 등록(완제품·시공은 계속 NULL)
--   ⑤농협 시트 원단 신설 ⑥유리섬유 깃대 신설 ⑦광확산 4.5T 신설 ⑧R-꽂이 ㄷ자 별도 신설
--   ⑨태극기 8호-1 신설(원천 전건 105×70 실측) ⑪부직포 = 수성 출력 제품 신설
--
-- 원칙: 형제 승계는 INSERT...SELECT 클론(카테고리·가격방식·차감 자동 일치) · INSERT OR IGNORE 멱등
-- ⚠️ category_id: 원자재=5 · 상품=4 (prod 실측)

-- ════════════════════════════════════════════════════════════════════
-- 1) 간판 자재 — SGM 체계가 이미 있으므로 비활성 base 3종만 활성화 (사양 미상 판매 라인용 총칭)
--    KPL/JPL모듈=SGM-LED3-KPL/JPL · LED3구=SGM-LED3-WH · 15각파이프=SGM-PIPE-P15 는 기존 활성
-- ════════════════════════════════════════════════════════════════════
UPDATE items SET is_active = 1 WHERE item_code IN ('SGM-LEDF', 'SGM-SMPS', 'SGM-TRB') AND is_active = 0;

-- 간판 자재 신설 3종 (SGM에 없던 것 — SGM-ALP 형제 승계: MATERIAL·원자재·FIXED·NONE)
INSERT OR IGNORE INTO items (category_id, category, item_code, item_name, item_type, unit, base_price, is_sales_item, is_purchase_item, pricing_method, production_required, deduction_method, item_group, specification, ecount_code, description) VALUES
 (5, '원자재', 'SGM-GALVA', '갈바', 'MATERIAL', 'EA', 0, 1, 1, 'FIXED', 0, 'NONE', '갈바', NULL, NULL, '이카운트 이관 2026-07-30 · 갈바 단독판매 3L 4,647,000 · 규격은 주문별 상이(라인 사양 보존)'),
 (5, '원자재', 'SGM-ANGLE', '앵글', 'MATERIAL', 'EA', 0, 1, 1, 'FIXED', 0, 'NONE', '간판 부자재', NULL, NULL, '이카운트 이관 2026-07-30 · 간판 자재'),
 (5, '원자재', 'SGM-WIRE', '조립배선', 'MATERIAL', 'EA', 0, 1, 1, 'FIXED', 0, 'NONE', '간판 전장', NULL, NULL, '이카운트 이관 2026-07-30 · 34L 3,966,000 · 간판 전장 배선');

-- ════════════════════════════════════════════════════════════════════
-- 2) 농협 시트 원단 2종 (결정⑤ — 122폭 롤 판매. BUJIK/PONGE 원단 관행 승계)
-- ════════════════════════════════════════════════════════════════════
INSERT OR IGNORE INTO items (category_id, category, item_code, item_name, item_type, unit, base_price, is_sales_item, is_purchase_item, pricing_method, production_required, deduction_method, item_group, specification, ecount_code, description) VALUES
 (5, '원자재', 'LB9534NH-122', '농협 시트 LB9534NH(녹색)', 'MATERIAL', 'EA', 0, 1, 1, 'FIXED', 0, 'ROLL', '농협 시트', '122폭', NULL, '이카운트 이관 2026-07-30 · 1L 2,100,000 · LX 시트 제품번호'),
 (5, '원자재', 'LB9661NH-122', '농협 시트 LB9661NH(청색)', 'MATERIAL', 'EA', 0, 1, 1, 'FIXED', 0, 'ROLL', '농협 시트', '122폭', NULL, '이카운트 이관 2026-07-30 · 1L 1,050,000 · LX 시트 제품번호');

-- ════════════════════════════════════════════════════════════════════
-- 3) 게양 부속 2종 (결정⑥⑧)
-- ════════════════════════════════════════════════════════════════════
INSERT OR IGNORE INTO items (category_id, category, item_code, item_name, item_type, unit, base_price, is_sales_item, is_purchase_item, pricing_method, production_required, deduction_method, item_group, specification, ecount_code, description) VALUES
 (4, '상품', 'ACC-037', '유리섬유 깃대(그라스화이바)', 'GOODS', 'EA', 0, 1, 1, 'FIXED', 0, 'NONE', '게양 부속품', '3M', NULL, '이카운트 이관 2026-07-30 · 그라스화이바(3M) 2L 2,550,000 · 가끔 판매(용준님)'),
 (4, '상품', 'ACC-035-R-D', '깃대 꽂이 R형 ㄷ자', 'GOODS', 'EA', 0, 1, 1, 'FIXED', 0, 'NONE', '깃대 꽂이', 'R·ㄷ자', NULL, '이카운트 이관 2026-07-30 · R-꽂이(ㄷ자) 7L 1,408,800 · ㄷ자는 1/2구와 별도(용준님)');

-- ════════════════════════════════════════════════════════════════════
-- 4) 형제 클론 3종 (결정⑦⑨⑪ — INSERT...SELECT 로 카테고리·가격방식·차감 자동 승계)
-- ════════════════════════════════════════════════════════════════════
INSERT OR IGNORE INTO items (category_id, category, item_code, item_name, item_type, unit, base_price, is_sales_item, is_purchase_item, pricing_method, production_required, deduction_method, item_group, specification, ecount_code, description)
SELECT category_id, category, 'UV-PC-4.5T-M', 'UV 광확산PC 4.5T 유백', item_type, unit, 0, is_sales_item, is_purchase_item, pricing_method, production_required, deduction_method, item_group, '4.5T 유백', NULL, '이카운트 이관 2026-07-30 · 광학산PC-4.5T 1L 1,430,000 · 형제 UV-PC-3T-M 승계'
FROM items WHERE item_code = 'UV-PC-3T-M';

INSERT OR IGNORE INTO items (category_id, category, item_code, item_name, item_type, unit, base_price, is_sales_item, is_purchase_item, pricing_method, production_required, deduction_method, item_group, specification, ecount_code, description)
SELECT category_id, category, 'TGK-8-1', '태극기 8호-1', item_type, unit, 0, is_sales_item, is_purchase_item, pricing_method, production_required, deduction_method, item_group, '8호-1 105×70', NULL, '이카운트 이관 2026-07-30 · 8L 1,227,600 · 단가 1,600~2,000 · 원천 규격 전건 105×70 · 형제 TGK-7-1 승계'
FROM items WHERE item_code = 'TGK-7-1';

INSERT OR IGNORE INTO items (category_id, category, item_code, item_name, item_type, unit, base_price, is_sales_item, is_purchase_item, pricing_method, production_required, deduction_method, item_group, specification, ecount_code, description)
SELECT category_id, category, 'AQ-BUJIK', '수성 부직포', item_type, unit, 0, is_sales_item, is_purchase_item, pricing_method, production_required, deduction_method, item_group, NULL, NULL, '이카운트 이관 2026-07-30 · 부직포출력 11L 988,500 · 부직포=수성 출력(용준님) · 형제 AQ-TENT 승계'
FROM items WHERE item_code = 'AQ-TENT';
