-- 0616: cards.equipment_id 인덱스 — 상관 서브쿼리의 cards 전량 스캔 제거
--   장비 목록에서 "장비당 카드 COUNT"(facility.ts:119 · cards/queries.ts:94)는 상관 스칼라 서브쿼리인데
--   cards.equipment_id 인덱스가 없어 EXPLAIN 상 `CORRELATED SCALAR SUBQUERY → SCAN c`,
--   즉 equipment 행마다 cards 전량(2026-09 실측 1,245행)을 훑었다(≈4.1만 rows_read/쿼리, 성장형).
--   (equipment_id, status) 커버링이라 status 조건 COUNT 도 인덱스만으로 끝난다(SCAN→SEARCH). 결과 불변, 실행계획만 개선.
--   ⚠️ 저긴급이지만 cards 가 커질수록 선형 악화 — "지금 빠르다 ≠ 안전하다"(CLAUDE.md §D1 실행계획).
CREATE INDEX IF NOT EXISTS idx_cards_equipment_id ON cards(equipment_id, status);
