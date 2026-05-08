-- 0144: 품목 즐겨찾기 기능
ALTER TABLE items ADD COLUMN is_favorite INTEGER DEFAULT 0;
