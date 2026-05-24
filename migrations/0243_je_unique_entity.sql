-- #166: journal_entries entry_number 글로벌 UNIQUE → 법인별 UNIQUE
-- SQLite는 UNIQUE 제약 변경 불가 → 테이블 재생성

CREATE TABLE IF NOT EXISTS journal_entries_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_number TEXT NOT NULL,
  entry_date DATE NOT NULL,
  description TEXT,
  reference_type TEXT,
  reference_id INTEGER,
  is_auto INTEGER DEFAULT 0,
  entity_id INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(entry_number, entity_id)
);

INSERT OR IGNORE INTO journal_entries_new
  SELECT * FROM journal_entries;

DROP TABLE IF EXISTS journal_entries;
ALTER TABLE journal_entries_new RENAME TO journal_entries;

CREATE INDEX IF NOT EXISTS idx_je_date ON journal_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_je_ref ON journal_entries(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_je_entity ON journal_entries(entity_id);
