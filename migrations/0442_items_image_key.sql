-- 품목 사진 첨부 (T2): items에 R2 사진 키 보관 컬럼 추가 (키 형식: items/photos/{id}_{timestamp}.{ext})
ALTER TABLE items ADD COLUMN image_key TEXT;
