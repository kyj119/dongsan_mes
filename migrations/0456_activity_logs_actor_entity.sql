-- #515 (CRITICAL): activity_logs 법인(entity) 격리
-- 기존 entity_id 컬럼은 "감사 대상 레코드의 id"(entity_type과 짝)이지 법인 구분이 아니어서,
-- GET /activity-logs가 MANAGER에게 전 법인 감사로그를 노출하던 구조적 결함을 해소.
-- actor_entity_id = 행위가 발생한 법인(행위자 소속). getEntityId(c) 또는 users.default_entity_id로 채움.

ALTER TABLE activity_logs ADD COLUMN actor_entity_id INTEGER;

-- 기존 행 backfill: 행위자(user_id)의 기본 법인으로 귀속(best-effort).
-- 도출 불가(user_id NULL/시스템 기록)는 NULL 유지 → 필터에서 ADMIN 전체모드만 열람(fail-closed).
UPDATE activity_logs
SET actor_entity_id = (SELECT u.default_entity_id FROM users u WHERE u.id = activity_logs.user_id)
WHERE actor_entity_id IS NULL AND user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_activity_logs_actor_entity ON activity_logs(actor_entity_id, created_at DESC);
