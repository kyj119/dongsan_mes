-- 0398: 전사 윈드배너 — 전사(승화) 니트원단 / AREA 자유규격 / 형(S·F)=주문옵션 / 단가 보류(0).
-- 모델: 출력 PRODUCT(자체출력, 매입X). 형(S형/F형)은 주문 시 옵션 선택(별도 제품변종 아님).
-- 폴세트/물통/스파이크 등 거치대 = 부속 GOODS 주문라인(제품 미포함, 후속 등록).
-- ⚠️ 니트 원단 미등록 → 폭매칭 자동차감(ROLL) 보류: 니트 롤 폭 확정 후 원단 등록 + product_materials 링크(후속). 단가도 후속.
INSERT INTO items (item_code, item_name, item_type, category, category_id, unit, base_price, sales_price, pricing_method, pricing_profile, is_active, is_sales_item, is_purchase_item, production_required, item_group, specification, sub_category, deduction_method) VALUES
 ('TRW','전사 윈드배너','PRODUCT','전사',1,'EA',0,0,'AREA','AREA',1,1,0,1,'윈드배너','니트','윈드배너','ROLL');
