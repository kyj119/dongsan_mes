-- 동산기획(53) 김진수 오매칭 입금 3건(14M) 제거: bank_transaction UNMATCHED 복귀 + payment 삭제
UPDATE bank_transactions SET match_status='UNMATCHED', matched_client_id=NULL, matched_payment_id=NULL, matched_by=NULL, matched_at=NULL
WHERE matched_payment_id IN (SELECT id FROM payments WHERE client_id=53 AND entity_id=2 AND reference_number IN ('SMBANK-00193','SMBANK-00194','SMBANK-00114'));
DELETE FROM payments WHERE client_id=53 AND entity_id=2 AND reference_number IN ('SMBANK-00193','SMBANK-00194','SMBANK-00114');
