-- 마이너스통장(한도대출) 계좌 구분 — 총 계좌잔액(예금)과 한도대출 사용액을 분리 집계
-- 실측: e1 하나은행 60291004389904 잔액 -495,725,564 가 총잔액에 섞여 예금 실측이 왜곡됨
ALTER TABLE bank_accounts ADD COLUMN is_overdraft INTEGER NOT NULL DEFAULT 0;
