-- 품목 그룹: 동일 품목의 규격별 변형을 묶어서 관리
-- 예: item_group='솔벤트 미디어' → 914mm, 1270mm, 1524mm 품목이 하나의 그룹
-- NULL이면 기존처럼 개별 품목으로 동작

ALTER TABLE items ADD COLUMN item_group TEXT;

-- 그룹 내 정렬 순서 (폭이 좁은 것부터)
ALTER TABLE items ADD COLUMN group_sort INTEGER DEFAULT 0;

-- 그룹명으로 빠른 조회를 위한 인덱스
CREATE INDEX IF NOT EXISTS idx_items_item_group ON items(item_group);
