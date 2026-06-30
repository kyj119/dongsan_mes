-- 0416: 깃발 제품 — 태극기 수기(나염 손깃발) + 자수 깃발(정기/태극기정기/근조기). 기존 태극기 호수 깃발 패턴 정합.
-- PRODUCT·태극기 분류(id10)·FIXED·매입+판매(외주)·생산·ROLL(차감없음=원단링크 없음, 기존 33종과 동일). 단가 보류.
-- 수기=호수없음·규격이 변종축(30×20 압도). 자수=외주 별도공정·기종별 SKU.
-- ★SET(수기대조립·자수삼발이SET)은 "깃발 제품 + 부속(ACC) 라인"으로 처리(완제품 SKU 아님) → 깃발 수량 이중계상 방지. 깃대조립SET=기존 호수깃발+깃대.
INSERT INTO items (item_code,item_name,item_type,category,category_id,unit,base_price,sales_price,pricing_method,is_active,is_sales_item,is_purchase_item,production_required,deduction_method,sub_category,item_group,specification) VALUES
 ('TGK-SG30','태극기 수기 30×20','PRODUCT','태극기',10,'EA',0,0,'FIXED',1,1,1,1,'ROLL','태극기','수기','30×20'),
 ('TGK-SG45','태극기 수기 45×30','PRODUCT','태극기',10,'EA',0,0,'FIXED',1,1,1,1,'ROLL','태극기','수기','45×30'),
 ('JG-JASU','정기 자수 깃발','PRODUCT','태극기',10,'EA',0,0,'FIXED',1,1,1,1,'ROLL','태극기','자수','135×90·120×80'),
 ('TGK-JASU','태극기 정기자수 깃발','PRODUCT','태극기',10,'EA',0,0,'FIXED',1,1,1,1,'ROLL','태극기','자수','135×90·120×80'),
 ('GJG-JASU','근조기 자수 깃발','PRODUCT','태극기',10,'EA',0,0,'FIXED',1,1,1,1,'ROLL','태극기','자수','80×115·110×75');
