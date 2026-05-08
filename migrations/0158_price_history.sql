-- 단가 변경 이력 테이블
CREATE TABLE IF NOT EXISTS price_change_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_type TEXT NOT NULL,        -- 'METHOD' | 'MEDIA' | 'ITEM'
  target_id INTEGER NOT NULL,
  target_name TEXT,
  old_price REAL,
  new_price REAL,
  changed_by INTEGER,
  changed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_price_history_target
ON price_change_history(target_type, target_id);
