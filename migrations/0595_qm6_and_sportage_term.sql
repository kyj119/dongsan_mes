-- 0595: 확인된 것만 반영 — 1389 = QM6 · 8488 스포티지 60개월
--
-- 용준님 확인(2026-09-08): 1389 는 **QM6**, 8488 스포티지는 **60개월 할부**.
--
-- ★60개월이 확정되면 **만기와 납입 예정은 확정**된다 — 2026-08-18 이 1회차이므로 만기 2031-07-18,
--   잔여 59회 × 704,410 = 41,560,190. 총 60회 42,264,600.
-- ★그런데 **할부 원금(대출 실행액)은 모른다**. 취득가 VAT포함 38,971,000 과의 차 3,293,600 이
--   전부 이자인지, 선수금이 있었는지 알 수 없다 → `principal_amount`·`interest_amount` 를 **넣지 않는다**.
--   `total_amount` 만 채운다. 추정한 원금·이자를 넣으면 이자비용이 통째로 틀린다.
-- ★`original_amount` 도 0 으로 둔다 — 하나캐피탈 계약서를 봐야 한다.
--
-- 멱등: 자산명은 조건부 UPDATE, 스케줄은 지우고 다시 넣는다.

UPDATE fixed_assets SET name = 'QM6 [1389]',
  notes = COALESCE(notes,'') || ' | 0595: 차종 QM6 확인(용준님).'
 WHERE asset_code = 'FA-E2-L02' AND name <> 'QM6 [1389]';

UPDATE loans SET maturity_date = '2031-07-18', maturity_confirmed = 1,
  description = '스포티지 8488 할부 — 60개월 · 2026-08 첫 납입',
  notes = COALESCE(notes,'') || ' | 0595: 60개월 확인(용준님) → 만기 2031-07-18. 총 60회 42,264,600. 원금은 여전히 미상이라 회차별 원금·이자는 비워 둔다.'
 WHERE loan_number = '8488';

DELETE FROM loan_payments WHERE loan_id IN (SELECT id FROM loans WHERE loan_number = '8488');

INSERT INTO loan_payments (loan_id, payment_number, scheduled_date, total_amount, status, entity_id) SELECT l.id, 2, '2026-09-18', 704410, 'SCHEDULED', 2 FROM loans l WHERE l.loan_number = '8488';
INSERT INTO loan_payments (loan_id, payment_number, scheduled_date, total_amount, status, entity_id) SELECT l.id, 3, '2026-10-18', 704410, 'SCHEDULED', 2 FROM loans l WHERE l.loan_number = '8488';
INSERT INTO loan_payments (loan_id, payment_number, scheduled_date, total_amount, status, entity_id) SELECT l.id, 4, '2026-11-18', 704410, 'SCHEDULED', 2 FROM loans l WHERE l.loan_number = '8488';
INSERT INTO loan_payments (loan_id, payment_number, scheduled_date, total_amount, status, entity_id) SELECT l.id, 5, '2026-12-18', 704410, 'SCHEDULED', 2 FROM loans l WHERE l.loan_number = '8488';
INSERT INTO loan_payments (loan_id, payment_number, scheduled_date, total_amount, status, entity_id) SELECT l.id, 6, '2027-01-18', 704410, 'SCHEDULED', 2 FROM loans l WHERE l.loan_number = '8488';
INSERT INTO loan_payments (loan_id, payment_number, scheduled_date, total_amount, status, entity_id) SELECT l.id, 7, '2027-02-18', 704410, 'SCHEDULED', 2 FROM loans l WHERE l.loan_number = '8488';
INSERT INTO loan_payments (loan_id, payment_number, scheduled_date, total_amount, status, entity_id) SELECT l.id, 8, '2027-03-18', 704410, 'SCHEDULED', 2 FROM loans l WHERE l.loan_number = '8488';
INSERT INTO loan_payments (loan_id, payment_number, scheduled_date, total_amount, status, entity_id) SELECT l.id, 9, '2027-04-18', 704410, 'SCHEDULED', 2 FROM loans l WHERE l.loan_number = '8488';
INSERT INTO loan_payments (loan_id, payment_number, scheduled_date, total_amount, status, entity_id) SELECT l.id, 10, '2027-05-18', 704410, 'SCHEDULED', 2 FROM loans l WHERE l.loan_number = '8488';
INSERT INTO loan_payments (loan_id, payment_number, scheduled_date, total_amount, status, entity_id) SELECT l.id, 11, '2027-06-18', 704410, 'SCHEDULED', 2 FROM loans l WHERE l.loan_number = '8488';
INSERT INTO loan_payments (loan_id, payment_number, scheduled_date, total_amount, status, entity_id) SELECT l.id, 12, '2027-07-18', 704410, 'SCHEDULED', 2 FROM loans l WHERE l.loan_number = '8488';
INSERT INTO loan_payments (loan_id, payment_number, scheduled_date, total_amount, status, entity_id) SELECT l.id, 13, '2027-08-18', 704410, 'SCHEDULED', 2 FROM loans l WHERE l.loan_number = '8488';
INSERT INTO loan_payments (loan_id, payment_number, scheduled_date, total_amount, status, entity_id) SELECT l.id, 14, '2027-09-18', 704410, 'SCHEDULED', 2 FROM loans l WHERE l.loan_number = '8488';
INSERT INTO loan_payments (loan_id, payment_number, scheduled_date, total_amount, status, entity_id) SELECT l.id, 15, '2027-10-18', 704410, 'SCHEDULED', 2 FROM loans l WHERE l.loan_number = '8488';
INSERT INTO loan_payments (loan_id, payment_number, scheduled_date, total_amount, status, entity_id) SELECT l.id, 16, '2027-11-18', 704410, 'SCHEDULED', 2 FROM loans l WHERE l.loan_number = '8488';
INSERT INTO loan_payments (loan_id, payment_number, scheduled_date, total_amount, status, entity_id) SELECT l.id, 17, '2027-12-18', 704410, 'SCHEDULED', 2 FROM loans l WHERE l.loan_number = '8488';
INSERT INTO loan_payments (loan_id, payment_number, scheduled_date, total_amount, status, entity_id) SELECT l.id, 18, '2028-01-18', 704410, 'SCHEDULED', 2 FROM loans l WHERE l.loan_number = '8488';
INSERT INTO loan_payments (loan_id, payment_number, scheduled_date, total_amount, status, entity_id) SELECT l.id, 19, '2028-02-18', 704410, 'SCHEDULED', 2 FROM loans l WHERE l.loan_number = '8488';
INSERT INTO loan_payments (loan_id, payment_number, scheduled_date, total_amount, status, entity_id) SELECT l.id, 20, '2028-03-18', 704410, 'SCHEDULED', 2 FROM loans l WHERE l.loan_number = '8488';
INSERT INTO loan_payments (loan_id, payment_number, scheduled_date, total_amount, status, entity_id) SELECT l.id, 21, '2028-04-18', 704410, 'SCHEDULED', 2 FROM loans l WHERE l.loan_number = '8488';
INSERT INTO loan_payments (loan_id, payment_number, scheduled_date, total_amount, status, entity_id) SELECT l.id, 22, '2028-05-18', 704410, 'SCHEDULED', 2 FROM loans l WHERE l.loan_number = '8488';
INSERT INTO loan_payments (loan_id, payment_number, scheduled_date, total_amount, status, entity_id) SELECT l.id, 23, '2028-06-18', 704410, 'SCHEDULED', 2 FROM loans l WHERE l.loan_number = '8488';
INSERT INTO loan_payments (loan_id, payment_number, scheduled_date, total_amount, status, entity_id) SELECT l.id, 24, '2028-07-18', 704410, 'SCHEDULED', 2 FROM loans l WHERE l.loan_number = '8488';
INSERT INTO loan_payments (loan_id, payment_number, scheduled_date, total_amount, status, entity_id) SELECT l.id, 25, '2028-08-18', 704410, 'SCHEDULED', 2 FROM loans l WHERE l.loan_number = '8488';
INSERT INTO loan_payments (loan_id, payment_number, scheduled_date, total_amount, status, entity_id) SELECT l.id, 26, '2028-09-18', 704410, 'SCHEDULED', 2 FROM loans l WHERE l.loan_number = '8488';
INSERT INTO loan_payments (loan_id, payment_number, scheduled_date, total_amount, status, entity_id) SELECT l.id, 27, '2028-10-18', 704410, 'SCHEDULED', 2 FROM loans l WHERE l.loan_number = '8488';
INSERT INTO loan_payments (loan_id, payment_number, scheduled_date, total_amount, status, entity_id) SELECT l.id, 28, '2028-11-18', 704410, 'SCHEDULED', 2 FROM loans l WHERE l.loan_number = '8488';
INSERT INTO loan_payments (loan_id, payment_number, scheduled_date, total_amount, status, entity_id) SELECT l.id, 29, '2028-12-18', 704410, 'SCHEDULED', 2 FROM loans l WHERE l.loan_number = '8488';
INSERT INTO loan_payments (loan_id, payment_number, scheduled_date, total_amount, status, entity_id) SELECT l.id, 30, '2029-01-18', 704410, 'SCHEDULED', 2 FROM loans l WHERE l.loan_number = '8488';
INSERT INTO loan_payments (loan_id, payment_number, scheduled_date, total_amount, status, entity_id) SELECT l.id, 31, '2029-02-18', 704410, 'SCHEDULED', 2 FROM loans l WHERE l.loan_number = '8488';
INSERT INTO loan_payments (loan_id, payment_number, scheduled_date, total_amount, status, entity_id) SELECT l.id, 32, '2029-03-18', 704410, 'SCHEDULED', 2 FROM loans l WHERE l.loan_number = '8488';
INSERT INTO loan_payments (loan_id, payment_number, scheduled_date, total_amount, status, entity_id) SELECT l.id, 33, '2029-04-18', 704410, 'SCHEDULED', 2 FROM loans l WHERE l.loan_number = '8488';
INSERT INTO loan_payments (loan_id, payment_number, scheduled_date, total_amount, status, entity_id) SELECT l.id, 34, '2029-05-18', 704410, 'SCHEDULED', 2 FROM loans l WHERE l.loan_number = '8488';
INSERT INTO loan_payments (loan_id, payment_number, scheduled_date, total_amount, status, entity_id) SELECT l.id, 35, '2029-06-18', 704410, 'SCHEDULED', 2 FROM loans l WHERE l.loan_number = '8488';
INSERT INTO loan_payments (loan_id, payment_number, scheduled_date, total_amount, status, entity_id) SELECT l.id, 36, '2029-07-18', 704410, 'SCHEDULED', 2 FROM loans l WHERE l.loan_number = '8488';
INSERT INTO loan_payments (loan_id, payment_number, scheduled_date, total_amount, status, entity_id) SELECT l.id, 37, '2029-08-18', 704410, 'SCHEDULED', 2 FROM loans l WHERE l.loan_number = '8488';
INSERT INTO loan_payments (loan_id, payment_number, scheduled_date, total_amount, status, entity_id) SELECT l.id, 38, '2029-09-18', 704410, 'SCHEDULED', 2 FROM loans l WHERE l.loan_number = '8488';
INSERT INTO loan_payments (loan_id, payment_number, scheduled_date, total_amount, status, entity_id) SELECT l.id, 39, '2029-10-18', 704410, 'SCHEDULED', 2 FROM loans l WHERE l.loan_number = '8488';
INSERT INTO loan_payments (loan_id, payment_number, scheduled_date, total_amount, status, entity_id) SELECT l.id, 40, '2029-11-18', 704410, 'SCHEDULED', 2 FROM loans l WHERE l.loan_number = '8488';
INSERT INTO loan_payments (loan_id, payment_number, scheduled_date, total_amount, status, entity_id) SELECT l.id, 41, '2029-12-18', 704410, 'SCHEDULED', 2 FROM loans l WHERE l.loan_number = '8488';
INSERT INTO loan_payments (loan_id, payment_number, scheduled_date, total_amount, status, entity_id) SELECT l.id, 42, '2030-01-18', 704410, 'SCHEDULED', 2 FROM loans l WHERE l.loan_number = '8488';
INSERT INTO loan_payments (loan_id, payment_number, scheduled_date, total_amount, status, entity_id) SELECT l.id, 43, '2030-02-18', 704410, 'SCHEDULED', 2 FROM loans l WHERE l.loan_number = '8488';
INSERT INTO loan_payments (loan_id, payment_number, scheduled_date, total_amount, status, entity_id) SELECT l.id, 44, '2030-03-18', 704410, 'SCHEDULED', 2 FROM loans l WHERE l.loan_number = '8488';
INSERT INTO loan_payments (loan_id, payment_number, scheduled_date, total_amount, status, entity_id) SELECT l.id, 45, '2030-04-18', 704410, 'SCHEDULED', 2 FROM loans l WHERE l.loan_number = '8488';
INSERT INTO loan_payments (loan_id, payment_number, scheduled_date, total_amount, status, entity_id) SELECT l.id, 46, '2030-05-18', 704410, 'SCHEDULED', 2 FROM loans l WHERE l.loan_number = '8488';
INSERT INTO loan_payments (loan_id, payment_number, scheduled_date, total_amount, status, entity_id) SELECT l.id, 47, '2030-06-18', 704410, 'SCHEDULED', 2 FROM loans l WHERE l.loan_number = '8488';
INSERT INTO loan_payments (loan_id, payment_number, scheduled_date, total_amount, status, entity_id) SELECT l.id, 48, '2030-07-18', 704410, 'SCHEDULED', 2 FROM loans l WHERE l.loan_number = '8488';
INSERT INTO loan_payments (loan_id, payment_number, scheduled_date, total_amount, status, entity_id) SELECT l.id, 49, '2030-08-18', 704410, 'SCHEDULED', 2 FROM loans l WHERE l.loan_number = '8488';
INSERT INTO loan_payments (loan_id, payment_number, scheduled_date, total_amount, status, entity_id) SELECT l.id, 50, '2030-09-18', 704410, 'SCHEDULED', 2 FROM loans l WHERE l.loan_number = '8488';
INSERT INTO loan_payments (loan_id, payment_number, scheduled_date, total_amount, status, entity_id) SELECT l.id, 51, '2030-10-18', 704410, 'SCHEDULED', 2 FROM loans l WHERE l.loan_number = '8488';
INSERT INTO loan_payments (loan_id, payment_number, scheduled_date, total_amount, status, entity_id) SELECT l.id, 52, '2030-11-18', 704410, 'SCHEDULED', 2 FROM loans l WHERE l.loan_number = '8488';
INSERT INTO loan_payments (loan_id, payment_number, scheduled_date, total_amount, status, entity_id) SELECT l.id, 53, '2030-12-18', 704410, 'SCHEDULED', 2 FROM loans l WHERE l.loan_number = '8488';
INSERT INTO loan_payments (loan_id, payment_number, scheduled_date, total_amount, status, entity_id) SELECT l.id, 54, '2031-01-18', 704410, 'SCHEDULED', 2 FROM loans l WHERE l.loan_number = '8488';
INSERT INTO loan_payments (loan_id, payment_number, scheduled_date, total_amount, status, entity_id) SELECT l.id, 55, '2031-02-18', 704410, 'SCHEDULED', 2 FROM loans l WHERE l.loan_number = '8488';
INSERT INTO loan_payments (loan_id, payment_number, scheduled_date, total_amount, status, entity_id) SELECT l.id, 56, '2031-03-18', 704410, 'SCHEDULED', 2 FROM loans l WHERE l.loan_number = '8488';
INSERT INTO loan_payments (loan_id, payment_number, scheduled_date, total_amount, status, entity_id) SELECT l.id, 57, '2031-04-18', 704410, 'SCHEDULED', 2 FROM loans l WHERE l.loan_number = '8488';
INSERT INTO loan_payments (loan_id, payment_number, scheduled_date, total_amount, status, entity_id) SELECT l.id, 58, '2031-05-18', 704410, 'SCHEDULED', 2 FROM loans l WHERE l.loan_number = '8488';
INSERT INTO loan_payments (loan_id, payment_number, scheduled_date, total_amount, status, entity_id) SELECT l.id, 59, '2031-06-18', 704410, 'SCHEDULED', 2 FROM loans l WHERE l.loan_number = '8488';
INSERT INTO loan_payments (loan_id, payment_number, scheduled_date, total_amount, status, entity_id) SELECT l.id, 60, '2031-07-18', 704410, 'SCHEDULED', 2 FROM loans l WHERE l.loan_number = '8488';
