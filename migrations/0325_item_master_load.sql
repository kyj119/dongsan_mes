-- 0325: 품목 표준 마스터 1차 로드 (P1b)
-- 원본: 표준품목_등록구조_수정본.xlsx (298행 중 1차 231행, 간판52·이름확인15 제외)
-- 비파괴: item_code NOT EXISTS 가드 / category_id=대분류 NAME 서브쿼리(env id 무관)
-- 겸업 14쌍: 원판(MATERIAL)+출력(PRODUCT) 2행 + product_materials 링크. 재고=원판 단일출처
-- production_required: PRODUCT=1(제작)·MATERIAL/GOODS=0. ⚠️기성 PRODUCT(배너대 등) 후속 토글 검토
-- ★is_active=0 (스테이징): picker(items.ts:88 is_active=1 필터)에 노출 안 됨. 라이브 무오염.
--   활성화(is_active=1)는 P1c(기존103 dedup·매핑·단가) 후 go-live 단계에서 일괄.

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
SELECT 'P-0006','현수막 장폭','PRODUCT',(SELECT id FROM item_categories WHERE category_name='현수막'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0006');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0007','현수막 폭','PRODUCT',(SELECT id FROM item_categories WHERE category_name='현수막'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0007');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0008','가로등배너','PRODUCT',(SELECT id FROM item_categories WHERE category_name='배너'),'FIXED','FIXED',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0008');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0009','배너대 조당','PRODUCT',(SELECT id FROM item_categories WHERE category_name='배너'),'FIXED','FIXED',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0009');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0010','패트배너','PRODUCT',(SELECT id FROM item_categories WHERE category_name='배너'),'FIXED','FIXED',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0010');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0011','배너대','PRODUCT',(SELECT id FROM item_categories WHERE category_name='배너'),'FIXED','FIXED',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0011');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0012','윈드배너 S형','PRODUCT',(SELECT id FROM item_categories WHERE category_name='배너'),'FIXED','FIXED',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0012');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0014','자이언트배너','PRODUCT',(SELECT id FROM item_categories WHERE category_name='배너'),'FIXED','FIXED',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0014');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0015','실내배너 일자형 W','PRODUCT',(SELECT id FROM item_categories WHERE category_name='배너'),'FIXED','FIXED',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0015');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0017','양면배너','PRODUCT',(SELECT id FROM item_categories WHERE category_name='배너'),'FIXED','FIXED',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0017');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0018','자이언트트라이폴M','PRODUCT',(SELECT id FROM item_categories WHERE category_name='배너'),'FIXED','FIXED',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0018');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0019','실내배너 W','PRODUCT',(SELECT id FROM item_categories WHERE category_name='배너'),'FIXED','FIXED',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0019');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0020','패트배너 나투라','PRODUCT',(SELECT id FROM item_categories WHERE category_name='배너'),'FIXED','FIXED',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0020');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0021','워킹배너','PRODUCT',(SELECT id FROM item_categories WHERE category_name='배너'),'FIXED','FIXED',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0021');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0022','윈드배너 F형','PRODUCT',(SELECT id FROM item_categories WHERE category_name='배너'),'FIXED','FIXED',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0022');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0023','윈드배너','PRODUCT',(SELECT id FROM item_categories WHERE category_name='배너'),'FIXED','FIXED',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0023');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0024','외국기배너','PRODUCT',(SELECT id FROM item_categories WHERE category_name='배너'),'FIXED','FIXED',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0024');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0025','실내용 철제배너 T','PRODUCT',(SELECT id FROM item_categories WHERE category_name='배너'),'FIXED','FIXED',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0025');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0026','실외용 철제배너 TSO 브랏켓형','PRODUCT',(SELECT id FROM item_categories WHERE category_name='배너'),'FIXED','FIXED',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0026');
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
SELECT 'P-0031','패트 WAY','PRODUCT',(SELECT id FROM item_categories WHERE category_name='배너'),'FIXED','FIXED',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0031');
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
SELECT 'P-0036','태극기 구게양용','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0036');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0037','대형태극기','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0037');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0038','태극기 가정용 함세트 보급형','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0038');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0039','새마을기','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0039');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0040','태극기회 외 건','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0040');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0041','태극기 가정용 지관 세트','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0041');
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
SELECT 'P-0047','정기본염 깃발만','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0047');
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
SELECT 'P-0053','새마을기 게양용','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0053');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0054','태극기 가정용 함세트 중급형','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0054');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0055','특호기','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0055');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0057','무재해기 게양용','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0057');
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
SELECT 'P-0061','수기대 SET','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0061');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0062','태극기 정기자수 깃발만','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0062');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0063','태극기 게양용','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0063');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0064','수기대','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0064');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0065','근조기깃발만','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0065');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0066','깃발 정기자수','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0066');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0067','태극기 정기본염 깃발만','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0067');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0068','영구용태극기','PRODUCT',(SELECT id FROM item_categories WHERE category_name='깃발·기'),'FIXED','GRADE',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0068');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'M-0003','자작나무 원판','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'FIXED','FIXED',0,1,0,'장',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='M-0003');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0077','자작나무 출력','PRODUCT',(SELECT id FROM item_categories WHERE category_name='판재출력'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0077');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'M-0009','원형나무 원판','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'FIXED','FIXED',0,1,0,'장',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='M-0009');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0092','원형나무 출력','PRODUCT',(SELECT id FROM item_categories WHERE category_name='판재출력'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0092');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'M-0017','광학산PC 원판','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'FIXED','FIXED',0,1,0,'장',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='M-0017');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0102','광학산PC 출력','PRODUCT',(SELECT id FROM item_categories WHERE category_name='판재출력'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0102');
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
SELECT 'P-0111','시트 돔보','PRODUCT',(SELECT id FROM item_categories WHERE category_name='시트·스티커'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0111');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0112','합성지 그레이','PRODUCT',(SELECT id FROM item_categories WHERE category_name='시트·스티커'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0112');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0113','PVC 켈 그레이','PRODUCT',(SELECT id FROM item_categories WHERE category_name='시트·스티커'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0113');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0114','광학산PC 컷팅','PRODUCT',(SELECT id FROM item_categories WHERE category_name='시트·스티커'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0114');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0115','시트컷팅','PRODUCT',(SELECT id FROM item_categories WHERE category_name='시트·스티커'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0115');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0116','고무자석시트 시트','PRODUCT',(SELECT id FROM item_categories WHERE category_name='시트·스티커'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0116');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0117','시트 WAY','PRODUCT',(SELECT id FROM item_categories WHERE category_name='시트·스티커'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0117');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0118','타공시트','PRODUCT',(SELECT id FROM item_categories WHERE category_name='시트·스티커'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0118');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0119','조도향상시트','PRODUCT',(SELECT id FROM item_categories WHERE category_name='시트·스티커'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0119');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0120','엠보시트 WAY','PRODUCT',(SELECT id FROM item_categories WHERE category_name='시트·스티커'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0120');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0121','조명시트 캘','PRODUCT',(SELECT id FROM item_categories WHERE category_name='시트·스티커'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0121');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0122','시트 C','PRODUCT',(SELECT id FROM item_categories WHERE category_name='시트·스티커'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0122');
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
SELECT 'P-0126','시트 유광','PRODUCT',(SELECT id FROM item_categories WHERE category_name='시트·스티커'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0126');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0127','엠보시트 C','PRODUCT',(SELECT id FROM item_categories WHERE category_name='시트·스티커'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0127');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0128','그레이시트 돔보','PRODUCT',(SELECT id FROM item_categories WHERE category_name='시트·스티커'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0128');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0129','랩핑시트 돔보','PRODUCT',(SELECT id FROM item_categories WHERE category_name='시트·스티커'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0129');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0130','켈 돔보','PRODUCT',(SELECT id FROM item_categories WHERE category_name='시트·스티커'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0130');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0131','무광시트W C','PRODUCT',(SELECT id FROM item_categories WHERE category_name='시트·스티커'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0131');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0132','조명시트 돔보','PRODUCT',(SELECT id FROM item_categories WHERE category_name='시트·스티커'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0132');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'M-0019','포맥스 원판','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'FIXED','FIXED',0,1,0,'장',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='M-0019');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0133','포맥스 출력','PRODUCT',(SELECT id FROM item_categories WHERE category_name='판재출력'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0133');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'M-0020','폼보드 원판','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'FIXED','FIXED',0,1,0,'장',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='M-0020');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0134','폼보드 출력','PRODUCT',(SELECT id FROM item_categories WHERE category_name='판재출력'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0134');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'M-0021','아크릴 원판','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'FIXED','FIXED',0,1,0,'장',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='M-0021');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0135','아크릴 출력','PRODUCT',(SELECT id FROM item_categories WHERE category_name='판재출력'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0135');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'M-0022','포맥스 평판 원판','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'FIXED','FIXED',0,1,0,'장',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='M-0022');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0136','포맥스 평판 출력','PRODUCT',(SELECT id FROM item_categories WHERE category_name='판재출력'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0136');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0137','포맥스 개인명패','PRODUCT',(SELECT id FROM item_categories WHERE category_name='판재출력'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0137');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0138','포맥스 버킷 칸막이','PRODUCT',(SELECT id FROM item_categories WHERE category_name='판재출력'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0138');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0139','아크릴 큐브박스','PRODUCT',(SELECT id FROM item_categories WHERE category_name='판재출력'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0139');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'M-0023','포맥스 중국산 원판','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'FIXED','FIXED',0,1,0,'장',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='M-0023');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0140','포맥스 중국산 출력','PRODUCT',(SELECT id FROM item_categories WHERE category_name='판재출력'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0140');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'M-0024','평판 포맥스 원판','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'FIXED','FIXED',0,1,0,'장',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='M-0024');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0141','평판 포맥스 출력','PRODUCT',(SELECT id FROM item_categories WHERE category_name='판재출력'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0141');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0142','아크릴 시트부착','PRODUCT',(SELECT id FROM item_categories WHERE category_name='판재출력'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0142');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'M-0025','스카시 포맥스 원판','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'FIXED','FIXED',0,1,0,'장',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='M-0025');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0143','스카시 포맥스 출력','PRODUCT',(SELECT id FROM item_categories WHERE category_name='판재출력'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0143');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0144','포맥스 행잉명패','PRODUCT',(SELECT id FROM item_categories WHERE category_name='판재출력'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0144');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'M-0026','아크릴 무광 원판','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'FIXED','FIXED',0,1,0,'장',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='M-0026');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0145','아크릴 무광 출력','PRODUCT',(SELECT id FROM item_categories WHERE category_name='판재출력'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0145');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0146','아크릴 배면','PRODUCT',(SELECT id FROM item_categories WHERE category_name='판재출력'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0146');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'M-0027','시트 포맥스t 원판','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'FIXED','FIXED',0,1,0,'장',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='M-0027');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0147','시트 포맥스t 출력','PRODUCT',(SELECT id FROM item_categories WHERE category_name='판재출력'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0147');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0148','아크릴 T레이져','PRODUCT',(SELECT id FROM item_categories WHERE category_name='판재출력'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0148');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'M-0028','아크릴 평판 원판','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'FIXED','FIXED',0,1,0,'장',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='M-0028');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0149','아크릴 평판 출력','PRODUCT',(SELECT id FROM item_categories WHERE category_name='판재출력'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0149');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0150','아크릴 레이져','PRODUCT',(SELECT id FROM item_categories WHERE category_name='판재출력'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0150');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'M-0029','시트 포맥스 원판','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'FIXED','FIXED',0,1,0,'장',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='M-0029');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0151','시트 포맥스 출력','PRODUCT',(SELECT id FROM item_categories WHERE category_name='판재출력'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0151');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0152','포맥스 실사부착','PRODUCT',(SELECT id FROM item_categories WHERE category_name='판재출력'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0152');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0153','클리어필름 WAY 평판장비','PRODUCT',(SELECT id FROM item_categories WHERE category_name='판재출력'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0153');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0154','포맥스 부착명패','PRODUCT',(SELECT id FROM item_categories WHERE category_name='판재출력'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0154');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0155','후렉스','PRODUCT',(SELECT id FROM item_categories WHERE category_name='출력물'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0155');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0156','조명용 후렉스','PRODUCT',(SELECT id FROM item_categories WHERE category_name='출력물'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0156');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0157','후렉스 고주파','PRODUCT',(SELECT id FROM item_categories WHERE category_name='출력물'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0157');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0158','양면후렉스','PRODUCT',(SELECT id FROM item_categories WHERE category_name='출력물'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0158');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'P-0159','비조명용 후렉스','PRODUCT',(SELECT id FROM item_categories WHERE category_name='출력물'),'AREA','AREA',1,0,1,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='P-0159');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'G-0001','태극기 깃대 SET','GOODS',(SELECT id FROM item_categories WHERE category_name='부속품'),'FIXED','FIXED',1,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='G-0001');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'G-0002','정기 자수 삼발이 SET','GOODS',(SELECT id FROM item_categories WHERE category_name='부속품'),'FIXED','FIXED',1,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='G-0002');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'G-0003','가로기 깃대','GOODS',(SELECT id FROM item_categories WHERE category_name='부속품'),'FIXED','FIXED',1,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='G-0003');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'G-0004','P 단 깃대','GOODS',(SELECT id FROM item_categories WHERE category_name='부속품'),'FIXED','FIXED',1,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='G-0004');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'G-0005','가로깃대','GOODS',(SELECT id FROM item_categories WHERE category_name='부속품'),'FIXED','FIXED',1,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='G-0005');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'G-0006','태극기 정기자수삼발이 SET','GOODS',(SELECT id FROM item_categories WHERE category_name='부속품'),'FIXED','FIXED',1,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='G-0006');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'G-0007','가로기깃대','GOODS',(SELECT id FROM item_categories WHERE category_name='부속품'),'FIXED','FIXED',1,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='G-0007');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'G-0008','깃대 차량용','GOODS',(SELECT id FROM item_categories WHERE category_name='부속품'),'FIXED','FIXED',1,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='G-0008');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'G-0009','실외배너 물통SET 복배너','GOODS',(SELECT id FROM item_categories WHERE category_name='부속품'),'FIXED','FIXED',1,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='G-0009');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'G-0010','까치발','GOODS',(SELECT id FROM item_categories WHERE category_name='부속품'),'FIXED','FIXED',1,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='G-0010');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'G-0011','태극기 정기본염삼발이 SET','GOODS',(SELECT id FROM item_categories WHERE category_name='부속품'),'FIXED','FIXED',1,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='G-0011');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'G-0012','R 단 깃대','GOODS',(SELECT id FROM item_categories WHERE category_name='부속품'),'FIXED','FIXED',1,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='G-0012');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'G-0013','mm볼로프','GOODS',(SELECT id FROM item_categories WHERE category_name='부속품'),'FIXED','FIXED',1,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='G-0013');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'G-0014','목재깃대','GOODS',(SELECT id FROM item_categories WHERE category_name='부속품'),'FIXED','FIXED',1,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='G-0014');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'G-0015','어깨띠','GOODS',(SELECT id FROM item_categories WHERE category_name='부속품'),'FIXED','FIXED',1,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='G-0015');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'G-0016','삼발이받침대','GOODS',(SELECT id FROM item_categories WHERE category_name='부속품'),'FIXED','FIXED',1,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='G-0016');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'G-0017','근조기 자수 삼발이 SET','GOODS',(SELECT id FROM item_categories WHERE category_name='부속품'),'FIXED','FIXED',1,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='G-0017');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'G-0018','깃대 가로기 R','GOODS',(SELECT id FROM item_categories WHERE category_name='부속품'),'FIXED','FIXED',1,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='G-0018');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'G-0019','국기함','GOODS',(SELECT id FROM item_categories WHERE category_name='부속품'),'FIXED','FIXED',1,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='G-0019');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'G-0020','머리띠','GOODS',(SELECT id FROM item_categories WHERE category_name='부속품'),'FIXED','FIXED',1,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='G-0020');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'G-0021','R 꽂이 ㄷ자','GOODS',(SELECT id FROM item_categories WHERE category_name='부속품'),'FIXED','FIXED',1,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='G-0021');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'G-0022','국기봉 반용 색','GOODS',(SELECT id FROM item_categories WHERE category_name='부속품'),'FIXED','FIXED',1,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='G-0022');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'G-0023','민방위 깃대','GOODS',(SELECT id FROM item_categories WHERE category_name='부속품'),'FIXED','FIXED',1,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='G-0023');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'G-0024','태극기 차량용깃대','GOODS',(SELECT id FROM item_categories WHERE category_name='부속품'),'FIXED','FIXED',1,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='G-0024');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'G-0025','새마을기 깃대','GOODS',(SELECT id FROM item_categories WHERE category_name='부속품'),'FIXED','FIXED',1,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='G-0025');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'G-0026','인치밴드','GOODS',(SELECT id FROM item_categories WHERE category_name='부속품'),'FIXED','FIXED',1,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='G-0026');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'G-0027','하도매','GOODS',(SELECT id FROM item_categories WHERE category_name='부속품'),'FIXED','FIXED',1,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='G-0027');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'G-0028','대대기','GOODS',(SELECT id FROM item_categories WHERE category_name='부속품'),'FIXED','FIXED',1,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='G-0028');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'G-0029','윈드배너 물통','GOODS',(SELECT id FROM item_categories WHERE category_name='부속품'),'FIXED','FIXED',1,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='G-0029');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'G-0030','철제배너 브랏켓형 물통SET TSO','GOODS',(SELECT id FROM item_categories WHERE category_name='부속품'),'FIXED','FIXED',1,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='G-0030');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'G-0031','P 꽂이','GOODS',(SELECT id FROM item_categories WHERE category_name='부속품'),'FIXED','FIXED',1,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='G-0031');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'G-0032','깃발 정기본염삼발이 SET','GOODS',(SELECT id FROM item_categories WHERE category_name='부속품'),'FIXED','FIXED',1,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='G-0032');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'G-0033','차량용깃대 봉','GOODS',(SELECT id FROM item_categories WHERE category_name='부속품'),'FIXED','FIXED',1,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='G-0033');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'G-0034','황금봉','GOODS',(SELECT id FROM item_categories WHERE category_name='부속품'),'FIXED','FIXED',1,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='G-0034');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'G-0035','까치발 별도','GOODS',(SELECT id FROM item_categories WHERE category_name='부속품'),'FIXED','FIXED',1,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='G-0035');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'G-0036','국기봉 금봉 막봉','GOODS',(SELECT id FROM item_categories WHERE category_name='부속품'),'FIXED','FIXED',1,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='G-0036');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'G-0037','.mm재단로프','GOODS',(SELECT id FROM item_categories WHERE category_name='부속품'),'FIXED','FIXED',1,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='G-0037');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'G-0038','윈드배너 물통형 SET 소','GOODS',(SELECT id FROM item_categories WHERE category_name='부속품'),'FIXED','FIXED',1,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='G-0038');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'G-0039','볼로프','GOODS',(SELECT id FROM item_categories WHERE category_name='부속품'),'FIXED','FIXED',1,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='G-0039');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'G-0040','양면테이프','GOODS',(SELECT id FROM item_categories WHERE category_name='부속품'),'FIXED','FIXED',1,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='G-0040');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'G-0041','가방 부직포','GOODS',(SELECT id FROM item_categories WHERE category_name='부속품'),'FIXED','FIXED',1,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='G-0041');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'G-0042','철제배너 물통SET TSO','GOODS',(SELECT id FROM item_categories WHERE category_name='부속품'),'FIXED','FIXED',1,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='G-0042');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'G-0043','정기 창깃대','GOODS',(SELECT id FROM item_categories WHERE category_name='부속품'),'FIXED','FIXED',1,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='G-0043');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'G-0044','A자석액자 테이프 부착식','GOODS',(SELECT id FROM item_categories WHERE category_name='부속품'),'FIXED','FIXED',1,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='G-0044');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'G-0045','자전거용깃대','GOODS',(SELECT id FROM item_categories WHERE category_name='부속품'),'FIXED','FIXED',1,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='G-0045');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'G-0046','앙폴대','GOODS',(SELECT id FROM item_categories WHERE category_name='부속품'),'FIXED','FIXED',1,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='G-0046');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'M-0031','SPMG','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'FIXED','FIXED',0,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='M-0031');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'M-0032','SPPM','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'FIXED','FIXED',0,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='M-0032');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'M-0033','열원단 cm','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'FIXED','FIXED',0,1,0,'롤',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='M-0033');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'M-0034','PVC 켈','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'FIXED','FIXED',0,1,0,'롤',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='M-0034');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'M-0035','무광 지 자동용','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'FIXED','FIXED',0,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='M-0035');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'M-0036','LED형광등','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'FIXED','FIXED',0,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='M-0036');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'M-0037','텐트천','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'FIXED','FIXED',0,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='M-0037');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'M-0038','열승화 폰지','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'FIXED','FIXED',0,1,0,'롤',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='M-0038');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'M-0040','KPL모듈','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'FIXED','FIXED',0,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='M-0040');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'M-0041','합성지','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'FIXED','FIXED',0,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='M-0041');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'M-0042','SMP 방수형','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'FIXED','FIXED',0,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='M-0042');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'M-0043','잉크 M','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'FIXED','FIXED',0,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='M-0043');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'M-0046','잉크 C','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'FIXED','FIXED',0,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='M-0046');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'M-0047','무광지 일반엠보','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'FIXED','FIXED',0,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='M-0047');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'M-0048','SPEA','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'FIXED','FIXED',0,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='M-0048');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'M-0049','잉크 Y','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'FIXED','FIXED',0,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='M-0049');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'M-0050','LBNH 농협','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'FIXED','FIXED',0,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='M-0050');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'M-0051','클리어필름 WAY','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'FIXED','FIXED',0,1,0,'롤',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='M-0051');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'M-0052','부직포','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'FIXED','FIXED',0,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='M-0052');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'M-0053','E 엠보 무광','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'FIXED','FIXED',0,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='M-0053');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'M-0054','저밀도원단','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'FIXED','FIXED',0,1,0,'롤',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='M-0054');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'M-0055','전자 타이머','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'FIXED','FIXED',0,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='M-0055');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'M-0057','잉크 K','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'FIXED','FIXED',0,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='M-0057');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'M-0058','채널간판 LT','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'FIXED','FIXED',0,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='M-0058');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'M-0059','잉크 C ITP 개별포장','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'FIXED','FIXED',0,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='M-0059');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'M-0060','잉크 Y ITP 개별포장','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'FIXED','FIXED',0,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='M-0060');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'M-0061','잉크 M ITP 개별포장','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'FIXED','FIXED',0,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='M-0061');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'M-0062','조명시트 LG하우시스 LT','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'FIXED','FIXED',0,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='M-0062');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'M-0063','PVC 켈 잉크테크','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'FIXED','FIXED',0,1,0,'롤',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='M-0063');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'M-0065','LED투광기','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'FIXED','FIXED',0,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='M-0065');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'M-0066','LED투광기 S','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'FIXED','FIXED',0,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='M-0066');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'M-0067','M시트 IJC','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'FIXED','FIXED',0,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='M-0067');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'M-0068','JPL모듈','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'FIXED','FIXED',0,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='M-0068');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'M-0069','무광지 자동엠보','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'FIXED','FIXED',0,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='M-0069');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'M-0070','SPCG','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'FIXED','FIXED',0,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='M-0070');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'M-0071','SPPG','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'FIXED','FIXED',0,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='M-0071');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'M-0075','EP LG엠보시트','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'FIXED','FIXED',0,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='M-0075');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'M-0076','엡손 잉크','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'FIXED','FIXED',0,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='M-0076');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'M-0077','SMP 방수형 유니온','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'FIXED','FIXED',0,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='M-0077');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'M-0078','와이드컬러 릿','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'FIXED','FIXED',0,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='M-0078');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'M-0080','조명시트 LT','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'FIXED','FIXED',0,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='M-0080');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'M-0081','켄버스','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'FIXED','FIXED',0,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='M-0081');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'M-0082','잉크 LM','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'FIXED','FIXED',0,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='M-0082');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'M-0084','합성지 비접착','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'FIXED','FIXED',0,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='M-0084');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'M-0085','클리어필름 W','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'FIXED','FIXED',0,1,0,'롤',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='M-0085');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'M-0086','잉크 LC','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'FIXED','FIXED',0,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='M-0086');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'M-0087','컨트롤러','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'FIXED','FIXED',0,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='M-0087');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'M-0088','클리어필름 C','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'FIXED','FIXED',0,1,0,'롤',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='M-0088');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'M-0089','현수막원단','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'FIXED','FIXED',0,1,0,'롤',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='M-0089');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'M-0090','LC 보조시트','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'FIXED','FIXED',0,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='M-0090');
INSERT INTO items (item_code,item_name,item_type,category_id,pricing_method,pricing_profile,is_sales_item,is_purchase_item,production_required,unit,is_active)
SELECT 'M-0091','LED투광기 전구색','MATERIAL',(SELECT id FROM item_categories WHERE category_name='원자재'),'FIXED','FIXED',0,1,0,'EA',0
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='M-0091');

-- 겸업 product_materials 링크 (제품 출력 → 자재 원판)
INSERT INTO product_materials (product_item_id,material_item_id,is_default)
SELECT (SELECT id FROM items WHERE item_code='P-0077' LIMIT 1),(SELECT id FROM items WHERE item_code='M-0003' LIMIT 1),1
WHERE EXISTS (SELECT 1 FROM items WHERE item_code='P-0077') AND EXISTS (SELECT 1 FROM items WHERE item_code='M-0003')
  AND NOT EXISTS (SELECT 1 FROM product_materials WHERE product_item_id=(SELECT id FROM items WHERE item_code='P-0077' LIMIT 1) AND material_item_id=(SELECT id FROM items WHERE item_code='M-0003' LIMIT 1));
INSERT INTO product_materials (product_item_id,material_item_id,is_default)
SELECT (SELECT id FROM items WHERE item_code='P-0092' LIMIT 1),(SELECT id FROM items WHERE item_code='M-0009' LIMIT 1),1
WHERE EXISTS (SELECT 1 FROM items WHERE item_code='P-0092') AND EXISTS (SELECT 1 FROM items WHERE item_code='M-0009')
  AND NOT EXISTS (SELECT 1 FROM product_materials WHERE product_item_id=(SELECT id FROM items WHERE item_code='P-0092' LIMIT 1) AND material_item_id=(SELECT id FROM items WHERE item_code='M-0009' LIMIT 1));
INSERT INTO product_materials (product_item_id,material_item_id,is_default)
SELECT (SELECT id FROM items WHERE item_code='P-0102' LIMIT 1),(SELECT id FROM items WHERE item_code='M-0017' LIMIT 1),1
WHERE EXISTS (SELECT 1 FROM items WHERE item_code='P-0102') AND EXISTS (SELECT 1 FROM items WHERE item_code='M-0017')
  AND NOT EXISTS (SELECT 1 FROM product_materials WHERE product_item_id=(SELECT id FROM items WHERE item_code='P-0102' LIMIT 1) AND material_item_id=(SELECT id FROM items WHERE item_code='M-0017' LIMIT 1));
INSERT INTO product_materials (product_item_id,material_item_id,is_default)
SELECT (SELECT id FROM items WHERE item_code='P-0133' LIMIT 1),(SELECT id FROM items WHERE item_code='M-0019' LIMIT 1),1
WHERE EXISTS (SELECT 1 FROM items WHERE item_code='P-0133') AND EXISTS (SELECT 1 FROM items WHERE item_code='M-0019')
  AND NOT EXISTS (SELECT 1 FROM product_materials WHERE product_item_id=(SELECT id FROM items WHERE item_code='P-0133' LIMIT 1) AND material_item_id=(SELECT id FROM items WHERE item_code='M-0019' LIMIT 1));
INSERT INTO product_materials (product_item_id,material_item_id,is_default)
SELECT (SELECT id FROM items WHERE item_code='P-0134' LIMIT 1),(SELECT id FROM items WHERE item_code='M-0020' LIMIT 1),1
WHERE EXISTS (SELECT 1 FROM items WHERE item_code='P-0134') AND EXISTS (SELECT 1 FROM items WHERE item_code='M-0020')
  AND NOT EXISTS (SELECT 1 FROM product_materials WHERE product_item_id=(SELECT id FROM items WHERE item_code='P-0134' LIMIT 1) AND material_item_id=(SELECT id FROM items WHERE item_code='M-0020' LIMIT 1));
INSERT INTO product_materials (product_item_id,material_item_id,is_default)
SELECT (SELECT id FROM items WHERE item_code='P-0135' LIMIT 1),(SELECT id FROM items WHERE item_code='M-0021' LIMIT 1),1
WHERE EXISTS (SELECT 1 FROM items WHERE item_code='P-0135') AND EXISTS (SELECT 1 FROM items WHERE item_code='M-0021')
  AND NOT EXISTS (SELECT 1 FROM product_materials WHERE product_item_id=(SELECT id FROM items WHERE item_code='P-0135' LIMIT 1) AND material_item_id=(SELECT id FROM items WHERE item_code='M-0021' LIMIT 1));
INSERT INTO product_materials (product_item_id,material_item_id,is_default)
SELECT (SELECT id FROM items WHERE item_code='P-0136' LIMIT 1),(SELECT id FROM items WHERE item_code='M-0022' LIMIT 1),1
WHERE EXISTS (SELECT 1 FROM items WHERE item_code='P-0136') AND EXISTS (SELECT 1 FROM items WHERE item_code='M-0022')
  AND NOT EXISTS (SELECT 1 FROM product_materials WHERE product_item_id=(SELECT id FROM items WHERE item_code='P-0136' LIMIT 1) AND material_item_id=(SELECT id FROM items WHERE item_code='M-0022' LIMIT 1));
INSERT INTO product_materials (product_item_id,material_item_id,is_default)
SELECT (SELECT id FROM items WHERE item_code='P-0140' LIMIT 1),(SELECT id FROM items WHERE item_code='M-0023' LIMIT 1),1
WHERE EXISTS (SELECT 1 FROM items WHERE item_code='P-0140') AND EXISTS (SELECT 1 FROM items WHERE item_code='M-0023')
  AND NOT EXISTS (SELECT 1 FROM product_materials WHERE product_item_id=(SELECT id FROM items WHERE item_code='P-0140' LIMIT 1) AND material_item_id=(SELECT id FROM items WHERE item_code='M-0023' LIMIT 1));
INSERT INTO product_materials (product_item_id,material_item_id,is_default)
SELECT (SELECT id FROM items WHERE item_code='P-0141' LIMIT 1),(SELECT id FROM items WHERE item_code='M-0024' LIMIT 1),1
WHERE EXISTS (SELECT 1 FROM items WHERE item_code='P-0141') AND EXISTS (SELECT 1 FROM items WHERE item_code='M-0024')
  AND NOT EXISTS (SELECT 1 FROM product_materials WHERE product_item_id=(SELECT id FROM items WHERE item_code='P-0141' LIMIT 1) AND material_item_id=(SELECT id FROM items WHERE item_code='M-0024' LIMIT 1));
INSERT INTO product_materials (product_item_id,material_item_id,is_default)
SELECT (SELECT id FROM items WHERE item_code='P-0143' LIMIT 1),(SELECT id FROM items WHERE item_code='M-0025' LIMIT 1),1
WHERE EXISTS (SELECT 1 FROM items WHERE item_code='P-0143') AND EXISTS (SELECT 1 FROM items WHERE item_code='M-0025')
  AND NOT EXISTS (SELECT 1 FROM product_materials WHERE product_item_id=(SELECT id FROM items WHERE item_code='P-0143' LIMIT 1) AND material_item_id=(SELECT id FROM items WHERE item_code='M-0025' LIMIT 1));
INSERT INTO product_materials (product_item_id,material_item_id,is_default)
SELECT (SELECT id FROM items WHERE item_code='P-0145' LIMIT 1),(SELECT id FROM items WHERE item_code='M-0026' LIMIT 1),1
WHERE EXISTS (SELECT 1 FROM items WHERE item_code='P-0145') AND EXISTS (SELECT 1 FROM items WHERE item_code='M-0026')
  AND NOT EXISTS (SELECT 1 FROM product_materials WHERE product_item_id=(SELECT id FROM items WHERE item_code='P-0145' LIMIT 1) AND material_item_id=(SELECT id FROM items WHERE item_code='M-0026' LIMIT 1));
INSERT INTO product_materials (product_item_id,material_item_id,is_default)
SELECT (SELECT id FROM items WHERE item_code='P-0147' LIMIT 1),(SELECT id FROM items WHERE item_code='M-0027' LIMIT 1),1
WHERE EXISTS (SELECT 1 FROM items WHERE item_code='P-0147') AND EXISTS (SELECT 1 FROM items WHERE item_code='M-0027')
  AND NOT EXISTS (SELECT 1 FROM product_materials WHERE product_item_id=(SELECT id FROM items WHERE item_code='P-0147' LIMIT 1) AND material_item_id=(SELECT id FROM items WHERE item_code='M-0027' LIMIT 1));
INSERT INTO product_materials (product_item_id,material_item_id,is_default)
SELECT (SELECT id FROM items WHERE item_code='P-0149' LIMIT 1),(SELECT id FROM items WHERE item_code='M-0028' LIMIT 1),1
WHERE EXISTS (SELECT 1 FROM items WHERE item_code='P-0149') AND EXISTS (SELECT 1 FROM items WHERE item_code='M-0028')
  AND NOT EXISTS (SELECT 1 FROM product_materials WHERE product_item_id=(SELECT id FROM items WHERE item_code='P-0149' LIMIT 1) AND material_item_id=(SELECT id FROM items WHERE item_code='M-0028' LIMIT 1));
INSERT INTO product_materials (product_item_id,material_item_id,is_default)
SELECT (SELECT id FROM items WHERE item_code='P-0151' LIMIT 1),(SELECT id FROM items WHERE item_code='M-0029' LIMIT 1),1
WHERE EXISTS (SELECT 1 FROM items WHERE item_code='P-0151') AND EXISTS (SELECT 1 FROM items WHERE item_code='M-0029')
  AND NOT EXISTS (SELECT 1 FROM product_materials WHERE product_item_id=(SELECT id FROM items WHERE item_code='P-0151' LIMIT 1) AND material_item_id=(SELECT id FROM items WHERE item_code='M-0029' LIMIT 1));
