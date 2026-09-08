-- 0596: QM6(1389) 할부를 등록 — 부채가 통째로 빠져 있던 자리
--
-- 용준님 확인(2026-09-08): 대주는 **우리금융캐피탈**, 기간은 「아마 36개월」.
--
-- ★그런데 **36개월은 산술적으로 성립하지 않는다.**
--   원금 16,300,000(선명 원장 06-29 「차량구매대금 캐피탈 입금」 = 차량 공급가 14,818,182 × 1.1)
--   36개월이면 **무이자라도 월 452,778** 이 필요한데 통장 실측은 **418,913**(2026-08-14) 이다.
--   418,913 × 36 = 15,080,868 로 원금에 1,219,132 모자란다.
--
--   418,913 이 정상 회차라면 회차수는 **39~44회**다(무이자 38.9 · 연3% 41.0 · 연5% 42.5 · 연7% 44.3).
--   아니면 **8/14 가 첫 회라 일할 계산으로 적었을** 수 있다(취득 07-01 → 첫 납입 08-14).
--   ★**9월 출금(9/14 예정)이 나오면 둘 중 무엇인지 확정된다** — 418,913 이면 39~44회,
--     452,778 이상이면 36회다. 그때까지 회차수를 정하지 않는다.
--
-- 그래서: 대주·원금·월납은 넣고 **만기는 placeholder + `maturity_confirmed = 0`**, 스케줄은 만들지 않는다.
-- 추정 회차로 스케줄을 만들면 자금예측이 최대 8개월치(약 335만) 틀린다.
--
-- 멱등: loan_number 기준 NOT EXISTS.

INSERT INTO loans (loan_number, creditor, description, original_amount, current_balance, rate_type, current_rate,
                   repayment_type, start_date, maturity_date, monthly_payment_day, monthly_payment_amount,
                   is_active, maturity_confirmed, entity_id, notes)
SELECT '1389', '우리금융캐피탈', 'QM6 1389 차량 할부 — 2026-06-29 실행 16,300,000',
       16300000, 15881087, 'FIXED', 0, 'EQUAL_INSTALLMENT', '2026-06-29', '2030-02-14', 14, 418913, 1, 0, 2,
       '0596: 대주 우리금융캐피탈(용준님). 선명 원장 06-29 「선명커뮤니케이션-차량구매대금 캐피탈 입금」 16,300,000 · 통장 08-14 우리금융캐피탈 418,913. ★「36개월」은 성립 불가 — 무이자라도 월 452,778 필요. 실측 418,913 기준 39~44회. 9/14 출금으로 확정 예정이라 maturity_confirmed=0.'
WHERE NOT EXISTS (SELECT 1 FROM loans WHERE loan_number = '1389');

UPDATE fixed_assets SET loan_id = (SELECT id FROM loans WHERE loan_number = '1389')
 WHERE asset_code = 'FA-E2-L02' AND loan_id IS NULL
   AND EXISTS (SELECT 1 FROM loans WHERE loan_number = '1389');
