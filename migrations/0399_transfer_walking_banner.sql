-- 0399: 전사 워킹배너(X배너) — 전사(승화) 니트원단 / AREA 자유규격 / 형(F·H·S)=주문옵션 / 단가 보류(0).
-- 모델: 출력 PRODUCT(자체출력, 매입X). 형(F형/H형/S형)은 주문 시 옵션 선택(별도 제품변종 아님).
-- 스탠드/F형·H형 프레임 등 거치대 = 부속 GOODS 주문라인(제품 미포함, 후속 등록).
-- ⚠️ 니트 원단(윈드배너 0398과 공유) 등록 시 product_materials 링크 함께(후속). 단가도 후속.
INSERT INTO items (item_code, item_name, item_type, category, category_id, unit, base_price, sales_price, pricing_method, pricing_profile, is_active, is_sales_item, is_purchase_item, production_required, item_group, specification, sub_category, deduction_method) VALUES
 ('TRWK','전사 워킹배너','PRODUCT','전사',1,'EA',0,0,'AREA','AREA',1,1,0,1,'워킹배너','니트','워킹배너','ROLL');
