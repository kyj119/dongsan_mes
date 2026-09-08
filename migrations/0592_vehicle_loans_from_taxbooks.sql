-- 0592: 차량 할부를 세무장부 실측으로 정정하고 미등록 3건을 등록
--
-- WEHAGO SmartA(동산기획 21기) **253 미지급금 계정별원장**이 거래처명에 번호판을 박아 둔다 —
-- `현대캐피탈(800더7409)` · `현대캐피탈(87러6814)` · `신한카드(822구9159 포터2)`.
-- 그 한 화면이 「어느 할부가 어느 차인가」를 전부 준다(경위 = docs/dongsan-import/SMARTA_VEHICLES.md).
--
-- ★금리·잔액·만기는 **원장에서 역산**했다. 원리금균등은 월 원금이 (1+월이자율) 배로 늘어난다:
--   800더7409 469,865→482,599 (8개월) → 월 0.383% = 연 4.60%
--   잔액 = 이자 ÷ 월이자율, 잔여회차 = -log(1 - 잔액·r/납입액) / log(1+r)
--   검산: 822구9159 역산 잔액 9,329,859 vs 등록 9,330,095 — **차 236원**. 만기도 2027-09 로 일치한다.
--
-- 정정 내용
--   #15 「포터 800더7409」 → **스타리아**(2025-03 선명 이전). 월납 428,968 은 **87러6814 의 것**이었다.
--       실제 800더7409 는 월 505,225 · 만기 2027-08 · 연 4.60%.
--   #12 833소8708 은 차량대금 **29,000,000 전액을 현대캐피탈로 대체**(04-21). 36개월이 아니라 **48개월**.
--   #13 금리 7.089 → 6.60(역산) · #11 오릭스 7.3 → 8.17, 만기 2028-04 → **2028-02**
--
-- 신규 3건
--   87러6814 스타리아 427,744 — 2026-06-15 청주 매각과 함께 종료 → is_active=0
--   287모5569         446,341 — **MES 어디에도 없던 차량**. 2026-06 종료 → is_active=0
--   838버5060 애드월드 600,000 — **개인 간 할부**(최상호). 납입이 불규칙(3·5·8월)이라 만기 미확정
--
-- ⚠️ 800더7409·287모5569 는 **고정자산이 없다**(동산 세무장부 대장에도 없음). 취득가를 모르므로
--    자산을 만들지 않는다 — 추정치를 넣으면 감가상각이 통째로 틀린다.
-- ⚠️ 종료분 2건의 `original_amount` 는 **0** 이다. 계약 원금을 모르는데 추정치를 넣지 않는다.
--
-- 멱등: 신규는 loan_number 기준 NOT EXISTS, 정정은 id 지정.

UPDATE loans SET
  description = '스타리아 800더7409 할부 · 2025-03 선명 이전(자동차세는 선명 납부, 할부는 동산)',
  monthly_payment_amount = 505225, monthly_payment_day = 25,
  current_balance = 5908748, current_rate = 4.60, maturity_date = '2027-08-25', maturity_confirmed = 1,
  notes = COALESCE(notes,'') || ' | 0592: 세무장부 253 원장 거래처 「현대캐피탈(800더7409)」 원금 469,865~482,599(01~08월) 역산. 종전 월납 428,968 은 87러6814 계약이었다.'
WHERE id = 15;

UPDATE loans SET
  original_amount = 29000000, current_balance = 36347904, current_rate = 4.48,
  monthly_payment_day = 18, maturity_date = '2030-05-18', maturity_confirmed = 1,
  description = '포터II 833소8708 할부 · 2026-04-21 차량대금 29,000,000 전액 대체 · 48개월',
  notes = COALESCE(notes,'') || ' | 0592: 세무장부 208 원장 04-21 「833소8708 차량대금 대체」 29,000,000(현대캐피탈) 실측. 종전 36개월(2029-05)은 과소.'
WHERE id = 12;

UPDATE loans SET current_rate = 6.60, current_balance = 9329859,
  notes = COALESCE(notes,'') || ' | 0592: 원장 역산 잔액 9,329,859(등록값과 236원 차) · 만기 2027-09 일치 — 역산 방법 검증점.'
WHERE id = 13;

UPDATE loans SET current_rate = 8.17, current_balance = 42188375, maturity_date = '2028-02-20',
  notes = COALESCE(notes,'') || ' | 0592: 원장 「실사출력기외 리스료 원리금」 원금 2,191,605~2,282,679 역산.'
WHERE id = 11;

INSERT INTO loans (loan_number, creditor, description, original_amount, current_balance, rate_type, current_rate,
                   repayment_type, start_date, maturity_date, monthly_payment_day, monthly_payment_amount,
                   is_active, maturity_confirmed, entity_id, notes)
SELECT '87러6814', '현대캐피탈', '스타리아 87러6814 할부 — 2026-06-15 청주 법인 매각(13,980,000)과 함께 종료',
       0, 0, 'FIXED', 4.60, 'EQUAL_INSTALLMENT', '2021-06-10', '2026-06-15', 15, 427744, 0, 1, 1,
       '0592: 세무장부 253 원장 「현대캐피탈(87러6814)」 코드 005978 · 원금 418,271~427,371(01~06월). 계약 원금 미상이라 0.'
WHERE NOT EXISTS (SELECT 1 FROM loans WHERE loan_number = '87러6814');

INSERT INTO loans (loan_number, creditor, description, original_amount, current_balance, rate_type, current_rate,
                   repayment_type, start_date, maturity_date, monthly_payment_day, monthly_payment_amount,
                   is_active, maturity_confirmed, entity_id, notes)
SELECT '287모5569', '현대캐피탈', '287모5569 할부 — 2026-06 종료. ★차량이 MES·고정자산 어디에도 없다',
       0, 0, 'FIXED', 4.60, 'EQUAL_INSTALLMENT', '2026-01-15', '2026-06-15', 15, 446341, 0, 1, 1,
       '0592: 세무장부 253 원장 「현대캐피탈(287모5569)」 코드 006013 · 원금 436,456~445,994(01~06월). 차종·소유 확인 필요.'
WHERE NOT EXISTS (SELECT 1 FROM loans WHERE loan_number = '287모5569');

INSERT INTO loans (loan_number, creditor, description, original_amount, current_balance, rate_type, current_rate,
                   repayment_type, start_date, maturity_date, monthly_payment_day, monthly_payment_amount,
                   is_active, maturity_confirmed, entity_id, notes)
SELECT '838버5060', '애드월드 최상호', '838버5060 중고차량 할부 — 개인 간 거래. 납입이 불규칙(3·5·8월)이라 만기 미확정',
       19360000, 15960000, 'FIXED', 0, 'EQUAL_INSTALLMENT', '2026-03-24', '2029-03-24', 26, 600000, 1, 0, 1,
       '0592: 세무장부 208 원장 03-24 「838버5060 차량매각」 애드월드 17,600,000(+VAT=19,360,000) · 253 원장 08-26 「애드월드 최상호(5060 할부금)」 600,000. 통장 실적 2,200,000(3/31)+600,000×2. maturity_confirmed=0.'
WHERE NOT EXISTS (SELECT 1 FROM loans WHERE loan_number = '838버5060');

UPDATE fixed_assets SET loan_id = 12 WHERE id = 5  AND loan_id IS NULL;
UPDATE fixed_assets SET loan_id = 13 WHERE id = 39 AND loan_id IS NULL;
UPDATE fixed_assets SET loan_id = (SELECT id FROM loans WHERE loan_number = '87러6814')  WHERE id = 37 AND loan_id IS NULL;
UPDATE fixed_assets SET loan_id = (SELECT id FROM loans WHERE loan_number = '838버5060') WHERE id = 6  AND loan_id IS NULL;
