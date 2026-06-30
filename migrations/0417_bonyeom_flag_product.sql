-- 0417: 정기 본염(本染) 깃발 — 자수·나염과 다른 공정(본염). 태극기 분류, 기존 깃발 패턴(PRODUCT·FIXED·매입+판매 외주·생산·ROLL·차감없음). 단가 보류.
-- SET(본염 삼발이/원형)은 "깃발제품 + 부속(삼발이 ACC) 라인"으로 처리(완제품 SKU 아님, 사용자 확정). 태극기/근조 본염은 데이터 확인 후 후속.
INSERT INTO items (item_code,item_name,item_type,category,category_id,unit,base_price,sales_price,pricing_method,is_active,is_sales_item,is_purchase_item,production_required,deduction_method,sub_category,item_group,specification) VALUES
 ('JG-BONYEOM','정기 본염 깃발','PRODUCT','태극기',10,'EA',0,0,'FIXED',1,1,1,1,'ROLL','태극기','본염','135×90·120×80');
