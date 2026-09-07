-- 0576: 공제부금(자산) 계정 신설 (법인1) + 특허공제 8건 재분류
--
-- 「특허공제」(한국발명진흥회 IP 공제)는 매월 500,000 을 **납입**하고 나중에 찾거나 빌리는 부금이다.
-- 돈은 나가지만 비용이 아니라 **자산**이다. 그런데 27~33회차 7건이 `수수료`(비용)로 들어가 있었고,
-- 법인1 에는 자산성 계정이 **하나도 없었다**(`보증금(자산)`·`고정자산취득` 은 둘 다 법인2 전용) —
-- 계정 마스터가 38종 중 21종 법인별 결번인 문제의 한 사례다.
--
-- ★이름이 곧 역할이다 — `CAT_ROLE`(`financialReports.ts` + `scripts/finance-diagnose.cjs` 사본 쌍)이
--   **계정명 문자열**로 비용/비용아님을 가른다. 그래서 신설과 같은 커밋에서 두 파일의
--   NOT_EXPENSE 에 `공제부금(자산)` 을 넣었다. 안 넣으면 자산 납입이 판관비로 잡힌다.
--
-- 멱등: 같은 이름·법인이 있으면 INSERT 안 함. 재분류는 대상 8건을 이름으로 다시 찾는다.

INSERT INTO expense_categories (name, icon, color, sort_order, is_active, entity_id)
SELECT '공제부금(자산)', 'fa-piggy-bank', '#6b7280', 900, 1, 1
WHERE NOT EXISTS (SELECT 1 FROM expense_categories WHERE name = '공제부금(자산)' AND entity_id = 1);

UPDATE bank_transactions
SET matched_category_id = (SELECT id FROM expense_categories WHERE name = '공제부금(자산)' AND entity_id = 1),
    match_status = 'APPLIED',
    matched_client_id = NULL,
    match_confidence = 1.0,
    match_reason = '공제부금 납입(비용 아님 — 0576)'
WHERE transaction_type = 'WITHDRAWAL'
  AND counterpart_name LIKE '특허공제%'
  AND entity_id = 1;
