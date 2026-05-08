-- 0152: entities 테이블에 인감도장(stamp_base64) 컬럼 추가
-- 이미 존재하면 무시 (SQLite는 ADD COLUMN IF NOT EXISTS 미지원이므로 에러 핸들링)

ALTER TABLE entities ADD COLUMN stamp_base64 TEXT;

-- 기존 인감도장을 동산기획(id=1)으로 이관 (이미 값이 있으면 덮어쓰지 않음)
UPDATE entities SET stamp_base64 = (
  SELECT setting_value FROM settings WHERE setting_key = 'company_stamp_base64'
) WHERE id = 1 AND (stamp_base64 IS NULL OR stamp_base64 = '');
