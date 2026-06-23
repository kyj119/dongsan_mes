-- 0374: 조명시트 generic 매입기록용 자재 1종 (용준님 결정 '가').
-- 조명시트=간판 제작 소비 자재(매입 자주·거의 전색 보유·판매 드묾). 주 소비처 간판이 미모델링(BOM·자동소비X)이라 색상별 시스템재고 ROI 낮음.
-- → 지금은 generic 1종으로 매입 기록(색상/폭=매입 라인 메모). 색상별 per-color 재고는 간판 BOM 구축 시 확장.
-- 원자재 dual(매입 위주, 재단판매 드묾), 폭/색상 미특정(범용). (idempotent)
INSERT OR IGNORE INTO items (item_code, item_name, item_type, category, category_id, unit, base_price, sales_price, pricing_method, is_active, is_sales_item, is_purchase_item, production_required, item_group, specification, deduction_method)
VALUES ('JMS-GEN','조명시트','MATERIAL','원자재',5,'yd',0,0,'FIXED',1,1,1,0,'조명시트','범용(색상·폭=매입 메모)','ROLL');
