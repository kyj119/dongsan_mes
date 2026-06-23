-- 0377: 수성 어깨띠 — 부직포에 수성출력. 원단 부직포 5폭(60/90/127/152/180, 50m) + 제품 1(수성 어깨띠). 머리띠 보류(용준님 확인 후).
-- 어깨띠=부직포 수성출력(10~15cm로 좁게 재단). 폭매칭 ROLL(출력폭→부직포 최소폭). 소분류 '어깨띠' 신설(후가공 미연결). 단가 보류(0). (idempotent)

-- 소분류 '어깨띠' 신설
INSERT INTO pp_applicable_subcategories (group_name, subcat_name, sort_order, is_active)
SELECT '실사출력','어깨띠',25,1 WHERE NOT EXISTS (SELECT 1 FROM pp_applicable_subcategories WHERE subcat_name='어깨띠' AND group_name='실사출력');

-- 부직포 원단 5폭 (매입+판매 dual, yd, ROLL, 폭매칭). spec=폭+롤길이(50m)
INSERT OR IGNORE INTO items (item_code, item_name, item_type, category, category_id, unit, base_price, sales_price, pricing_method, is_active, is_sales_item, is_purchase_item, production_required, item_group, width_mm, specification, deduction_method) VALUES
 ('BUJIK-060','부직포','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'부직포',600, '60cm 50m','ROLL'),
 ('BUJIK-090','부직포','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'부직포',900, '90cm 50m','ROLL'),
 ('BUJIK-127','부직포','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'부직포',1270,'127cm 50m','ROLL'),
 ('BUJIK-152','부직포','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'부직포',1520,'152cm 50m','ROLL'),
 ('BUJIK-180','부직포','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'부직포',1800,'180cm 50m','ROLL');

-- 제품: 수성 어깨띠 (수성, AREA, 자체출력)
INSERT OR IGNORE INTO items (item_code, item_name, item_type, category, category_id, unit, base_price, sales_price, pricing_method, pricing_profile, is_active, is_sales_item, is_purchase_item, production_required, sub_category)
VALUES ('AQ-SASH','수성 어깨띠','PRODUCT','수성',(SELECT id FROM item_categories WHERE category_code='AQUEOUS'),'EA',0,0,'AREA','AREA',1,1,0,1,'어깨띠');

-- 연결: 수성 어깨띠 → 부직포 전폭 (폭매칭은 autoDeduct가 출력폭 이상 최소폭 선택)
INSERT INTO product_materials (product_item_id, material_item_id, is_default)
SELECT p.id, m.id, 0
FROM items p JOIN items m ON (m.item_type='MATERIAL' AND m.item_group='부직포')
WHERE p.item_code='AQ-SASH'
  AND NOT EXISTS (SELECT 1 FROM product_materials x WHERE x.product_item_id=p.id AND x.material_item_id=m.id);
