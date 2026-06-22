-- 0350: 시트/그레이시트(솔벤·UV 공용) 제품 4 + 원단 2그룹 등록
--
-- 시트 SPM011G(일반)·SPM022G(그레이)는 솔벤·UV 둘 다 출력 + 같은 롤(공용 재고). 후렉스 패턴.
-- 폭이 겹쳐(105/127/137/152) 자동차감 폭매칭으로 일반/그레이 구분 불가 → 제품을 방식×종류 4개로 분리.
-- 원자재명에 공급코드(SPM011G/SPM022G) 포함. 대분류 솔벤(3)/UV(2). 전폭 차감, dual.

-- 제품 4 (AREA, 판매)
INSERT INTO items (item_code, item_name, item_type, category, category_id, unit, base_price, sales_price, pricing_method, pricing_profile, is_active, is_sales_item, is_purchase_item, production_required) VALUES
 ('SV-SHEET',  '솔벤 시트',     'PRODUCT', '솔벤', 3, 'EA', 0, 0, 'AREA', 'AREA', 1, 1, 0, 1),
 ('UV-SHEET',  'UV 시트',       'PRODUCT', 'UV',   2, 'EA', 0, 0, 'AREA', 'AREA', 1, 1, 0, 1),
 ('SV-SHEETG', '솔벤 그레이시트','PRODUCT', '솔벤', 3, 'EA', 0, 0, 'AREA', 'AREA', 1, 1, 0, 1),
 ('UV-SHEETG', 'UV 그레이시트',  'PRODUCT', 'UV',   2, 'EA', 0, 0, 'AREA', 'AREA', 1, 1, 0, 1);

-- 원단: 일반시트 SPM011G 5폭 (공용, dual)
INSERT INTO items (item_code, item_name, item_type, category, category_id, unit, base_price, sales_price, pricing_method, is_active, is_sales_item, is_purchase_item, production_required, item_group, width_mm, specification) VALUES
 ('SPM011G-090','일반시트 SPM011G','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'일반시트 SPM011G',900, '90cm'),
 ('SPM011G-105','일반시트 SPM011G','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'일반시트 SPM011G',1050,'105cm'),
 ('SPM011G-127','일반시트 SPM011G','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'일반시트 SPM011G',1270,'127cm'),
 ('SPM011G-137','일반시트 SPM011G','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'일반시트 SPM011G',1370,'137cm'),
 ('SPM011G-152','일반시트 SPM011G','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'일반시트 SPM011G',1520,'152cm');

-- 원단: 그레이시트 SPM022G 4폭 (공용, dual, 90 없음)
INSERT INTO items (item_code, item_name, item_type, category, category_id, unit, base_price, sales_price, pricing_method, is_active, is_sales_item, is_purchase_item, production_required, item_group, width_mm, specification) VALUES
 ('SPM022G-105','그레이시트 SPM022G','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'그레이시트 SPM022G',1050,'105cm'),
 ('SPM022G-127','그레이시트 SPM022G','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'그레이시트 SPM022G',1270,'127cm'),
 ('SPM022G-137','그레이시트 SPM022G','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'그레이시트 SPM022G',1370,'137cm'),
 ('SPM022G-152','그레이시트 SPM022G','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'그레이시트 SPM022G',1520,'152cm');

-- 연결: 시트 제품(솔벤·UV)→일반시트, 그레이시트 제품→그레이시트 (공용)
INSERT INTO product_materials (product_item_id, material_item_id, is_default)
SELECT p.id, m.id, 0
FROM items p JOIN items m
  ON ( (p.item_code IN ('SV-SHEET','UV-SHEET')   AND m.item_group='일반시트 SPM011G')
    OR (p.item_code IN ('SV-SHEETG','UV-SHEETG') AND m.item_group='그레이시트 SPM022G') )
WHERE p.item_code IN ('SV-SHEET','UV-SHEET','SV-SHEETG','UV-SHEETG');
