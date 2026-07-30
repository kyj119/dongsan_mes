-- 0499: 동산기획 이카운트 이관 — 품목 트랙 (SET·특호 신규 12종 + 비용항목 2종 + 현장호칭 별칭 매핑)
-- 근거: docs/dongsan-import/INSPECTION.md §⑦ §⑪  ·  용준님 결정 2026-07-30 "운반비는 분류, 나머지는 권고대로"
--
-- 원칙
--  ① 코드체계 = 기존 확장(§⑪ D1-ⓐ). 규격 변종 규약 `-S{가로}X{세로}` 승계
--  ② item_type = 형제 품목 승계 (부속·세트=GOODS / 태극기 본품=PRODUCT)
--  ③ 차감 = deduction_method 형제 승계, SET은 NONE (§⑪ D3-ⓑ — 자동차감 파이프라인 prod 발동 0건)
--  ④ base_price = 0 유지. 이카운트 실단가가 같은 규격 안에서도 2~3배 흩어져(예 3구R-150(120*80) 5,700/4,600/4,000)
--     대표값을 박으면 틀린 단가가 견적에 나간다. 실측 범위는 description 에 기록만 한다.
--  ⑤ A1 깃대조립(91L·117.6M)·A2 수기대조립(73L·174.9M)은 신규 품목을 만들지 않는다
--     — 실측 규격 표기가 25종·19종으로 난립(`3구 R-150(120*80)` / `R-150(3구)` / `130:2구` / `30*20`)해
--       변종 품목화가 불가능하다. 본품(TGK-*) + 부속(ACC-030·ACC-036) 2라인으로 적재한다(§⑪ A1 권고②)
--  ⑥ 멱등: INSERT OR IGNORE(item_code UNIQUE) + 별칭은 NOT LIKE 가드
--
-- ⚠️ items.category_id NOT NULL — 상품=4 / 태극기=10 / 기타=16 (prod 실측)

-- ════════════════════════════════════════════════════════════════════
-- A2 수기대 길이 변종 3종 (부모 ACC-036 '수기대(깃대)' = P-40/50/60 깃대만)
-- ════════════════════════════════════════════════════════════════════
INSERT OR IGNORE INTO items (category_id, category, item_code, item_name, item_type, unit, base_price, is_sales_item, is_purchase_item, pricing_method, production_required, deduction_method, item_group, specification, ecount_code, description) VALUES
 (4, '상품', 'ACC-036-L40', '수기대(깃대) 40cm', 'GOODS', 'EA', 0, 1, 1, 'FIXED', 0, 'ROLL', '게양 부속품', 'P-40 깃대만', NULL, '이카운트 이관 2026-07-30 · 수기대조립 SET 분해(30*20 수기대 40CM 6L 3,560,000)'),
 (4, '상품', 'ACC-036-L50', '수기대(깃대) 50cm', 'GOODS', 'EA', 0, 1, 1, 'FIXED', 0, 'ROLL', '게양 부속품', 'P-50 깃대만', NULL, '이카운트 이관 2026-07-30 · 수기대조립 SET 분해(30*20 수기대 50CM 32L 167,593,710 = SET 최대)'),
 (4, '상품', 'ACC-036-L60', '수기대(깃대) 60cm', 'GOODS', 'EA', 0, 1, 1, 'FIXED', 0, 'ROLL', '게양 부속품', 'P-60 깃대만', NULL, '이카운트 이관 2026-07-30 · 수기대조립 SET 분해(수기대 60CM 2L 340,000)');

-- ════════════════════════════════════════════════════════════════════
-- A3 정기 자수 삼발이 SET 규격 변종 2종 (부모 GDS-JASUSET, base_price 256,500)
--   80*115 는 실측 2L·금액 0원이라 미생성
-- ════════════════════════════════════════════════════════════════════
INSERT OR IGNORE INTO items (category_id, category, item_code, item_name, item_type, unit, base_price, is_sales_item, is_purchase_item, pricing_method, production_required, deduction_method, item_group, specification, ecount_code, description) VALUES
 (4, '상품', 'GDS-JASUSET-S135X90', '자수깃발 세트(삼발이) 135×90', 'GOODS', 'EA', 0, 1, 1, 'FIXED', 0, 'NONE', '자수깃발', '135×90', NULL, '이카운트 이관 2026-07-30 · 정기 자수 삼발이 SET 4L 38,640,000 · 실단가 200,000~240,000'),
 (4, '상품', 'GDS-JASUSET-S120X80', '자수깃발 세트(삼발이) 120×80', 'GOODS', 'EA', 0, 1, 1, 'FIXED', 0, 'NONE', '자수깃발', '120×80', NULL, '이카운트 이관 2026-07-30 · 정기 자수 삼발이 SET 4L 980,000 · 실단가 220,000~320,000');

-- ════════════════════════════════════════════════════════════════════
-- A4 태극기 정기자수삼발이 SET 1종 — A3(정기 자수 삼발이 SET)과 품목명·단가대가 달라 별개 유지
-- ════════════════════════════════════════════════════════════════════
INSERT OR IGNORE INTO items (category_id, category, item_code, item_name, item_type, unit, base_price, is_sales_item, is_purchase_item, pricing_method, production_required, deduction_method, item_group, specification, ecount_code, description) VALUES
 (10, '태극기', 'TGK-JASUSET-S135X90', '태극기 정기자수삼발이 SET 135×90', 'PRODUCT', 'EA', 0, 1, 1, 'FIXED', 1, 'NONE', '태극기 정기자수 깃발', '135×90', NULL, '이카운트 이관 2026-07-30 · 9L 11,725,000 · 실단가 200,000~250,000');

-- ════════════════════════════════════════════════════════════════════
-- A6 가정용(지관)세트 1종 = 유일한 완전 신규
--   ※ A5 가정용 함세트는 GDS-FB1(보급형)·GDS-FB2(중급형)·GDS-FBSET 이 이미 있어 신규 0
-- ════════════════════════════════════════════════════════════════════
INSERT OR IGNORE INTO items (category_id, category, item_code, item_name, item_type, unit, base_price, is_sales_item, is_purchase_item, pricing_method, production_required, deduction_method, item_group, specification, ecount_code, description) VALUES
 (4, '상품', 'GDS-JIGWANSET', '태극기 가정용(지관)세트', 'GOODS', 'EA', 0, 1, 1, 'FIXED', 0, 'NONE', '국기함', '지관 세트 90×60', NULL, '이카운트 이관 2026-07-30 · 11L 19,234,000 · 실단가 5,900~9,000');

-- ════════════════════════════════════════════════════════════════════
-- A7 배너대 조립 규격 변종 2종 (부모 ACC-013 '배너대 조립(조당)')
-- ════════════════════════════════════════════════════════════════════
INSERT OR IGNORE INTO items (category_id, category, item_code, item_name, item_type, unit, base_price, is_sales_item, is_purchase_item, pricing_method, production_required, deduction_method, item_group, specification, ecount_code, description) VALUES
 (4, '상품', 'ACC-013-S60X180', '배너대 조립(조당) 60×180', 'GOODS', 'EA', 0, 1, 1, 'FIXED', 0, 'ROLL', '배너 부속품', '60×180', NULL, '이카운트 이관 2026-07-30 · 14L 23,793,000 · 실단가 14,000~24,000'),
 (4, '상품', 'ACC-013-S60X220', '배너대 조립(조당) 60×220', 'GOODS', 'EA', 0, 1, 1, 'FIXED', 0, 'ROLL', '배너 부속품', '60×220', NULL, '이카운트 이관 2026-07-30 · 1L 168,000 · 실단가 14,000');

-- ════════════════════════════════════════════════════════════════════
-- A8 태극기 특호·대형 3종 (부모 TGK-* 계열, PRODUCT)
--   ★900×600 은 §4-3 결정(540×360·1200×800)에 없었으나 실측 최대 금액(18,550,000)이라 포함
-- ════════════════════════════════════════════════════════════════════
INSERT OR IGNORE INTO items (category_id, category, item_code, item_name, item_type, unit, base_price, is_sales_item, is_purchase_item, pricing_method, production_required, deduction_method, item_group, specification, ecount_code, description) VALUES
 (10, '태극기', 'TGK-SPECIAL-S900X600', '태극기 특호 900×600', 'PRODUCT', 'EA', 0, 1, 1, 'FIXED', 1, 'ROLL', '태극기', '900×600', NULL, '이카운트 이관 2026-07-30 · 1L 18,550,000 · 실단가 350,000'),
 (10, '태극기', 'TGK-SPECIAL-S540X360', '태극기 특호 540×360', 'PRODUCT', 'EA', 0, 1, 1, 'FIXED', 1, 'ROLL', '태극기', '540×360', NULL, '이카운트 이관 2026-07-30 · 11L 10,657,000 · 실단가 72,000~110,000'),
 (10, '태극기', 'TGK-SPECIAL-S1200X800', '대형태극기 1200×800', 'PRODUCT', 'EA', 0, 1, 1, 'FIXED', 1, 'ROLL', '태극기', '1200×800', NULL, '이카운트 이관 2026-07-30 · 5L 6,930,000 · 실단가 630,000');

-- ════════════════════════════════════════════════════════════════════
-- 트랙B — 비용항목 신규 2종 (기존 ETC-* 계열 승계, category_id 16 '기타')
--   B1 크레인은 배송이 아니라 시공 장비라 ETC-SHIP/ETC-EXP 에 넣지 않는다
-- ════════════════════════════════════════════════════════════════════
INSERT OR IGNORE INTO items (category_id, category, item_code, item_name, item_type, unit, base_price, is_sales_item, is_purchase_item, pricing_method, production_required, deduction_method, description) VALUES
 (16, '기타', 'ETC-CRANE', '크레인 사용료', 'GOODS', 'EA', 0, 1, 1, 'FIXED', 0, 'NONE', '이카운트 이관 2026-07-30 · 1L 850,000 · 배송이 아닌 시공 장비'),
 (16, '기타', 'ETC-DESIGN', '시안비', 'GOODS', 'EA', 0, 1, 0, 'FIXED', 0, 'NONE', '이카운트 이관 2026-07-30 · 시안/시안비 4코드 통합 5L 65,000');

-- ════════════════════════════════════════════════════════════════════
-- 현장 호칭 → 기존 품목 별칭 매핑 (search_keywords 추가)
--   이카운트 호칭을 검색어에 붙여 두면 매칭 스크립트가 자동으로 잡는다(§② A_확정 경로).
--   ⚠️ 기존 값이 있는 품목이 있어 덮어쓰지 않고 append. NOT LIKE 가드로 멱등.
-- ════════════════════════════════════════════════════════════════════

-- B1 운반비 분류 ①배송비(택배/화물) ← 택배비·대신택배·대신화물·경동화물·화물비·운임비 (1,101L · 7,266,760)
UPDATE items SET search_keywords = COALESCE(NULLIF(search_keywords,'')||',','')||'택배비,대신택배,대신화물,경동화물,화물비,운임비', updated_at = CURRENT_TIMESTAMP
 WHERE item_code = 'ETC-SHIP' AND (search_keywords IS NULL OR search_keywords NOT LIKE '%대신택배%');

-- B1 운반비 분류 ②긴급배송(용달/퀵) ← 퀵비·퀵비(선불)·퀵비+버스비·용차비 (107L · 4,780,000)
UPDATE items SET search_keywords = COALESCE(NULLIF(search_keywords,'')||',','')||'퀵비,퀵비(선불),퀵비+버스비,용차비', updated_at = CURRENT_TIMESTAMP
 WHERE item_code = 'ETC-EXP' AND (search_keywords IS NULL OR search_keywords NOT LIKE '%용차비%');

-- B1 운반비 분류 ③크레인 (신규 품목에 호칭 부여)
UPDATE items SET search_keywords = COALESCE(NULLIF(search_keywords,'')||',','')||'크레인', updated_at = CURRENT_TIMESTAMP
 WHERE item_code = 'ETC-CRANE' AND (search_keywords IS NULL OR search_keywords NOT LIKE '%크레인%');

-- B3 시안비
UPDATE items SET search_keywords = COALESCE(NULLIF(search_keywords,'')||',','')||'시안,시안비', updated_at = CURRENT_TIMESTAMP
 WHERE item_code = 'ETC-DESIGN' AND (search_keywords IS NULL OR search_keywords NOT LIKE '%시안비%');

-- B4 DC → 기존 할인 품목 (신규 0)
UPDATE items SET search_keywords = COALESCE(NULLIF(search_keywords,'')||',','')||'DC', updated_at = CURRENT_TIMESTAMP
 WHERE item_code = 'ETC-DISC' AND (search_keywords IS NULL OR search_keywords NOT LIKE '%DC%');

-- B5 원단 현장 호칭 — 신규 등록이 아니라 별칭이었다
UPDATE items SET search_keywords = COALESCE(NULLIF(search_keywords,'')||',','')||'그레이켈', updated_at = CURRENT_TIMESTAMP
 WHERE item_code = 'AQ-KELG' AND (search_keywords IS NULL OR search_keywords NOT LIKE '%그레이켈%');
UPDATE items SET search_keywords = COALESCE(NULLIF(search_keywords,'')||',','')||'와이드컬러(백릿),와이드컬러', updated_at = CURRENT_TIMESTAMP
 WHERE item_code = 'AQ-BKLT' AND (search_keywords IS NULL OR search_keywords NOT LIKE '%와이드컬러%');
UPDATE items SET search_keywords = COALESCE(NULLIF(search_keywords,'')||',','')||'합성지(비접착)', updated_at = CURRENT_TIMESTAMP
 WHERE item_code = 'AQ-SYN' AND (search_keywords IS NULL OR search_keywords NOT LIKE '%합성지(비접착)%');

-- B5 부속·상품 현장 호칭
UPDATE items SET search_keywords = COALESCE(NULLIF(search_keywords,'')||',','')||'탁상용(수술),탁상용(수술x),탁상용(수술) (호국)', updated_at = CURRENT_TIMESTAMP
 WHERE item_code = 'GDS-DESK' AND (search_keywords IS NULL OR search_keywords NOT LIKE '%탁상용(수술)%');
UPDATE items SET search_keywords = COALESCE(NULLIF(search_keywords,'')||',','')||'국기봉-금봉(막봉),가정용 막봉', updated_at = CURRENT_TIMESTAMP
 WHERE item_code = 'ACC-042' AND (search_keywords IS NULL OR search_keywords NOT LIKE '%국기봉-금봉%');
UPDATE items SET search_keywords = COALESCE(NULLIF(search_keywords,'')||',','')||'자이언트트라이폴4M,자이언트 폴세트', updated_at = CURRENT_TIMESTAMP
 WHERE item_code = 'ACC-023' AND (search_keywords IS NULL OR search_keywords NOT LIKE '%자이언트트라이폴%');
UPDATE items SET search_keywords = COALESCE(NULLIF(search_keywords,'')||',','')||'삼발이세트', updated_at = CURRENT_TIMESTAMP
 WHERE item_code = 'ACC-015' AND (search_keywords IS NULL OR search_keywords NOT LIKE '%삼발이세트%');
