-- 하나은행 보증서담보대출 계좌 등록 (barobill_registered=0=자동동기화 제외)
INSERT OR IGNORE INTO bank_accounts (bank_code,bank_name,account_number,account_holder,is_active,entity_id,barobill_registered,account_alias) VALUES ('0081','하나은행','60228625205','선명커뮤니케이션',1,2,0,'하나은행-보증서담보대출(1500)');
