-- 묶음 편집: 동일 품목 내 개별 내용 관리 (부모-자식 구조)
-- 부모 행: parent_item_id=NULL, 청구·정산 기준 (카드 생성 안 함)
-- 자식 행: parent_item_id=부모ID, 실제 출력·카드 기준 (quantity=1씩 개별 카드)
ALTER TABLE order_items ADD COLUMN parent_item_id INTEGER DEFAULT NULL;
