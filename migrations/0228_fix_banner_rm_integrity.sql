-- 현수막 RM 데이터 정합성 수정
-- 1) print_media id=3 (현수막 1코팅) 재활성화 — 21건 active items가 참조 중
UPDATE print_media SET is_active = 1
WHERE id = 3 AND media_group = '현수막';

-- 2) print_media id=4 이름 통일: "현수막" → "현수막 2코팅"
UPDATE print_media SET name = '현수막 2코팅'
WHERE id = 4 AND media_group = '현수막';

-- 3) 현수막 2코팅 items 중 parent_media_id NULL → 4로 수정
UPDATE items SET parent_media_id = 4
WHERE item_type = 'MATERIAL'
  AND item_group = '현수막 2코팅'
  AND parent_media_id IS NULL
  AND is_active = 1;
