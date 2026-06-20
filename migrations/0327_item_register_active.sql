-- 0327: 활성 판매제품 1차 등록 (수정본 298 중 PRODUCT & 주문 6개월 1회+)
-- 기준: 죽은품목(0회)·자재·상품·이름확인·간판자재 = 보류(별도 검토). 명백 판매제품만.
-- 0325와 동일 코드·pricing. is_active=0 staged(라이브 미노출). category_id=NAME 서브쿼리.
-- 비파괴: item_code NOT EXISTS. 변종(두께/호수)·소재흡수는 후속.

INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0001','현수막','PRODUCT',(SELECT id FROM item_categories WHERE category_name='현수막'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0001');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0002','현수막외','PRODUCT',(SELECT id FROM item_categories WHERE category_name='현수막'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0002');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0003','좌우보필형','PRODUCT',(SELECT id FROM item_categories WHERE category_name='현수막'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0003');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0004','저밀도 게릴라 현수막','PRODUCT',(SELECT id FROM item_categories WHERE category_name='현수막'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0004');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0005','현수막 외 추가분','PRODUCT',(SELECT id FROM item_categories WHERE category_name='현수막'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0005');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0008','가로등배너','PRODUCT',(SELECT id FROM item_categories WHERE category_name='배너'),'FIXED','FIXED',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0008');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0010','패트배너','PRODUCT',(SELECT id FROM item_categories WHERE category_name='배너'),'FIXED','FIXED',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0010');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0011','배너대','PRODUCT',(SELECT id FROM item_categories WHERE category_name='배너'),'FIXED','FIXED',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0011');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0014','자이언트배너','PRODUCT',(SELECT id FROM item_categories WHERE category_name='배너'),'FIXED','FIXED',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0014');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0017','양면배너','PRODUCT',(SELECT id FROM item_categories WHERE category_name='배너'),'FIXED','FIXED',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0017');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0021','워킹배너','PRODUCT',(SELECT id FROM item_categories WHERE category_name='배너'),'FIXED','FIXED',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0021');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0023','윈드배너','PRODUCT',(SELECT id FROM item_categories WHERE category_name='배너'),'FIXED','FIXED',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0023');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0024','외국기배너','PRODUCT',(SELECT id FROM item_categories WHERE category_name='배너'),'FIXED','FIXED',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0024');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0027','윈드배너 스파이크','PRODUCT',(SELECT id FROM item_categories WHERE category_name='배너'),'FIXED','FIXED',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0027');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0028','윈드배너 부품','PRODUCT',(SELECT id FROM item_categories WHERE category_name='배너'),'FIXED','FIXED',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0028');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0029','윈드배너 폴세트','PRODUCT',(SELECT id FROM item_categories WHERE category_name='배너'),'FIXED','FIXED',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0029');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0030','윈드배너 크로스','PRODUCT',(SELECT id FROM item_categories WHERE category_name='배너'),'FIXED','FIXED',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0030');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0032','미니배너','PRODUCT',(SELECT id FROM item_categories WHERE category_name='배너'),'FIXED','FIXED',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0032');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0033','태극기','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0033');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0034','태극기 수기대','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0034');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0037','대형태극기','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0037');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0039','새마을기','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0039');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0042','태극기 특호','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0042');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0043','태극기 수기','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0043');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0044','노인회기','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0044');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0045','태극기 배너','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0045');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0046','태극기배너','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0046');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0048','만국기','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0048');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0049','만장기','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0049');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0050','민방위기','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0050');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0051','청사초롱','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0051');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0052','어구실명제','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0052');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0055','특호기','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0055');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0058','태극기 정기본염원형 SET','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0058');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0059','정기 자수 원형 SET','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0059');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0060','무재해기','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0060');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0064','수기대','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0064');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0065','근조기깃발만','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0065');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0068','영구용태극기','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0068');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0069','채널간판','PRODUCT',(SELECT id FROM item_categories WHERE category_name='간판'),'FIXED','COMPONENT',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0069');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0070','프레임간판','PRODUCT',(SELECT id FROM item_categories WHERE category_name='간판'),'FIXED','COMPONENT',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0070');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0072','채널간판 외 사인물','PRODUCT',(SELECT id FROM item_categories WHERE category_name='간판'),'FIXED','COMPONENT',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0072');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0073','장충동 왕 족발 간판','PRODUCT',(SELECT id FROM item_categories WHERE category_name='간판'),'FIXED','COMPONENT',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0073');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0078','돌출간판','PRODUCT',(SELECT id FROM item_categories WHERE category_name='간판'),'FIXED','COMPONENT',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0078');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0084','채널 보강대','PRODUCT',(SELECT id FROM item_categories WHERE category_name='간판'),'FIXED','COMPONENT',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0084');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0088','바형 채널간판','PRODUCT',(SELECT id FROM item_categories WHERE category_name='간판'),'FIXED','COMPONENT',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0088');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0093','라면카페 사인교체','PRODUCT',(SELECT id FROM item_categories WHERE category_name='간판'),'FIXED','COMPONENT',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0093');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0101','스텐원형돌출간판','PRODUCT',(SELECT id FROM item_categories WHERE category_name='간판'),'FIXED','COMPONENT',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0101');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0107','그레이시트','PRODUCT',(SELECT id FROM item_categories WHERE category_name='시트·스티커'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0107');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0108','랩핑시트','PRODUCT',(SELECT id FROM item_categories WHERE category_name='시트·스티커'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0108');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0109','조명시트','PRODUCT',(SELECT id FROM item_categories WHERE category_name='시트·스티커'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0109');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0110','그레이후렉스','PRODUCT',(SELECT id FROM item_categories WHERE category_name='시트·스티커'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0110');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0112','합성지 그레이','PRODUCT',(SELECT id FROM item_categories WHERE category_name='시트·스티커'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0112');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0115','시트컷팅','PRODUCT',(SELECT id FROM item_categories WHERE category_name='시트·스티커'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0115');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0118','타공시트','PRODUCT',(SELECT id FROM item_categories WHERE category_name='시트·스티커'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0118');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0119','조도향상시트','PRODUCT',(SELECT id FROM item_categories WHERE category_name='시트·스티커'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0119');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0123','자석시트','PRODUCT',(SELECT id FROM item_categories WHERE category_name='시트·스티커'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0123');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0124','그레이켈','PRODUCT',(SELECT id FROM item_categories WHERE category_name='시트·스티커'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0124');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0125','조도향상시트외','PRODUCT',(SELECT id FROM item_categories WHERE category_name='시트·스티커'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0125');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0133','포맥스 출력','PRODUCT',(SELECT id FROM item_categories WHERE category_name='판재출력'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0133');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0155','후렉스','PRODUCT',(SELECT id FROM item_categories WHERE category_name='출력물'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0155');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0156','조명용 후렉스','PRODUCT',(SELECT id FROM item_categories WHERE category_name='출력물'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0156');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0158','양면후렉스','PRODUCT',(SELECT id FROM item_categories WHERE category_name='출력물'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0158');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0159','비조명용 후렉스','PRODUCT',(SELECT id FROM item_categories WHERE category_name='출력물'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0159');
