-- ============================================================================
-- Migration 0069: 미수금 독촉 이력
-- ============================================================================

CREATE TABLE IF NOT EXISTS collection_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL REFERENCES clients(id),
    contact_method TEXT NOT NULL,
    contact_date TEXT NOT NULL,
    amount_requested REAL,
    promised_date TEXT,
    promised_amount REAL,
    notes TEXT,
    result TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_collection_logs_client ON collection_logs(client_id);
CREATE INDEX IF NOT EXISTS idx_collection_logs_date ON collection_logs(contact_date);
