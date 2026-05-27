-- #220: users.email UNIQUE 제약 추가
-- 중복 이메일 없음 확인 완료 (2026-05-26)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users(email) WHERE email IS NOT NULL AND email != '';
