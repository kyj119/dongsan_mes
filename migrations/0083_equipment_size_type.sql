-- 장비 크기 타입 추가
-- SMALL: 1.8m 폭 장비, LARGE: 3.2m 폭 장비 (기본값)
ALTER TABLE equipment ADD COLUMN size_type TEXT DEFAULT 'LARGE';
