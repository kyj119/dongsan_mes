-- 0614: 견적 라인 규격 텍스트 (2026-09-15)
-- 주문 라인(order_items.specification, 0291)에는 있는데 견적 라인엔 컬럼이 없어, 유통·FIXED 제작품
-- (입간판 800x500x2200 · 아크릴 박스 30*20*15)의 규격이 견적서에 저장되지 않았고 견적→주문 전환에서 소실됐다.
-- 3축 품목은 새 과금축을 만들지 않고 FIXED + 규격 텍스트 1칸이 정본이다.
-- spec = docs/superpowers/specs/2026-09-14-three-axis-and-single-spec-lines.md ①
-- ⚠️ ALTER ADD COLUMN 은 멱등 불가 → prod 1회.
ALTER TABLE quotation_items ADD COLUMN specification TEXT;
