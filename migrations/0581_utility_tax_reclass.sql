-- 0581: 수도광열비에 남아 있던 세금 성격 재분류 (0579 의 누락 보정)
--
-- 0579 에서 `공과금`→`수도광열비` 로 개칭하며 원천세를 세금과공과로 옮겼는데, WHERE 가
-- `근로소득세|지방소득세|국세|원천` 만 잡아 **`지방세`·`세외수입`·`취등록세`·`등록면허세`·
-- `소득세`(대표이사종합·기타·사업)** 를 놓쳤다. 그래서 세금 성격 30건이 「수도광열비」라는
-- 이름 아래 남았다 — 겹침 점검(세금과공과 vs 수도광열비)에서 14% 로 드러났다.
--
-- ★포괄 패턴('%세%')을 쓰지 않는다 — 전기·수도·가스 적요에도 '세'가 들어갈 수 있다.
--   옮길 세목을 **명시적으로 열거**한다. 세금과공과·수도광열비 둘 다 SGA 라 **비용 총액은 불변**이다.
-- ★법인3 에 `세금과공과` 를 신설한다 — 실제 지출(근로소득세 1건)이 있어서 만드는 것이다
--   (「실지출 있는 법인에만」 기준).
--
-- 멱등: 이름으로 찾아 옮기므로 재실행하면 대상이 없다.

INSERT INTO expense_categories (name, icon, color, sort_order, is_active, entity_id)
SELECT '세금과공과', 'fa-file-invoice-dollar', '#6b7280', 820, 1, 3
WHERE NOT EXISTS (SELECT 1 FROM expense_categories WHERE name = '세금과공과' AND entity_id = 3);

-- 부가세는 전용 계정이 따로 있다(비용 아님) → 먼저 빼낸다.
UPDATE bank_transactions
SET matched_category_id = (SELECT id FROM expense_categories
                           WHERE name = '부가세' AND entity_id = bank_transactions.entity_id)
WHERE matched_category_id IN (SELECT id FROM expense_categories WHERE name = '수도광열비')
  AND (counterpart_name LIKE '%부가세%' OR counterpart_name LIKE '%부가가치세%')
  AND EXISTS (SELECT 1 FROM expense_categories WHERE name = '부가세' AND entity_id = bank_transactions.entity_id);

UPDATE bank_transactions
SET matched_category_id = (SELECT id FROM expense_categories
                           WHERE name = '세금과공과' AND entity_id = bank_transactions.entity_id)
WHERE matched_category_id IN (SELECT id FROM expense_categories WHERE name = '수도광열비')
  AND (counterpart_name LIKE '%지방세%'   OR counterpart_name LIKE '%세외수입%'
    OR counterpart_name LIKE '%취득세%'   OR counterpart_name LIKE '%취등록세%'
    OR counterpart_name LIKE '%등록면허세%' OR counterpart_name LIKE '%재산세%'
    OR counterpart_name LIKE '%자동차세%' OR counterpart_name LIKE '%주민세%'
    OR counterpart_name LIKE '%소득세%'   OR counterpart_name LIKE '%국세%'
    OR counterpart_name LIKE '%원천%')
  AND EXISTS (SELECT 1 FROM expense_categories WHERE name = '세금과공과' AND entity_id = bank_transactions.entity_id);
