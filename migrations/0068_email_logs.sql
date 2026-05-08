-- ============================================================================
-- Migration 0068: 이메일 발송 로그
-- ============================================================================

CREATE TABLE IF NOT EXISTS email_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template TEXT NOT NULL,
    recipient_email TEXT NOT NULL,
    recipient_name TEXT,
    subject TEXT NOT NULL,
    related_type TEXT,
    related_id INTEGER,
    status TEXT DEFAULT 'SENT',
    error_message TEXT,
    sent_by INTEGER REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_email_logs_template ON email_logs(template);
CREATE INDEX IF NOT EXISTS idx_email_logs_related ON email_logs(related_type, related_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_created ON email_logs(created_at);

-- 이메일 설정
INSERT OR IGNORE INTO settings (setting_key, setting_value, description) VALUES
    ('email_enabled', '1', '이메일 발송 활성화'),
    ('email_from_name', '동산현수막', '발신자 이름'),
    ('email_from_address', 'noreply@dongsan.co.kr', '발신자 이메일 주소');
