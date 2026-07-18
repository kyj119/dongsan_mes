-- 0469: 국민연금 기준소득월액 (standard monthly income for national pension)
-- 국민연금공단이 연 1회(7월) 결정하는 고정 기준액. 당월 과세급여와 별개.
-- 설정 시 국민연금 base = pension_base(상하한 클램프), 미설정(NULL) 시 당월 과세급여 사용(기존 동작 유지).
-- 국민연금(근로자+사업주분)에만 적용 — 건강/장기요양/고용은 보수월액(과세급여) 유지.
ALTER TABLE employees ADD COLUMN pension_base INTEGER;
