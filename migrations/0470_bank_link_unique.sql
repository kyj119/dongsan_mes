-- 0470: bank_transactions 원장 연결 중복 방지 부분 UNIQUE (#535)
-- 같은 purchase_payments/payments 원장이 두 은행거래에 동시 LINKED 되는 레이스 차단
CREATE UNIQUE INDEX IF NOT EXISTS idx_bt_matched_pp_uniq ON bank_transactions(matched_purchase_payment_id) WHERE matched_purchase_payment_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_bt_matched_payment_uniq ON bank_transactions(matched_payment_id) WHERE matched_payment_id IS NOT NULL;
