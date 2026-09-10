-- 0607: 후렉스 단가를 **폭 × 17.5원/yd** 규칙으로 맞춘다 (4종)
--
-- 후렉스는 단가가 폭에 정확히 비례한다 — 조명·비조명 26종 중 **21종이 정확히 17.5원/cm/yd** 다:
--   90폭 1,575 · 110폭 1,925 · 130폭 2,275 · 160폭 2,800 · 260폭 4,550 · 320폭 5,600 …
-- 규칙에서 벗어난 값은 그 폭을 **더 넓고 더 싸게** 만들어, 좁은 폭이 영원히 안 뽑히게 한다
-- (폭 휴리스틱은 「들어가는 것 중 금액 최소」다). 0605 는 발주 근거가 없어 남겨 뒀고,
-- 용준님 확인으로 규칙에 맞춘다(2026-09-10).
--
--   FLEXL-250  4,238 → 4,375   (16.95 → 17.5)
--   FLEXN-180  2,880 → 3,150   (16.0  → 17.5)
--   FLEXN-220  3,190 → 3,850   (14.5  → 17.5)
--   FLEXN-250  4,000 → 4,375   (16.0  → 17.5)
--
-- 손대지 않는 것 — `FLEXL-100`(1,750) · `FLEXL-120`(2,100) 은 **등록값이 이미 규칙값**이다.
--   발주에는 각각 1,575·1,920 으로 찍혀 있으나 그 전표의 총액이 90폭·110폭과 **똑같아**
--   품목을 잘못 문 것으로 본다. 발주가 아니라 등록값이 맞다.
--
-- ⚠️ 원가가 오른다 → `scripts/cost-backfill-run.cjs` 로 저장 원가 재계산 필요.
-- 되돌리기: `_bak_0607_flex` 에 원래 값이 있다.

CREATE TABLE IF NOT EXISTS _bak_0607_flex AS
SELECT id, item_code, item_name, width_mm, avg_unit_cost FROM items
 WHERE item_group IN ('조명용 후렉스', '비조명용 후렉스');

UPDATE items SET avg_unit_cost = ROUND(width_mm / 10.0 * 17.5, 2)
 WHERE item_code IN ('FLEXL-250', 'FLEXN-180', 'FLEXN-220', 'FLEXN-250')
   AND width_mm > 0;

-- 검증: 두 그룹 전 품목이 17.5 여야 한다(FLEXL-100·FLEXL-120 포함)
--   SELECT item_code, avg_unit_cost, ROUND(avg_unit_cost/(width_mm/10.0),2) AS 원_cm_yd
--     FROM items WHERE item_group LIKE '%후렉스' AND avg_unit_cost>0 ORDER BY item_group, width_mm;
