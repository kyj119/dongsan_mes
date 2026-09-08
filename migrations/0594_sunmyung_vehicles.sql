-- 0594: 선명(E2) 차량 4대와 할부를 세무장부 실측으로 등록
--
-- 선명은 MES 고정자산이 **0건**인데 차량 4대를 다루고 있었다. 세무장부 계정별원장
-- `208 차량운반구`(3기)가 취득가를 원 단위까지 준다 — 합계 **81,717,535 가 원장 누계와 일치**한다.
--
-- | 번호판 | 취득가 | 구성 |
-- |---|---|---|
-- | 800더7409 스타리아 | 14,577,284 | 전기이월(2025-03 동산에서 이전) |
-- | 1389 (동행모터스)  | 15,922,949 | 차량 14,818,182 + 취등록세 1,104,767 |
-- | 8488 스포티지(기아) | 35,799,182 | 차량 35,428,182 + 인수구매대금 271,000 + 계약금 100,000 |
-- | 800더7445 포터2    | 15,418,120 | 동산 매입 15,000,000 + 취득세 407,000 + 채권 7,120 + 증지 3,000 + 수수료 1,000 |
--
-- ★스포티지 공급가 35,428,182 → VAT 포함 38,971,000 = 「3,900만원대」와 일치(용준님 확인).
-- ★800더7445 는 동산 처분가 15,000,000 이 그대로 선명 취득가다 — **법인 간 이전이 양쪽 장부에서 닫힌다.**
-- ★800더7409 는 전기이월이라 2025-03 이전분이다. 할부는 **동산이 계속 납부**한다(loans #15).
--
-- 할부(선명 부담)
--   8488 스포티지 — 하나캐피탈 월 **704,410**, 2026-08-18 첫 납입(원장 「하나캐피탈 8448 스포티지 할부 대금」)
--   800더7445    — 월 **500,000**, 2026-08-28 첫 상환
--   1389        — 2026-06-29 「차량구매대금 **캐피탈 입금** 16,300,000」 으로 구매. **대주 미상**이라 등록하지 않는다
--
-- ⚠️ 세 할부 모두 **잔액·만기·금리를 모른다**(납입 1~2회뿐이라 원금 증가율을 못 구한다) →
--    `maturity_confirmed = 0` 이고 스케줄을 만들지 않는다. 확인되면 0593 과 같은 방식으로 생성한다.
-- ⚠️ 감가상각은 MES 관례(60개월 정률)를 따른다 — 세무장부도 차량은 0.451(정률 5년)이다.
--
-- 멱등: asset_code / loan_number 기준 NOT EXISTS.

INSERT INTO fixed_assets (asset_code, name, category, acquisition_date, acquisition_cost,
                          useful_life_months, depreciation_method, current_book_value, status, entity_id, notes)
SELECT 'FA-E2-L01', '스타리아 [800더7409]', 'VEHICLE', '2025-03-01', 14577284, 60, 'DECLINING_BALANCE', 14577284, 'IN_USE', 2,
       '0594: 선명 세무장부 208 전기이월 14,577,284. 2025-03 동산에서 이전. 할부는 동산이 납부(loans #15). 취득일은 이전 시점 추정 — 원장이 전기이월이라 정확한 날짜가 없다.'
WHERE NOT EXISTS (SELECT 1 FROM fixed_assets WHERE asset_code = 'FA-E2-L01');

INSERT INTO fixed_assets (asset_code, name, category, acquisition_date, acquisition_cost,
                          useful_life_months, depreciation_method, current_book_value, status, entity_id, notes)
SELECT 'FA-E2-L02', '업무용차량 [1389]', 'VEHICLE', '2026-07-01', 15922949, 60, 'DECLINING_BALANCE', 15922949, 'IN_USE', 2,
       '0594: 선명 세무장부 208 · 07-01 (주)동행모터스 14,818,182 + 07-06 취등록세 1,104,767. 2026-06-29 캐피탈 대출 16,300,000 으로 결제(대주 미상). 차종 미확인.'
WHERE NOT EXISTS (SELECT 1 FROM fixed_assets WHERE asset_code = 'FA-E2-L02');

INSERT INTO fixed_assets (asset_code, name, category, acquisition_date, acquisition_cost,
                          useful_life_months, depreciation_method, current_book_value, status, entity_id, notes)
SELECT 'FA-E2-L03', '스포티지 [8488]', 'VEHICLE', '2026-07-22', 35799182, 60, 'DECLINING_BALANCE', 35799182, 'IN_USE', 2,
       '0594: 선명 세무장부 208 · 07-22 기아(주) 「스포티지 1」 35,428,182(공급가) + 07-23 인수구매대금 271,000 + 07-24 계약금 100,000. VAT 포함 38,971,000.'
WHERE NOT EXISTS (SELECT 1 FROM fixed_assets WHERE asset_code = 'FA-E2-L03');

INSERT INTO fixed_assets (asset_code, name, category, acquisition_date, acquisition_cost,
                          useful_life_months, depreciation_method, current_book_value, status, entity_id, notes)
SELECT 'FA-E2-L04', '포터2 [800더7445]', 'VEHICLE', '2026-07-23', 15418120, 60, 'DECLINING_BALANCE', 15418120, 'IN_USE', 2,
       '0594: 선명 세무장부 208 · 07-23 (주)동산기획 매입 15,000,000 + 취득세 407,000 + 채권 7,120 + 증지 3,000 + 수수료 1,000. 동산 자산 #38 의 처분가와 일치 — 법인 간 이전이 양쪽에서 닫힌다.'
WHERE NOT EXISTS (SELECT 1 FROM fixed_assets WHERE asset_code = 'FA-E2-L04');

INSERT INTO loans (loan_number, creditor, description, original_amount, current_balance, rate_type, current_rate,
                   repayment_type, start_date, maturity_date, monthly_payment_day, monthly_payment_amount,
                   is_active, maturity_confirmed, entity_id, notes)
SELECT '8488', '하나캐피탈', '스포티지 8488 할부 — 2026-08 첫 납입', 0, 0, 'FIXED', 0,
       'EQUAL_INSTALLMENT', '2026-08-18', '2031-08-18', 18, 704410, 1, 0, 2,
       '0594: 선명 세무장부 「하나캐피탈 8448 스포티지 할부 대금」 704,410(2026-08-18). 원금·만기·금리 미상 — 납입이 1회뿐이라 역산 불가. maturity_date 는 placeholder.'
WHERE NOT EXISTS (SELECT 1 FROM loans WHERE loan_number = '8488');

INSERT INTO loans (loan_number, creditor, description, original_amount, current_balance, rate_type, current_rate,
                   repayment_type, start_date, maturity_date, monthly_payment_day, monthly_payment_amount,
                   is_active, maturity_confirmed, entity_id, notes)
SELECT '800더7445', '(주)동산기획', '포터2 800더7445 할부 — 법인 간 이전 대금 분할', 15000000, 14500000, 'FIXED', 0,
       'EQUAL_INSTALLMENT', '2026-07-23', '2029-07-23', 28, 500000, 1, 0, 2,
       '0594: 선명 세무장부 「7445차량 할부 상환 1회」 500,000(2026-08-28). 동산 매입가 15,000,000 을 분할 상환 중. 회차수 미상 — maturity_date 는 placeholder.'
WHERE NOT EXISTS (SELECT 1 FROM loans WHERE loan_number = '800더7445');

UPDATE fixed_assets SET loan_id = (SELECT id FROM loans WHERE loan_number = '8488')
 WHERE asset_code = 'FA-E2-L03' AND loan_id IS NULL;
UPDATE fixed_assets SET loan_id = (SELECT id FROM loans WHERE loan_number = '800더7445')
 WHERE asset_code = 'FA-E2-L04' AND loan_id IS NULL;
-- ★EXISTS 가드 — CI 의 빈 부트스트랩 DB에는 loans #15 가 없어 FOREIGN KEY 로 배포가 막힌다(0593 과 같은 함정).
UPDATE fixed_assets SET loan_id = 15
 WHERE asset_code = 'FA-E2-L01' AND loan_id IS NULL AND EXISTS (SELECT 1 FROM loans WHERE id = 15);
