-- 0146: 법인별 설정 테이블
CREATE TABLE IF NOT EXISTS entity_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_id INTEGER NOT NULL REFERENCES entities(id),
  setting_key TEXT NOT NULL,
  setting_value TEXT DEFAULT '',
  UNIQUE(entity_id, setting_key)
);
