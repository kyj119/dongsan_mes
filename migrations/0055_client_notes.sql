-- ============================================================================
-- Migration 0055: 거래처 메모/히스토리 테이블 생성
-- ============================================================================

CREATE TABLE IF NOT EXISTS client_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL REFERENCES clients(id),
    note_type TEXT NOT NULL DEFAULT 'GENERAL',  -- GENERAL, IMPORTANT, COMPLAINT, FOLLOW_UP
    content TEXT NOT NULL,
    created_by INTEGER DEFAULT NULL REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_client_notes_client ON client_notes(client_id);
CREATE INDEX IF NOT EXISTS idx_client_notes_date ON client_notes(created_at);
