-- 고객 포털 임시 접근 토큰 (알림톡 링크용)
CREATE TABLE IF NOT EXISTS portal_access_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT NOT NULL UNIQUE,
    client_id INTEGER NOT NULL,
    expires_at DATETIME NOT NULL,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_portal_tokens_token ON portal_access_tokens(token);
CREATE INDEX IF NOT EXISTS idx_portal_tokens_expires ON portal_access_tokens(expires_at);
