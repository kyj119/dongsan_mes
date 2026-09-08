-- 0588: 만기일시 대출의 **이자**가 「차입금상환」에 들어가 손익에서 빠져 있었다
--
-- 통장 적요가 `{대출계좌번호}-{일련번호}` 라는 걸 해독하고 나서야 보였다. `loans.description` 에
-- 계좌번호가 적혀 있어 대조가 된다:
--   `60298020082142-00001` 9건 20,860,648  ↔ #2 하나은행 월납 2,302,191 (계좌 602-980200-82142)
--   `60298020072442-00001` 9건  8,691,935  ↔ #3 월납   959,246
--   `60298020084442-00001` 9건  5,154,212  ↔ #5 월납   569,382
--   `60298018641042-00001` 8건  3,788,282  ↔ #6 월납   481,068
--   `60298020083842-00001` 9건  1,738,385  ↔ #8 월납   191,849
--
-- 다섯 건 모두 `repayment_type='INTEREST_ONLY'` 이고 description 에 **「만기일시(원금 이동 없음)」**
-- 이 적혀 있다. 즉 이 출금은 **전액 이자**인데 `차입금상환`(role NOT_EXPENSE)에 들어가 손익에
-- 잡히지 않았다. MES 이자비용이 3,187,533 뿐이라 세무장부 정본 56,960,000 과 크게 벌어져 있던
-- 원인이 이것이다(나머지 격차는 리스료에 묻힌 이자분 — 별건).
--
-- 회전대출(`60298020073142`, 구매자금대출)도 같이 가른다. 원금과 이자가 금액으로 명확히 갈린다:
--   큰 출금 16건 288,145,937 ↔ 실행 입금 17건 287,684,299 (차이 0.16%) = **원금**, 그대로 둔다
--   소액 75건 5,701,881 (최대 615,325) = **이자**, 큰 건 최소가 8,321,611 이라 간극이 커서
--   100만원 선이 안전하다(추정이 아니라 분포가 갈라 준다)
-- 그 실행 입금 17건 287,684,299 는 계정이 없었다 → `차입금`(실행). 상환이 이미 `차입금상환` 에
-- 있으므로 짝이 맞는다.
--
-- 손익 영향: 영업외비용 +45,935,343 → **영업이익은 불변**, 순이익만 그만큼 정확해진다.
-- 멱등: 대상 계좌·부호·금액대를 명시 조건으로 걸어 재실행해도 같은 집합이다.

-- ① 만기일시 5계좌의 월 납입 = 전액 이자
UPDATE bank_transactions
SET matched_category_id = (SELECT id FROM expense_categories WHERE name = '이자비용' AND entity_id = bank_transactions.entity_id),
    match_status = 'APPLIED', match_confidence = 1.0, match_reason = '만기일시 대출 이자(원금 이동 없음)'
WHERE transaction_type = 'WITHDRAWAL'
  AND (counterpart_name LIKE '60298020082142%' OR counterpart_name LIKE '60298020072442%'
    OR counterpart_name LIKE '60298020084442%' OR counterpart_name LIKE '60298018641042%'
    OR counterpart_name LIKE '60298020083842%')
  AND EXISTS (SELECT 1 FROM expense_categories WHERE name = '이자비용' AND entity_id = bank_transactions.entity_id);

-- ② 회전대출의 소액 = 이자 (원금은 건드리지 않는다)
UPDATE bank_transactions
SET matched_category_id = (SELECT id FROM expense_categories WHERE name = '이자비용' AND entity_id = bank_transactions.entity_id),
    match_status = 'APPLIED', match_confidence = 1.0, match_reason = '회전대출 이자'
WHERE transaction_type = 'WITHDRAWAL'
  AND counterpart_name LIKE '60298020073142-%'
  AND amount < 1000000
  AND EXISTS (SELECT 1 FROM expense_categories WHERE name = '이자비용' AND entity_id = bank_transactions.entity_id);

-- ③ 회전대출 실행 입금 = 차입금
UPDATE bank_transactions
SET matched_category_id = (SELECT id FROM expense_categories WHERE name = '차입금' AND entity_id = bank_transactions.entity_id),
    match_status = 'APPLIED', match_confidence = 1.0, match_reason = '회전대출 실행'
WHERE transaction_type = 'DEPOSIT'
  AND counterpart_name = '60298020073142'
  AND matched_category_id IS NULL
  AND EXISTS (SELECT 1 FROM expense_categories WHERE name = '차입금' AND entity_id = bank_transactions.entity_id);
