-- 최근 추가한 "현수막" 원자재 → "현수막 2코팅"으로 이름 변경
-- 소재 그룹 "현수막"의 첫 번째 활성 소재로 연결
UPDATE items SET
  item_name = '현수막 2코팅',
  parent_media_id = (
    SELECT id FROM print_media
    WHERE media_group = '현수막' AND is_active = 1
    ORDER BY id ASC LIMIT 1
  )
WHERE item_type = 'MATERIAL' AND item_name = '현수막' AND is_active = 1;

-- 중복 소재 비활성화 (같은 그룹에 2개 이상이면 첫 번째만 남기고 비활성화)
UPDATE print_media SET is_active = 0
WHERE media_group = '현수막' AND is_active = 1
  AND id != (SELECT MIN(id) FROM print_media WHERE media_group = '현수막' AND is_active = 1);
