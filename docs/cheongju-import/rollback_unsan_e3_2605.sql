-- 청주 운산직물 직접매입 롤백 (2026-08-08)
DELETE FROM purchase_order_items WHERE po_id IN (SELECT id FROM purchase_orders WHERE po_number='CJP-2605-001');
DELETE FROM purchase_orders WHERE po_number='CJP-2605-001';
DELETE FROM items WHERE item_code IN ('BJP-060','BJP-090','BJP-127','BJP-152','BJP-180','AQ0-090');
