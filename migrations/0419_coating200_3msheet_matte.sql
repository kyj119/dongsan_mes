-- 0419: 자재 잔여 (사용자 확정) — 200g 코팅지(판매용·타제조사 표기) 3 + 3M 인쇄비닐(실품목) 1 + SPM011M(무광변종·재고1롤 소진용) 1.
-- 200g=판매용도만(생산소비X)→deduction NONE. 3M=실품목 인쇄비닐. SPM011M=is_active=1로 재고1롤 추적, 소진 후 비활성화 권장.
-- 스킵: 솔벤캔버스(미취급) / 저밀도원단=기등록 '수성 현수막원단 저밀도'와 동일(등록불요). LD59THG=LD59HTG 오타(기등록).
INSERT INTO items (item_code,item_name,item_type,category,category_id,unit,base_price,sales_price,pricing_method,is_active,is_sales_item,is_purchase_item,production_required,item_group,specification,deduction_method,width_mm) VALUES
 ('CPP-E4','E4 엠보무광 코팅지 200g','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'코팅지(판매)','200g·판매용','NONE',NULL),
 ('CPP-C4','C4 엠보UV무광 코팅지 200g','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'코팅지(판매)','200g·판매용','NONE',NULL),
 ('CPP-UV','UV무광 코팅지 200g','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'코팅지(판매)','200g·판매용','NONE',NULL),
 ('IJ35C-137','3M 인쇄비닐 IJ35C-10','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'3M시트','137폭/50m','ROLL',1370),
 ('SPM011M','무광시트 SPM011M','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'무광시트','무광·재고1롤(소진용)','ROLL',NULL);
