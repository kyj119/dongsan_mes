-- 계좌별 사용자 지정 이름(별칭). 거래내역 매칭 화면/계좌 필터/계좌관리 목록에서
-- 은행명·예금주보다 우선 표시. 예금주(account_holder=실제 예금주명)와 의미 분리.
ALTER TABLE bank_accounts ADD COLUMN account_alias TEXT;
