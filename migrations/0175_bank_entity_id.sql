-- 은행 모듈 멀티사업자 지원
ALTER TABLE bank_accounts ADD COLUMN entity_id INTEGER DEFAULT 1;
ALTER TABLE bank_transactions ADD COLUMN entity_id INTEGER DEFAULT 1;
