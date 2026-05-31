-- 법인카드 마감일(cutoff_day) 추가
-- 마감일: 전월 cutoff_day+1 ~ 당월 cutoff_day 사용분이 다음달 payment_day에 결제
ALTER TABLE corporate_cards ADD COLUMN cutoff_day INTEGER DEFAULT 15;
