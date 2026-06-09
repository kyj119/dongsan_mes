-- ═══════════════════════════════════════
-- 카테고리
-- ═══════════════════════════════════════
INSERT INTO item_categories (category_name, category_code, sort_order, is_active) VALUES ('현수막', 'BANNER', 1, 1);
INSERT INTO item_categories (category_name, category_code, sort_order, is_active) VALUES ('배너', 'X_BANNER', 2, 1);
INSERT INTO item_categories (category_name, category_code, sort_order, is_active) VALUES ('간판', 'SIGN', 3, 1);
INSERT INTO item_categories (category_name, category_code, sort_order, is_active) VALUES ('스티커', 'STICKER', 4, 1);
INSERT INTO item_categories (category_name, category_code, sort_order, is_active) VALUES ('현판', 'PLAQUE', 5, 1);
INSERT INTO item_categories (category_name, category_code, sort_order, is_active) VALUES ('기타', 'ETC', 6, 1);

-- ═══════════════════════════════════════
-- 서브카테고리
-- ═══════════════════════════════════════
INSERT INTO item_subcategories (category_id, subcategory_name, subcategory_code, sort_order, is_active) VALUES (1, '일반현수막', 'BANNER_NORMAL', 1, 1);
INSERT INTO item_subcategories (category_id, subcategory_name, subcategory_code, sort_order, is_active) VALUES (1, '메쉬현수막', 'BANNER_MESH', 2, 1);
INSERT INTO item_subcategories (category_id, subcategory_name, subcategory_code, sort_order, is_active) VALUES (1, '대형현수막', 'BANNER_LARGE', 3, 1);
INSERT INTO item_subcategories (category_id, subcategory_name, subcategory_code, sort_order, is_active) VALUES (2, 'X배너', 'X_BANNER_STD', 1, 1);
INSERT INTO item_subcategories (category_id, subcategory_name, subcategory_code, sort_order, is_active) VALUES (2, '롤배너', 'ROLL_BANNER', 2, 1);
INSERT INTO item_subcategories (category_id, subcategory_name, subcategory_code, sort_order, is_active) VALUES (2, 'Y배너', 'Y_BANNER', 3, 1);
INSERT INTO item_subcategories (category_id, subcategory_name, subcategory_code, sort_order, is_active) VALUES (3, '포맥스간판', 'SIGN_FOMAX', 1, 1);
INSERT INTO item_subcategories (category_id, subcategory_name, subcategory_code, sort_order, is_active) VALUES (3, '아크릴간판', 'SIGN_ACRYLIC', 2, 1);
INSERT INTO item_subcategories (category_id, subcategory_name, subcategory_code, sort_order, is_active) VALUES (3, '알루미늄간판', 'SIGN_ALU', 3, 1);
INSERT INTO item_subcategories (category_id, subcategory_name, subcategory_code, sort_order, is_active) VALUES (4, '일반스티커', 'STICKER_NORMAL', 1, 1);
INSERT INTO item_subcategories (category_id, subcategory_name, subcategory_code, sort_order, is_active) VALUES (4, '투명스티커', 'STICKER_CLEAR', 2, 1);
INSERT INTO item_subcategories (category_id, subcategory_name, subcategory_code, sort_order, is_active) VALUES (4, '차량스티커', 'STICKER_CAR', 3, 1);
INSERT INTO item_subcategories (category_id, subcategory_name, subcategory_code, sort_order, is_active) VALUES (5, '아크릴현판', 'PLAQUE_ACRYLIC', 1, 1);
INSERT INTO item_subcategories (category_id, subcategory_name, subcategory_code, sort_order, is_active) VALUES (5, '금속현판', 'PLAQUE_METAL', 2, 1);
INSERT INTO item_subcategories (category_id, subcategory_name, subcategory_code, sort_order, is_active) VALUES (6, '기타인쇄물', 'ETC_PRINT', 1, 1);

-- ═══════════════════════════════════════
-- 품목 (items)
-- ═══════════════════════════════════════
INSERT INTO items (category_id, subcategory_id, item_code, item_name, unit, base_price, is_active, category, sub_category, is_sales_item, is_purchase_item) VALUES (1, 1, 'BN-001', '일반현수막 (실내)', 'EA', 5000, 1, '현수막', '일반현수막', 1, 0);
INSERT INTO items (category_id, subcategory_id, item_code, item_name, unit, base_price, is_active, category, sub_category, is_sales_item, is_purchase_item) VALUES (1, 1, 'BN-002', '일반현수막 (실외)', 'EA', 6000, 1, '현수막', '일반현수막', 1, 0);
INSERT INTO items (category_id, subcategory_id, item_code, item_name, unit, base_price, is_active, category, sub_category, is_sales_item, is_purchase_item) VALUES (1, 2, 'BN-003', '메쉬현수막', 'EA', 7000, 1, '현수막', '메쉬현수막', 1, 0);
INSERT INTO items (category_id, subcategory_id, item_code, item_name, unit, base_price, is_active, category, sub_category, is_sales_item, is_purchase_item) VALUES (1, 3, 'BN-004', '대형현수막 (5m이상)', 'EA', 10000, 1, '현수막', '대형현수막', 1, 0);
INSERT INTO items (category_id, subcategory_id, item_code, item_name, unit, base_price, is_active, category, sub_category, is_sales_item, is_purchase_item) VALUES (2, 4, 'XB-001', 'X배너 (600x1800)', 'EA', 25000, 1, '배너', 'X배너', 1, 0);
INSERT INTO items (category_id, subcategory_id, item_code, item_name, unit, base_price, is_active, category, sub_category, is_sales_item, is_purchase_item) VALUES (2, 5, 'XB-002', '롤배너 (800x2000)', 'EA', 45000, 1, '배너', '롤배너', 1, 0);
INSERT INTO items (category_id, subcategory_id, item_code, item_name, unit, base_price, is_active, category, sub_category, is_sales_item, is_purchase_item) VALUES (2, 6, 'XB-003', 'Y배너 (600x1600)', 'EA', 30000, 1, '배너', 'Y배너', 1, 0);
INSERT INTO items (category_id, subcategory_id, item_code, item_name, unit, base_price, is_active, category, sub_category, is_sales_item, is_purchase_item) VALUES (3, 7, 'SG-001', '포맥스간판 (3T)', 'EA', 15000, 1, '간판', '포맥스간판', 1, 0);
INSERT INTO items (category_id, subcategory_id, item_code, item_name, unit, base_price, is_active, category, sub_category, is_sales_item, is_purchase_item) VALUES (3, 7, 'SG-002', '포맥스간판 (5T)', 'EA', 20000, 1, '간판', '포맥스간판', 1, 0);
INSERT INTO items (category_id, subcategory_id, item_code, item_name, unit, base_price, is_active, category, sub_category, is_sales_item, is_purchase_item) VALUES (3, 8, 'SG-003', '아크릴간판', 'EA', 35000, 1, '간판', '아크릴간판', 1, 0);
INSERT INTO items (category_id, subcategory_id, item_code, item_name, unit, base_price, is_active, category, sub_category, is_sales_item, is_purchase_item) VALUES (3, 9, 'SG-004', '알루미늄복합판넬', 'EA', 25000, 1, '간판', '알루미늄간판', 1, 0);
INSERT INTO items (category_id, subcategory_id, item_code, item_name, unit, base_price, is_active, category, sub_category, is_sales_item, is_purchase_item) VALUES (4, 10, 'ST-001', '일반스티커 (유광)', 'EA', 3000, 1, '스티커', '일반스티커', 1, 0);
INSERT INTO items (category_id, subcategory_id, item_code, item_name, unit, base_price, is_active, category, sub_category, is_sales_item, is_purchase_item) VALUES (4, 10, 'ST-002', '일반스티커 (무광)', 'EA', 3500, 1, '스티커', '일반스티커', 1, 0);
INSERT INTO items (category_id, subcategory_id, item_code, item_name, unit, base_price, is_active, category, sub_category, is_sales_item, is_purchase_item) VALUES (4, 11, 'ST-003', '투명스티커', 'EA', 5000, 1, '스티커', '투명스티커', 1, 0);
INSERT INTO items (category_id, subcategory_id, item_code, item_name, unit, base_price, is_active, category, sub_category, is_sales_item, is_purchase_item) VALUES (4, 12, 'ST-004', '차량래핑스티커', 'EA', 8000, 1, '스티커', '차량스티커', 1, 0);
INSERT INTO items (category_id, subcategory_id, item_code, item_name, unit, base_price, is_active, category, sub_category, is_sales_item, is_purchase_item) VALUES (5, 13, 'PL-001', '아크릴현판', 'EA', 50000, 1, '현판', '아크릴현판', 1, 0);
INSERT INTO items (category_id, subcategory_id, item_code, item_name, unit, base_price, is_active, category, sub_category, is_sales_item, is_purchase_item) VALUES (5, 14, 'PL-002', '금속현판 (SUS)', 'EA', 80000, 1, '현판', '금속현판', 1, 0);
INSERT INTO items (category_id, subcategory_id, item_code, item_name, unit, base_price, is_active, category, sub_category, is_sales_item, is_purchase_item) VALUES (6, 15, 'ET-001', '명함 (200매)', 'BOX', 15000, 1, '기타', '기타인쇄물', 1, 0);
INSERT INTO items (category_id, subcategory_id, item_code, item_name, unit, base_price, is_active, category, sub_category, is_sales_item, is_purchase_item) VALUES (6, 15, 'ET-002', '전단지 (A4)', 'EA', 100, 1, '기타', '기타인쇄물', 1, 0);
INSERT INTO items (category_id, subcategory_id, item_code, item_name, unit, base_price, is_active, category, sub_category, is_sales_item, is_purchase_item) VALUES (6, 15, 'MT-001', '현수막원단 (13oz)', 'M', 1500, 1, '기타', '기타인쇄물', 0, 1);
INSERT INTO items (category_id, subcategory_id, item_code, item_name, unit, base_price, is_active, category, sub_category, is_sales_item, is_purchase_item) VALUES (6, 15, 'MT-002', '메쉬원단', 'M', 2000, 1, '기타', '기타인쇄물', 0, 1);
INSERT INTO items (category_id, subcategory_id, item_code, item_name, unit, base_price, is_active, category, sub_category, is_sales_item, is_purchase_item) VALUES (6, 15, 'MT-003', '포맥스 3T (1220x2440)', 'EA', 12000, 1, '기타', '기타인쇄물', 0, 1);
INSERT INTO items (category_id, subcategory_id, item_code, item_name, unit, base_price, is_active, category, sub_category, is_sales_item, is_purchase_item) VALUES (6, 15, 'MT-004', '잉크 (C)', 'L', 35000, 1, '기타', '기타인쇄물', 0, 1);

-- ═══════════════════════════════════════
-- 거래처 (clients)
-- ═══════════════════════════════════════
INSERT INTO clients (client_code, client_name, representative, business_type, business_item, phone, mobile, address, is_active, balance) VALUES ('C-001', '행복부동산', '김행복', '서비스업', '부동산중개', '02-1234-5678', '010-1111-2222', '서울시 강남구 역삼동 123-4', 1, 0);
INSERT INTO clients (client_code, client_name, representative, business_type, business_item, phone, mobile, address, is_active, balance) VALUES ('C-002', '맛나식당', '이맛나', '음식점업', '한식', '031-2345-6789', '010-2222-3333', '경기도 수원시 팔달구 인계동 456', 1, 0);
INSERT INTO clients (client_code, client_name, representative, business_type, business_item, phone, mobile, address, is_active, balance) VALUES ('C-003', '대박학원', '박대박', '교육서비스업', '학원', '02-3456-7890', '010-3333-4444', '서울시 송파구 잠실동 789', 1, 0);
INSERT INTO clients (client_code, client_name, representative, business_type, business_item, phone, mobile, address, is_active, balance) VALUES ('C-004', '스마트전자', '최스마트', '제조업', '전자제품', '032-4567-8901', '010-4444-5555', '인천시 남동구 논현동 234', 1, 0);
INSERT INTO clients (client_code, client_name, representative, business_type, business_item, phone, mobile, address, is_active, balance) VALUES ('C-005', '한솔건설', '정한솔', '건설업', '종합건설', '02-5678-9012', '010-5555-6666', '서울시 강서구 마곡동 567', 1, 0);
INSERT INTO clients (client_code, client_name, representative, business_type, business_item, phone, mobile, address, is_active, balance) VALUES ('C-006', '푸른약국', '한푸른', '의료업', '약국', '031-6789-0123', '010-6666-7777', '경기도 성남시 분당구 정자동 890', 1, 0);
INSERT INTO clients (client_code, client_name, representative, business_type, business_item, phone, mobile, address, is_active, balance) VALUES ('C-007', '동산광고기획', '윤동산', '서비스업', '광고대행', '02-7890-1234', '010-7777-8888', '서울시 마포구 서교동 111', 1, 0);
INSERT INTO clients (client_code, client_name, representative, business_type, business_item, phone, mobile, address, is_active, balance) VALUES ('C-008', '시청 행정과', '관공서', '공공기관', '행정', '031-8901-2345', NULL, '경기도 광명시 광명로 222', 1, 0);
INSERT INTO clients (client_code, client_name, representative, business_type, business_item, phone, mobile, address, is_active, balance) VALUES ('C-009', '꽃보다꽃집', '김꽃', '소매업', '화훼', '02-9012-3456', '010-8888-9999', '서울시 종로구 세종로 333', 1, 0);
INSERT INTO clients (client_code, client_name, representative, business_type, business_item, phone, mobile, address, is_active, balance) VALUES ('C-010', '체육관24', '강체육', '서비스업', '체육시설', '031-0123-4567', '010-9999-0000', '경기도 용인시 수지구 죽전동 444', 1, 0);

-- ═══════════════════════════════════════
-- 후가공 옵션 (post_processing_options)
-- ═══════════════════════════════════════
INSERT INTO post_processing_options (option_code, option_name, margin_left, margin_right, margin_top, margin_bottom, additional_cost, description, is_active, pricing_type, unit_price) VALUES ('PP-HEATCUT', '열재단', 0, 0, 0, 0, 0, '열로 재단하여 풀림 방지', 1, 'fixed', 0);
INSERT INTO post_processing_options (option_code, option_name, margin_left, margin_right, margin_top, margin_bottom, additional_cost, description, is_active, pricing_type, unit_price) VALUES ('PP-LAMINATE', '코팅(라미네이팅)', 0, 0, 0, 0, 3000, 'UV 또는 유광/무광 라미네이팅', 1, 'per_sqm', 3000);

-- ═══════════════════════════════════════
-- 직원 (employees) — 실제 데이터는 0117_import_real_employees.sql에서 관리
-- 아래 더미 데이터는 비활성화 (2026-04-11)
-- ═══════════════════════════════════════
