-- 동산기획 entity1 테스트 주문 3건 삭제 (2026-07-30, 용준님 승인)
-- 대상: E1-20260703-001(id 96) · E1-20260703-002(id 98) · E1-20260724-001(id 1117)
-- 백업: docs/dongsan-import/backup/*.json
-- 자식→부모 순서 명시 삭제 (D1 FK CASCADE 의존 회피)
DELETE FROM shipment_checks WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id IN (96,98,1117));
DELETE FROM shipment_items  WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id IN (96,98,1117));
DELETE FROM shipments       WHERE order_id IN (96,98,1117);
DELETE FROM card_items      WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id IN (96,98,1117));
DELETE FROM cards           WHERE order_id IN (96,98,1117);
DELETE FROM designer_intakes WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id IN (96,98,1117));
DELETE FROM order_ai_files  WHERE order_id IN (96,98,1117);
DELETE FROM order_status_history WHERE order_id IN (96,98,1117);
DELETE FROM order_billing_groups WHERE order_id IN (96,98,1117);
UPDATE tasks SET order_id = NULL WHERE order_id IN (96,98,1117);
DELETE FROM order_items     WHERE order_id IN (96,98,1117);
DELETE FROM orders          WHERE id IN (96,98,1117);
