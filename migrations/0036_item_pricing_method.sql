-- ============================================================================
-- Migration: 0036 - 품목별 단가 계산 방식 (FIXED/AREA)
-- ============================================================================

-- FIXED: 개수 단위 (단가 x 수량)
-- AREA:  면적 단위 (원/m2 x 가로m x 세로m x 수량)

ALTER TABLE items ADD COLUMN pricing_method TEXT DEFAULT 'FIXED' CHECK(pricing_method IN ('FIXED', 'AREA'));
UPDATE items SET pricing_method = 'FIXED' WHERE pricing_method IS NULL;
