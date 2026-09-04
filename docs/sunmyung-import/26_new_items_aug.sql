-- 선명 8월 이관에서 계열에 없어 신설한 품목 3종 (2026-09-04)
-- 신설 전 계열 전수 조회함: 코팅지 30종 / 조명시트 8종 / 윈드배너 5종 확인 후 없는 것만.
-- 무광 보급형 HJ-MGAUTOB(61m/120g) 와 대칭. 기존 유광은 45m/120g(HJ-YGAUTO) 만 있었다
INSERT INTO items (item_code, item_name, item_type, category_id, unit, base_unit, pack_size, pricing_method, is_sales_item, is_purchase_item, is_active) SELECT 'HJ-YGAUTOB', '유광코팅지 자동 보급형(61m/120g)', 'GOODS', 4, 'EA', NULL, NULL, 'FIXED', 1, 1, 1 WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code = 'HJ-YGAUTOB');
-- LT4071M·LT4080M·LT4510 과 같은 조명시트 롤 계열
INSERT INTO items (item_code, item_name, item_type, category_id, unit, base_unit, pack_size, pricing_method, is_sales_item, is_purchase_item, is_active) SELECT 'LT4070M', '조명시트 LT4070M', 'MATERIAL', 5, '롤', 'M', 50, 'FIXED', 1, 1, 1 WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code = 'LT4070M');
-- ACC-016 윈드배너 부품(크로스/베이스) 계열의 사각베이스형
INSERT INTO items (item_code, item_name, item_type, category_id, unit, base_unit, pack_size, pricing_method, is_sales_item, is_purchase_item, is_active) SELECT 'ACC-016-SQ-L', '윈드배너 사각베이스 SET(대)', 'GOODS', 4, 'EA', NULL, NULL, 'FIXED', 1, 1, 1 WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code = 'ACC-016-SQ-L');

-- 선명 8월 품목 연결 4차 - 아크릴 가공 신설 + 가공 서비스 (2026-09-04)
--
-- ★아크릴 라인 8건은 자재 판매가 아니라 **가공 작업**이다:
--   전부 q=1 EA · 규격 없음 · 내용=현장명(자연공방·머물다·영우회계법인…),
--   두께가 한 라인에 둘씩(8T/15T · 3T/5T) 들어 있다.
--   기존 UV-ACR-*T-* 는 'UV 인쇄된 아크릴판'이라 축이 다르고, 두께 조합은 폭발하는 축이다
--   -> 품목 축 원칙대로 정체성(아크릴 가공)만 품목으로, 두께는 item_name 원문에 남긴다.
INSERT INTO items (item_code, item_name, item_type, category_id, unit, pricing_method, is_sales_item, is_purchase_item, is_active) SELECT 'SIGN-ACR-FAB', '아크릴 가공(레이져/도색)', 'PRODUCT', 14, 'EA', 'FIXED', 1, 0, 1 WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code = 'SIGN-ACR-FAB');
