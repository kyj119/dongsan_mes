-- 0579: 계정과목 명칭을 표준으로 정리 (국세청 표준계정과목 · 일반기업회계기준)
--
-- ■ 왜 이름이 중요한가
--   `CAT_ROLE`(financialReports.ts + scripts/finance-diagnose.cjs 사본 쌍)이 **계정명 문자열**로
--   비용/비용아님을 가르고, 그룹 손익도 이름으로 묶는다. 이름이 곧 역할이라 표기가 흔들리면
--   집계가 흔들린다. 그래서 통용 명칭이 아니라 **표준 명칭 한 벌**로 맞춘다.
--
-- ■ 바꾸는 것 (뜻은 그대로 · 역할 불변)
--   임대료        → 지급임차료     내가 **내는** 것이다(방주원·성낙선 임차료). '임대료'는 받는 것으로 읽힌다
--   공과금        → 수도광열비     내용이 한국전력·수도·도시가스다
--   세금          → 세금과공과     표준계정과목
--   대출상환      → 차입금상환     표준 용어
--   고정자산취득  → 유형자산취득   일반기업회계기준 용어
--   보증금(자산)  → 보증금        괄호 없이도 역할이 CAT_ROLE 로 정해진다
--   공제부금(자산)→ 공제부금       "
--   잡급(일용직)  → 잡급          표준계정과목
--   기타          → 잡비          '기타'는 계정과목이 아니다
--
-- ■ 그대로 두는 것 — 표준의 세부지만 **분리 관리가 이미 정착**했다(합치면 정보가 준다)
--   식대(578건)·유류비(218건)·사무용품비(19건)·4대보험(26건) · 접대비(회계 실무에서 여전히 통용)
--
-- ■ 부수: 원천세 15건 44,132,900 을 `공과금`→`세금과공과`로 옮긴다
--   근로소득세·지방소득세 납부가 수도광열비 성격의 계정에 섞여 있었다. 둘 다 판관비(SGA)라
--   **비용 총액은 변하지 않는다** — 분류만 제자리로 간다.
--   ⚠️통장 `급여`는 **세후 실지급액**이므로(월 7,200~8,900만) 원천세 납부는 이중계상이 아니라
--     인건비의 나머지 부분이다. 비용에서 빼면 인건비가 과소가 된다 — 빼지 않는다.
--
-- 멱등: 이름으로 찾아 이름을 바꾸므로 재실행하면 대상이 없다.

UPDATE expense_categories SET name = '지급임차료'   WHERE name = '임대료';
UPDATE expense_categories SET name = '세금과공과'   WHERE name = '세금';
UPDATE expense_categories SET name = '차입금상환'   WHERE name = '대출상환';
UPDATE expense_categories SET name = '유형자산취득' WHERE name = '고정자산취득';
UPDATE expense_categories SET name = '보증금'       WHERE name = '보증금(자산)';
UPDATE expense_categories SET name = '공제부금'     WHERE name = '공제부금(자산)';
UPDATE expense_categories SET name = '잡급'         WHERE name = '잡급(일용직)';
UPDATE expense_categories SET name = '잡비'         WHERE name = '기타';

-- 원천세를 세금과공과로 옮긴 뒤에 공과금을 개칭한다(순서 의존).
UPDATE bank_transactions
SET matched_category_id = (SELECT id FROM expense_categories
                           WHERE name = '세금과공과' AND entity_id = bank_transactions.entity_id)
WHERE matched_category_id IN (SELECT id FROM expense_categories WHERE name = '공과금')
  AND (counterpart_name LIKE '%근로소득세%' OR counterpart_name LIKE '%지방소득세%'
       OR counterpart_name LIKE '%국세%' OR counterpart_name LIKE '%원천%')
  AND EXISTS (SELECT 1 FROM expense_categories
              WHERE name = '세금과공과' AND entity_id = bank_transactions.entity_id);

UPDATE expense_categories SET name = '수도광열비' WHERE name = '공과금';
