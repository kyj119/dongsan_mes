-- 선명 이관 전체 롤백 (마커: entity_id=2 + notes '선명 이관%'). import는 cards/shipment/세금계산서 미생성이라 단순.
DELETE FROM order_billing_groups WHERE order_id IN (SELECT id FROM orders WHERE entity_id=2 AND notes LIKE '선명 이관%');
DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE entity_id=2 AND notes LIKE '선명 이관%');
DELETE FROM orders WHERE entity_id=2 AND notes LIKE '선명 이관%';
DELETE FROM purchase_invoice_items WHERE invoice_id IN (SELECT id FROM purchase_invoices WHERE entity_id=2 AND notes LIKE '선명 이관%');
DELETE FROM purchase_invoices WHERE entity_id=2 AND notes LIKE '선명 이관%';
-- (기타 카테고리·서비스 5품목·등록 거래처는 유지. 필요 시 별도 삭제)
