-- #286: email_logs 법인 격리 (이메일 발송 이력 법인 간 교차 열람 차단)
ALTER TABLE email_logs ADD COLUMN entity_id INTEGER DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_email_logs_entity ON email_logs(entity_id);
