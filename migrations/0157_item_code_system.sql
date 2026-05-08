-- 0157: 품목 코드 체계 + 원자재-소재 연결
-- 1. items에 parent_media_id 추가 (원자재 → 소재 연결)
ALTER TABLE items ADD COLUMN parent_media_id INTEGER REFERENCES print_media(id);

-- 2. items에 code_prefix 추가 (코드 접두사 관리용)
ALTER TABLE items ADD COLUMN code_prefix TEXT;

-- 3. 인덱스
CREATE INDEX IF NOT EXISTS idx_items_parent_media ON items(parent_media_id);
CREATE INDEX IF NOT EXISTS idx_items_code_prefix ON items(code_prefix);
