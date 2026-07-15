-- 선명 매입(purchase) 이관 롤백. 마커=entity_id=2 + po_number LIKE 'SMP-%'.
-- (적용 전 prod purchase_payments/adjustments entity_id=2 = 0건 확인됨 → 전량 삭제 안전)
DELETE FROM purchase_order_items WHERE po_id IN (SELECT id FROM purchase_orders WHERE entity_id=2 AND po_number LIKE 'SMP-%');
DELETE FROM purchase_orders WHERE entity_id=2 AND po_number LIKE 'SMP-%';
DELETE FROM purchase_payments WHERE entity_id=2;
DELETE FROM purchase_adjustments WHERE entity_id=2;
-- 신 회계허브 인보이스(SMI-). ⚠️구 496M(SM-)은 이걸로 복원 불가 → 원천 재이관 필요.
DELETE FROM purchase_invoices WHERE entity_id=2 AND invoice_number LIKE 'SMI-%';
UPDATE clients SET purchase_balance=0 WHERE id IN (53,92,116,126,167,176,291,528,683,3757,962,1156,1733,3754,2347,3755,2593,2632,2649);
