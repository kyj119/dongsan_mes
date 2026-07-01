-- 0433_bolof_to_material.sql
-- 볼로프(ACC-037 base + 4MM/5MM 변종) → 원자재 dual 전환 (사용자 선택 b: 제작+판매 겸함)
-- category=원자재(5)·item_type=MATERIAL·is_purchase=1·is_sales=1(판매 유지). base_price 유지.
-- ⚠️ item_code는 ACC-037* 유지(식별자 안정성). is_sales=1이라 주문 기본검색엔 계속 노출됨(사용자 인지).
UPDATE items
SET category='원자재', category_id=5, item_type='MATERIAL',
    is_purchase_item=1, is_sales_item=1, updated_at=datetime('now')
WHERE item_code LIKE 'ACC-037%';
