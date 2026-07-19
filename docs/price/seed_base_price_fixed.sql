-- 매출 base_price 시드 — FIXED(단위당가) 안정품목만 과거 주문 중앙값 (2026-07-19 최초 prod, 73개)
-- 안전 파라미터: pricing_method='FIXED' · base_price=0(기존 미덮어씀) · 주문 ≥2회 · max/min ≤ 1.5(±50%)
-- 값=중앙값(이상치 저항). AREA(㎡단가)는 개당가 저장 함정+불안정으로 제외(별도 ㎡단가표 필요).
-- 멱등: base_price=0 조건이라 재실행 시 이미 채운 건 제외. 무이력/변동/단발 품목은 미변경(수동).
WITH ranked AS (
  SELECT oi.item_id, oi.unit_price,
    ROW_NUMBER() OVER (PARTITION BY oi.item_id ORDER BY oi.unit_price) rn,
    COUNT(*)    OVER (PARTITION BY oi.item_id) cnt,
    MIN(oi.unit_price) OVER (PARTITION BY oi.item_id) mn,
    MAX(oi.unit_price) OVER (PARTITION BY oi.item_id) mx
  FROM order_items oi JOIN items i ON i.id = oi.item_id
  WHERE i.pricing_method = 'FIXED' AND COALESCE(i.base_price,0) = 0 AND COALESCE(oi.unit_price,0) > 0
),
seed AS (
  SELECT item_id, ROUND(AVG(unit_price)) AS base_price
  FROM ranked
  WHERE rn IN ((cnt+1)/2, (cnt+2)/2)         -- 중앙값(홀수=중앙 1행, 짝수=중앙 2행 평균)
  GROUP BY item_id
  HAVING MAX(cnt) >= 2 AND MAX(mx) * 1.0 / MIN(mn) <= 1.5
)
UPDATE items SET base_price = (SELECT base_price FROM seed WHERE seed.item_id = items.id)
WHERE id IN (SELECT item_id FROM seed);
