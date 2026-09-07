-- 0582: 0581 의 카드 축 누락 보정
--
-- 0581 이 `bank_transactions` 만 고쳤다. 같은 세금 성격이 `card_transactions` 에도 있어
-- 카드 2건 5,649,000(국세 5,035,000 · 지방세 614,000)이 「수도광열비」에 남았다.
-- ★비용 계정은 통장·카드 **두 축 모두**가 참조한다 — 한쪽만 고치면 화면에서 반쯤 맞는다.
--   0578(수수료→지급수수료)은 두 축을 같이 고쳤는데 0581 에서 놓쳤다.
--
-- 멱등: 이름으로 찾아 옮기므로 재실행하면 대상이 없다.

UPDATE card_transactions
SET category_id = (SELECT id FROM expense_categories
                   WHERE name = '부가세' AND entity_id = card_transactions.entity_id)
WHERE category_id IN (SELECT id FROM expense_categories WHERE name = '수도광열비')
  AND (merchant_name LIKE '%부가세%' OR merchant_name LIKE '%부가가치세%')
  AND EXISTS (SELECT 1 FROM expense_categories WHERE name = '부가세' AND entity_id = card_transactions.entity_id);

UPDATE card_transactions
SET category_id = (SELECT id FROM expense_categories
                   WHERE name = '세금과공과' AND entity_id = card_transactions.entity_id)
WHERE category_id IN (SELECT id FROM expense_categories WHERE name = '수도광열비')
  AND (merchant_name LIKE '%지방세%'   OR merchant_name LIKE '%세외수입%'
    OR merchant_name LIKE '%취득세%'   OR merchant_name LIKE '%취등록세%'
    OR merchant_name LIKE '%등록면허세%' OR merchant_name LIKE '%재산세%'
    OR merchant_name LIKE '%자동차세%' OR merchant_name LIKE '%주민세%'
    OR merchant_name LIKE '%소득세%'   OR merchant_name LIKE '%국세%'
    OR merchant_name LIKE '%원천%')
  AND EXISTS (SELECT 1 FROM expense_categories WHERE name = '세금과공과' AND entity_id = card_transactions.entity_id);
