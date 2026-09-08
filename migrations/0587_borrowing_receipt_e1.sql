-- 0586: 중소벤처기업진흥공단 차입 **실행** 입금 1억을 차입금 계정으로
--
-- `중진공` 입금 100,000,000(2026-03-27, 법인1)이 계정도 거래처도 없이 UNMATCHED 로 남아 있었다.
-- 추측이 아니라 **대조로 확정**했다 — `loans` #7 「중소벤처기업진흥공단」 원금 100,000,000,
-- 개시일 2026-03-27, entity_id 1. 날짜·금액·법인이 전부 일치한다.
--
-- 법인1에 `차입금`(실행) 계정이 없었다 — 0583 에서 법인2 것만 만들었다. 같은 이유로 필요하다:
-- **계정 이름이 방향을 말하면 반대 방향 거래는 다른 계정이어야 한다**(차입금상환 ≠ 차입금).
-- 역할 NOT_EXPENSE(0584) — 돈이 들어왔지만 수익이 아니고, 손익에 잡히면 안 된다.
--
-- ★입금에 계정을 붙일 수 있는 건 NOT_EXPENSE 뿐이다(엔진·적용 경로 가드, 2026-09-08).
--   비용 역할 계정이었다면 여기서 막힌다.
--
-- 멱등: 계정은 NOT EXISTS, 배정은 id 지정 + `matched_category_id IS NULL` 조건.

INSERT INTO expense_categories (name, icon, color, sort_order, is_active, entity_id, role)
SELECT '차입금', 'fa-hand-holding-dollar', '#6b7280', 655, 1, 1, 'NOT_EXPENSE'
WHERE NOT EXISTS (SELECT 1 FROM expense_categories WHERE name = '차입금' AND entity_id = 1);

UPDATE bank_transactions
SET matched_category_id = (SELECT id FROM expense_categories WHERE name = '차입금' AND entity_id = 1),
    match_status = 'APPLIED', match_confidence = 1.0,
    match_reason = '차입 실행 — loans #7 개시일·금액 일치'
WHERE id = 9474
  AND matched_category_id IS NULL
  AND transaction_date = '20260327' AND amount = 100000000
  AND EXISTS (SELECT 1 FROM expense_categories WHERE name = '차입금' AND entity_id = 1);
