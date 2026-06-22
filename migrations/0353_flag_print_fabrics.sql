-- 0353: 직접출력 깃발 원단 등록 — 폰지/샤틴/매쉬 (직접출력 제품은 보류, 원단만 선등록)
-- 깃발·어구실명제·만장기 직접출력에 사용. dual 매입+판매, 원자재, 폭별, yd.
INSERT INTO items (item_code, item_name, item_type, category, category_id, unit, base_price, sales_price, pricing_method, is_active, is_sales_item, is_purchase_item, production_required, item_group, width_mm, specification) VALUES
 ('PONGE-085','폰지','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'폰지',850, '85cm'),
 ('PONGE-095','폰지','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'폰지',950, '95cm'),
 ('PONGE-130','폰지','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'폰지',1300,'130cm'),
 ('PONGE-150','폰지','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'폰지',1500,'150cm'),
 ('PONGE-180','폰지','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'폰지',1800,'180cm'),
 ('SATIN-155','샤틴','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'샤틴',1550,'155cm'),
 ('MESH-127','매쉬','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'매쉬',1270,'127cm'),
 ('MESH-160','매쉬','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'매쉬',1600,'160cm');
