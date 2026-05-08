-- ============================================================================
-- Migration 0054: 수금 독촉 이력 테이블 생성
-- ============================================================================

CREATE TABLE IF NOT EXISTS collection_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL REFERENCES clients(id),
    contact_date DATE NOT NULL,
    contact_method TEXT NOT NULL,  -- PHONE, EMAIL, VISIT, OTHER
    contact_person TEXT DEFAULT NULL,
    promised_date DATE DEFAULT NULL,
    promised_amount REAL DEFAULT NULL,
    notes TEXT DEFAULT NULL,
    created_by INTEGER DEFAULT NULL REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_collection_logs_client_id ON collection_logs(client_id);
CREATE INDEX IF NOT EXISTS idx_collection_logs_contact_date ON collection_logs(contact_date);
