-- 0415: 현수막/후가공 부속 GOODS 6종 (부속 단독 유통 판매 발생 — 사용자 확정). 상품 분류 category_id=4, 매입+판매, 생산X, 단가 보류.
-- item_group='현수막 부속품'(게양·배너 부속과 도메인 구분). 아일렛=링/소모품(후가공 '하도매' 서비스와 별개 판매). 족자봉·삼각접착고리=앞서 배너부속서 제외했던 현수막 걸이.
INSERT INTO items (item_code,item_name,item_type,category,category_id,unit,base_price,sales_price,pricing_method,is_active,is_sales_item,is_purchase_item,production_required,item_group,specification) VALUES
 ('ACC-045','아일렛','GOODS','상품',4,'EA',0,0,'FIXED',1,1,1,0,'현수막 부속품','5/9/24호·은/금'),
 ('ACC-046','인치밴드','GOODS','상품',4,'EA',0,0,'FIXED',1,1,1,0,'현수막 부속품','4~13인치'),
 ('ACC-047','큐방','GOODS','상품',4,'EA',0,0,'FIXED',1,1,1,0,'현수막 부속품','원터치/압축·40파이'),
 ('ACC-048','쌍클립','GOODS','상품',4,'EA',0,0,'FIXED',1,1,1,0,'현수막 부속품','200개입'),
 ('ACC-049','족자봉','GOODS','상품',4,'EA',0,0,'FIXED',1,1,1,0,'현수막 부속품','사각/원형·85~150cm'),
 ('ACC-050','삼각접착고리','GOODS','상품',4,'EA',0,0,'FIXED',1,1,1,0,'현수막 부속품','판형·무펀치/12파이');
