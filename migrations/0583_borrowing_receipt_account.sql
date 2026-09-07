-- 0583: 차입금 **실행(수령)** 을 상환과 분리
--
-- 0578 에서 법인2 `대출금` 을 `대출상환` 으로 합치고 0579 에서 `차입금상환` 으로 개칭했는데,
-- 그 안에 **차입 실행(입금) 2건 120,000,000** 이 섞여 있었다(`60298022057942` 7,000만 ·
-- `60298022283142` 5,000만). 「대출금」이라는 옛 이름은 실행과 상환을 둘 다 담을 수 있었지만
-- 「차입금상환」은 방향이 하나다 — 통합의 부작용이고, 겹침 점검에서 「입금인데 비용계정」으로 드러났다.
--
-- ★계정 이름이 방향을 말하면 **반대 방향 거래는 다른 계정이어야 한다**. 같은 계정에 두면
--   합계가 상쇄돼 상환 실적도 차입 실적도 못 읽는다(법인2 상환 1,203만이 차입 1.2억에 묻혔다).
-- ★`차입금` 도 비용이 아니다 → `CAT_ROLE.NOT_EXPENSE` 에 같은 커밋에서 등록한다.
--
-- 부수: 입금 `신화테크택배비포함` 32,670 에 붙어 있던 운반비 제안을 거둔다(입금에 비용계정은 성립하지 않는다).
--
-- 멱등: 이름으로 찾아 옮기므로 재실행하면 대상이 없다.

INSERT INTO expense_categories (name, icon, color, sort_order, is_active, entity_id)
SELECT '차입금', 'fa-hand-holding-dollar', '#6b7280', 655, 1, 2
WHERE NOT EXISTS (SELECT 1 FROM expense_categories WHERE name = '차입금' AND entity_id = 2);

UPDATE bank_transactions
SET matched_category_id = (SELECT id FROM expense_categories
                           WHERE name = '차입금' AND entity_id = bank_transactions.entity_id)
WHERE transaction_type = 'DEPOSIT'
  AND matched_category_id IN (SELECT id FROM expense_categories WHERE name = '차입금상환')
  AND EXISTS (SELECT 1 FROM expense_categories WHERE name = '차입금' AND entity_id = bank_transactions.entity_id);

UPDATE bank_transactions
SET matched_category_id = NULL, match_status = 'UNMATCHED', match_confidence = NULL, match_reason = NULL
WHERE transaction_type = 'DEPOSIT'
  AND matched_category_id IN (SELECT id FROM expense_categories WHERE name = '운반비')
  AND match_status = 'SUGGESTED';
