-- 차입금 만기 확인 여부 (2026-08-05)
-- `maturity_date` 가 NOT NULL 이라 "만기를 아직 모른다"를 담을 자리가 없었다.
--   그래서 만기 미확인 차입금에 placeholder 날짜를 넣게 되고,
--   generate-schedule 이 INTEREST_ONLY 를 BULLET 과 똑같이 처리해(cashFlow.ts)
--   그 placeholder 달에 **원금 전액**을 현금유출로 만들어 버린다(실측 대상 12.6억).
-- 사실을 대출 자체에 붙여, 확인되기 전에는 원금 회차를 만들지 않는다.
ALTER TABLE loans ADD COLUMN maturity_confirmed INTEGER NOT NULL DEFAULT 1;

-- 2026-08-05 이관분 중 만기 미확인 8건 — 세무장부에 원금 이동이 없어 이자만 잡은 것들.
UPDATE loans SET maturity_confirmed = 0
WHERE repayment_type = 'INTEREST_ONLY'
  AND maturity_date = '2027-07-31'
  AND notes LIKE '만기 미확인%';
