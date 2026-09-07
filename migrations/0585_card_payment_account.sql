-- 0585: 카드대금 출금에 **이름을 준다** — 「무시」는 무엇인지 말하지 않는다
--
-- prod 실측 2026-09-07: 계정도 거래처도 없는 668건 중 **306건 18.1억이 `IGNORED`** 였다.
-- IGNORED 는 「다시 묻지 마」라는 처리 **단계**일 뿐이라, 그 안에 자기이체·카드대금·세금·차입이
-- 뒤섞여 있어도 아무 데서도 구분되지 않는다. 카드대금 86건 273,441,771 이 그중 가장 큰 덩어리다.
--
-- ★지금은 **우연히** 안전하다 — 계정이 없어서 손익에 안 들어갈 뿐이다. 누가 이 행에 비용 계정을
--   붙이는 순간 카드 **사용내역**과 이중계상된다(카드 사용액은 이미 판관비로 잡혀 있다).
--   역할 NOT_EXPENSE 인 전용 계정을 주면 붙여도 안전하고, 자금흐름에서 무엇인지도 보인다.
--
-- ★대상은 **적요 완전일치**로만 고른다(LIKE 금지). 카드사 이름이 들어간 출금 중에는
--   **리스·할부 정액분**이 섞여 있고 그건 `리스료`(=차입 원금, 0584 NOT_EXPENSE)가 맞다.
--   금액 편차가 갈라 준다 — 카드 청구는 매달 다르고(고유금액 = 건수), 리스는 한 값만 반복한다:
--     · `비씨카드`      2,332,300 고정 × 8회 → 리스 (이미 6건이 리스료로 분류돼 있었다)
--     · `신한카드할부`    745,630 고정 × 8회 → 할부
--   그래서 이 둘은 카드대금이 아니라 남은 1건씩을 **리스료로** 맞춘다.
-- ★`개인카드결제`(직원 개인카드 사용분 정산)는 진짜 비용이다 — 이미 소모품비·유류비가 붙어 있고,
--   아래 조건이 `matched_category_id IS NULL` 이라 건드리지 않는다.
--
-- 멱등: 계정은 NOT EXISTS, 배정은 `matched_category_id IS NULL` 조건이라 재실행해도 대상이 없다.
-- match_status 는 건드리지 않는다 — 「처리 단계」와 「무엇인가」는 다른 축이고, 여기서 바꾸는 건 후자다.

INSERT INTO expense_categories (name, icon, color, sort_order, is_active, entity_id, role)
SELECT '카드대금', 'fa-credit-card', '#6b7280', 656, 1, e.id, 'NOT_EXPENSE'
  FROM entities e
 WHERE e.id IN (1, 2, 3)
   AND NOT EXISTS (SELECT 1 FROM expense_categories ec WHERE ec.name = '카드대금' AND ec.entity_id = e.id);

UPDATE bank_transactions
SET matched_category_id = (SELECT id FROM expense_categories
                           WHERE name = '카드대금' AND entity_id = bank_transactions.entity_id)
WHERE transaction_type = 'WITHDRAWAL'
  AND matched_category_id IS NULL
  AND counterpart_name IN ('하나카드기업', '하나카드결제', 'JB카드결제7996', 'JB카드결제7988',
                           'JB카드결제9243', '비씨카드출금', 'NH농협카드', 'BC카드선결제')
  AND EXISTS (SELECT 1 FROM expense_categories
              WHERE name = '카드대금' AND entity_id = bank_transactions.entity_id);

-- 리스·할부 정액분 잔여 2건 3,077,930 — 같은 적요의 형제들이 이미 리스료로 분류돼 있다.
UPDATE bank_transactions
SET matched_category_id = (SELECT id FROM expense_categories
                           WHERE name = '리스료' AND entity_id = bank_transactions.entity_id)
WHERE transaction_type = 'WITHDRAWAL'
  AND matched_category_id IS NULL
  AND counterpart_name IN ('비씨카드', '신한카드할부')
  AND EXISTS (SELECT 1 FROM expense_categories
              WHERE name = '리스료' AND entity_id = bank_transactions.entity_id);

-- 부가가치세 납부 1건 18,600,000(E1)이 계정 없이 남아 있었다 — 같은 적요 8건은 전부 `부가세`.
UPDATE bank_transactions
SET matched_category_id = (SELECT id FROM expense_categories
                           WHERE name = '부가세' AND entity_id = bank_transactions.entity_id)
WHERE transaction_type = 'WITHDRAWAL'
  AND matched_category_id IS NULL
  AND counterpart_name LIKE '부가가치세%'
  AND EXISTS (SELECT 1 FROM expense_categories
              WHERE name = '부가세' AND entity_id = bank_transactions.entity_id);
