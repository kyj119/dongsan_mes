-- G1: 고정자산 ↔ 부채(대출·리스) 연결
-- 실사례 = 우리금융캐피탈 케이엠테크 장비 금융리스(소유권 이전 조건).
-- 자산 1건에 부채 1건이 정본 — 공동담보(1:N)는 확인된 사례가 없어 중간테이블을 만들지 않는다(YAGNI).
--   설계 근거 = docs/design/ASSET_LIABILITY_DESIGN.md §G1
ALTER TABLE fixed_assets ADD COLUMN loan_id INTEGER REFERENCES loans(id);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_loan ON fixed_assets(loan_id);
