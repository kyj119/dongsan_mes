-- 0358: UV 평판출력 자작나무 — 제품 5(두께별) + 보드자재 5(6/9/12/15/18t)
-- 판재(보드)는 롤 원단과 달라 자동차감(폭매칭·yd) 부적합 → product_materials 미연결.
-- 판재 차감(면적/장수·두께선택)은 별도 모델 필요(보류). 두께=규격(spec), item_group=자작나무(묶음).
-- 제품: UV 평판출력(UV 분류, AREA). 자재: 보드 매입+판매, 단위 '장'.
INSERT INTO items (item_code, item_name, item_type, category, category_id, unit, base_price, sales_price, pricing_method, pricing_profile, is_active, is_sales_item, is_purchase_item, production_required, item_group, specification) VALUES
 ('UV-JJN-06T','UV 자작나무 6t', 'PRODUCT','UV',2,'EA',0,0,'AREA','AREA',1,1,0,1,'자작나무','6t'),
 ('UV-JJN-09T','UV 자작나무 9t', 'PRODUCT','UV',2,'EA',0,0,'AREA','AREA',1,1,0,1,'자작나무','9t'),
 ('UV-JJN-12T','UV 자작나무 12t','PRODUCT','UV',2,'EA',0,0,'AREA','AREA',1,1,0,1,'자작나무','12t'),
 ('UV-JJN-15T','UV 자작나무 15t','PRODUCT','UV',2,'EA',0,0,'AREA','AREA',1,1,0,1,'자작나무','15t'),
 ('UV-JJN-18T','UV 자작나무 18t','PRODUCT','UV',2,'EA',0,0,'AREA','AREA',1,1,0,1,'자작나무','18t');
INSERT INTO items (item_code, item_name, item_type, category, category_id, unit, base_price, sales_price, pricing_method, is_active, is_sales_item, is_purchase_item, production_required, item_group, specification) VALUES
 ('JJN-06T','자작나무','MATERIAL','원자재',5,'장',0,0,'FIXED',1,1,1,0,'자작나무','6t'),
 ('JJN-09T','자작나무','MATERIAL','원자재',5,'장',0,0,'FIXED',1,1,1,0,'자작나무','9t'),
 ('JJN-12T','자작나무','MATERIAL','원자재',5,'장',0,0,'FIXED',1,1,1,0,'자작나무','12t'),
 ('JJN-15T','자작나무','MATERIAL','원자재',5,'장',0,0,'FIXED',1,1,1,0,'자작나무','15t'),
 ('JJN-18T','자작나무','MATERIAL','원자재',5,'장',0,0,'FIXED',1,1,1,0,'자작나무','18t');
