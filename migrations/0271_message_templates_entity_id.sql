-- 0271: message_templates에 entity_id 추가 (멀티테넌트 격리)
-- Issue #264
ALTER TABLE message_templates ADD COLUMN entity_id INTEGER DEFAULT 1;
