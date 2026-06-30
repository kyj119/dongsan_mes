-- 0418: 자재/원단(MATERIAL) + 상품/액자(GOODS) 미등록 잔여 — 명확한 신규만. 단가 보류.
-- A 자재/원단 5(원자재 id5, dual). B 상품/액자 8(상품 id4, GOODS, dual).
-- 보류(별도 확인): 솔벤캔버스(주문0·원단미파악)·코팅지 200g/E4/C4(선명 명칭매핑)·저밀도원단(기등록 동일품?)·3M IJ35C·SPM011M(오타?). LD59THG=LD59HTG 오타(기등록).
INSERT INTO items (item_code,item_name,item_type,category,category_id,unit,base_price,sales_price,pricing_method,is_active,is_sales_item,is_purchase_item,production_required,item_group,specification,deduction_method,width_mm) VALUES
 ('HTF-095','열전사원단','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'열전사원단','95cm','ROLL',950),
 ('TPL-090','타포린','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'타포린','90폭','ROLL',900),
 ('GFB-01','그라스화이바','MATERIAL','원자재',5,'EA',0,0,'FIXED',1,1,1,0,'그라스화이바','3M/2.6m','NONE',NULL),
 ('WDR-01','원형나무','MATERIAL','원자재',5,'EA',0,0,'FIXED',1,1,1,0,'원형나무','20mm·90/70폭','NONE',NULL),
 ('WDS-01','각목','MATERIAL','원자재',5,'EA',0,0,'FIXED',1,1,1,0,'각목','100/120·120cm','NONE',NULL);

INSERT INTO items (item_code,item_name,item_type,category,category_id,unit,base_price,sales_price,pricing_method,is_active,is_sales_item,is_purchase_item,production_required,item_group,specification) VALUES
 ('GDS-LRF','좌우보필형 액자','GOODS','상품',4,'EA',0,0,'FIXED',1,1,1,0,'액자','30×45·60×40·20×30'),
 ('GDS-A3M','A3 자석액자(테이프부착)','GOODS','상품',4,'EA',0,0,'FIXED',1,1,1,0,'액자','297×420'),
 ('GDS-FB1','국기함 보급형','GOODS','상품',4,'EA',0,0,'FIXED',1,1,1,0,'국기함','보급형'),
 ('GDS-FB2','국기함 중급형','GOODS','상품',4,'EA',0,0,'FIXED',1,1,1,0,'국기함','중급형'),
 ('GDS-FBSET','가정용 국기함세트','GOODS','상품',4,'EA',0,0,'FIXED',1,1,1,0,'국기함','가정용 세트'),
 ('GDS-CSR','청사초롱','GOODS','상품',4,'EA',0,0,'FIXED',1,1,1,0,'청사초롱','68×55'),
 ('GDS-DESK','탁상용 국기','GOODS','상품',4,'EA',0,0,'FIXED',1,1,1,0,'탁상용','수술 등'),
 ('GDS-ZIP','거리용 지퍼가방','GOODS','상품',4,'EA',0,0,'FIXED',1,1,1,0,'지퍼가방','-');
