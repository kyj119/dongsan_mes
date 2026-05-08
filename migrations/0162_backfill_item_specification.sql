-- 기존 원자재: width_mm 값을 specification으로 보정 (specification이 NULL인 경우만)
UPDATE items
SET specification = CAST(width_mm AS TEXT) || 'mm'
WHERE width_mm IS NOT NULL
  AND (specification IS NULL OR specification = '')
  AND item_type = 'MATERIAL';
