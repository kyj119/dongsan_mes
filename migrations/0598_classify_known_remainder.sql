-- 0598: 규칙이 이미 있는데 미처리로 남아 있던 13건을 계정으로 정리
--
-- 이번 세션에 대출계좌·차량할부·카드대금 규칙을 세웠는데, 8월 말~9월에 새로 들어온 거래는
-- 그 규칙이 **스윕에 없거나**(앵커 매칭은 감사에만 있다) 이름이 달라 미처리로 남았다.
-- 근거가 이미 확정된 것만 붙인다.
--
-- ★차량·설비 할부의 월 납입은 **원금+이자가 한 줄**이라 통장만으로는 못 가른다.
--   세무장부는 253 미지급금(원금)과 이자비용으로 나누지만 MES 통장은 한 건이다.
--   → 전액을 `차입금상환`(NOT_EXPENSE)으로 둔다. 이자가 비용에서 빠지지만, 반대로 이자비용에
--     넣으면 **원금이 통째로 비용화**돼 손익이 훨씬 크게 틀린다. 정확한 분리는 통장↔`loan_payments`
--     회차 연결이 있어야 하고(0593 에서 회차별 원금·이자를 이미 만들어 뒀다) 그건 별건이다.
-- ★만기일시 대출(중진공)의 월 납입은 **전액 이자**다(0588 과 같은 판정) → `이자비용`.
-- ★카드 환급 입금은 카드대금의 반대 방향이다 → `카드대금`(NOT_EXPENSE, 입금 허용).
--
-- 멱등: id 지정 + 계정 미지정 조건.

-- ① 차량·설비 할부 원리금 → 차입금상환
UPDATE bank_transactions
SET matched_category_id = (SELECT id FROM expense_categories WHERE name = '차입금상환' AND entity_id = bank_transactions.entity_id),
    match_status = 'APPLIED', match_confidence = 1.0, match_reason = '차량·설비 할부 원리금(원금+이자 한 줄)'
WHERE id IN (31502, 47768, 46179)
  AND matched_category_id IS NULL
  AND EXISTS (SELECT 1 FROM expense_categories WHERE name = '차입금상환' AND entity_id = bank_transactions.entity_id);

-- ② 만기일시 대출 이자 → 이자비용
UPDATE bank_transactions
SET matched_category_id = (SELECT id FROM expense_categories WHERE name = '이자비용' AND entity_id = bank_transactions.entity_id),
    match_status = 'APPLIED', match_confidence = 1.0, match_reason = '중진공 만기일시 대출 이자'
WHERE id IN (40732, 48542)
  AND matched_category_id IS NULL
  AND EXISTS (SELECT 1 FROM expense_categories WHERE name = '이자비용' AND entity_id = bank_transactions.entity_id);

-- ③ 카드 관련 — 청구 출금과 환급 입금 모두 카드대금(NOT_EXPENSE)
UPDATE bank_transactions
SET matched_category_id = (SELECT id FROM expense_categories WHERE name = '카드대금' AND entity_id = bank_transactions.entity_id),
    match_status = 'APPLIED', match_confidence = 1.0, match_reason = '카드 청구·환급'
WHERE id IN (31690, 10080, 9518, 7399)
  AND matched_category_id IS NULL
  AND EXISTS (SELECT 1 FROM expense_categories WHERE name = '카드대금' AND entity_id = bank_transactions.entity_id);

-- ④ 과태료 → 세금과공과
UPDATE bank_transactions
SET matched_category_id = (SELECT id FROM expense_categories WHERE name = '세금과공과' AND entity_id = bank_transactions.entity_id),
    match_status = 'APPLIED', match_confidence = 1.0, match_reason = '차량 과태료'
WHERE id = 33228
  AND matched_category_id IS NULL
  AND EXISTS (SELECT 1 FROM expense_categories WHERE name = '세금과공과' AND entity_id = bank_transactions.entity_id);
