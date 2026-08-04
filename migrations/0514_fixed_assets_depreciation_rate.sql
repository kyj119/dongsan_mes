-- 정률법 상각률을 자산에 명시한다.
-- 기존 DECLINING_BALANCE 분기는 월 상각률을 `2/내용연수(월)`(이중체감법)로 계산했는데,
--   세법 정률법 상각률표(5년 0.451 · 10년 0.259 · 20년 0.109)와 전혀 다른 값이다.
--   세무장부(SmartA 고정자산관리대장 `rt_depre`)와 맞추려면 연 상각률을 그대로 들고 있어야 한다.
--   → docs/dongsan-import/SMARTA_FIXED_ASSETS.md
ALTER TABLE fixed_assets ADD COLUMN depreciation_rate REAL;
