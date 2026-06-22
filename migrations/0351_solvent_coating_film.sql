-- 0351: 코팅지(솔벤 인쇄후 코팅 공정 소비재) 원자재 등록 — SPP031M 무광 / SPP031G 유광
--
-- 출력 매체가 아니라 '코팅 공정' 소비재. 솔벤 인쇄 후에만 코팅(UV 미사용). 시트류에 적용.
-- → product_materials 미연결(자동차감 후보 제외), 매입 전용(is_sales_item=0, 판매 라인 아님).
-- 폭 = 일반시트 SPM011G와 동일(90/105/127/137/152). 원자재(5), yd.
-- 주: 코팅 공정의 코팅지 자동차감은 현 모델(인쇄당 출력매체 1개)에 없음 → 후가공(코팅) 설계 시 별도 구축.

-- 무광코팅지 SPP031M (5폭, 매입전용)
INSERT INTO items (item_code, item_name, item_type, category, category_id, unit, base_price, sales_price, pricing_method, is_active, is_sales_item, is_purchase_item, production_required, item_group, width_mm, specification) VALUES
 ('SPP031M-090','무광코팅지 SPP031M','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,0,1,0,'무광코팅지 SPP031M',900, '90cm'),
 ('SPP031M-105','무광코팅지 SPP031M','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,0,1,0,'무광코팅지 SPP031M',1050,'105cm'),
 ('SPP031M-127','무광코팅지 SPP031M','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,0,1,0,'무광코팅지 SPP031M',1270,'127cm'),
 ('SPP031M-137','무광코팅지 SPP031M','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,0,1,0,'무광코팅지 SPP031M',1370,'137cm'),
 ('SPP031M-152','무광코팅지 SPP031M','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,0,1,0,'무광코팅지 SPP031M',1520,'152cm');

-- 유광코팅지 SPP031G (5폭, 매입전용)
INSERT INTO items (item_code, item_name, item_type, category, category_id, unit, base_price, sales_price, pricing_method, is_active, is_sales_item, is_purchase_item, production_required, item_group, width_mm, specification) VALUES
 ('SPP031G-090','유광코팅지 SPP031G','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,0,1,0,'유광코팅지 SPP031G',900, '90cm'),
 ('SPP031G-105','유광코팅지 SPP031G','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,0,1,0,'유광코팅지 SPP031G',1050,'105cm'),
 ('SPP031G-127','유광코팅지 SPP031G','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,0,1,0,'유광코팅지 SPP031G',1270,'127cm'),
 ('SPP031G-137','유광코팅지 SPP031G','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,0,1,0,'유광코팅지 SPP031G',1370,'137cm'),
 ('SPP031G-152','유광코팅지 SPP031G','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,0,1,0,'유광코팅지 SPP031G',1520,'152cm');
