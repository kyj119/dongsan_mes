-- 포맥스 원자재: 이름에서 규격(3×6, 4×8) 분리 → specification 컬럼으로 이동
-- 이름 기반 조건 (ID 하드코딩 제거)

-- "3×6" 포함 → 이름에서 제거 + specification = 900x1800
UPDATE items SET
  item_name = REPLACE(REPLACE(item_name, ' 3×6', ''), ' 3x6', ''),
  specification = '900x1800'
WHERE item_type = 'MATERIAL' AND is_active = 1
  AND item_name LIKE '%포맥스%' AND (item_name LIKE '%3×6%' OR item_name LIKE '%3x6%')
  AND specification IS NULL;

-- "4×8" 포함 → 이름에서 제거 + specification = 1200x2400
UPDATE items SET
  item_name = REPLACE(REPLACE(item_name, ' 4×8', ''), ' 4x8', ''),
  specification = '1200x2400'
WHERE item_type = 'MATERIAL' AND is_active = 1
  AND item_name LIKE '%포맥스%' AND (item_name LIKE '%4×8%' OR item_name LIKE '%4x8%')
  AND specification IS NULL;
