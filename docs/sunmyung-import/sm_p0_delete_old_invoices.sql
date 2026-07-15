-- 구 매입 496M(SM- 접두, BRN 매칭 전 구파일) 제거. 신 512M(SMI-) 생성 직전 실행.
DELETE FROM purchase_invoice_items WHERE invoice_id IN (SELECT id FROM purchase_invoices WHERE entity_id=2 AND notes LIKE '선명 이관%');
DELETE FROM purchase_invoices WHERE entity_id=2 AND notes LIKE '선명 이관%';
