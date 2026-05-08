-- Fix: card_status_history.changed_by FK constraint too strict
-- changed_by를 nullable로 변경하고 FK를 ON DELETE SET NULL로 완화
-- order_status_history도 동일 문제이므로 함께 수정

PRAGMA foreign_keys = OFF;

-- 1. card_status_history 재생성
CREATE TABLE card_status_history_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id INTEGER NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by INTEGER,
  change_reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO card_status_history_new (id, card_id, from_status, to_status, changed_by, change_reason, created_at)
  SELECT id, card_id, from_status, to_status, changed_by, change_reason, created_at
  FROM card_status_history;

DROP TABLE card_status_history;
ALTER TABLE card_status_history_new RENAME TO card_status_history;

CREATE INDEX IF NOT EXISTS idx_card_history_card ON card_status_history(card_id);

-- 2. order_status_history 재생성 (동일 문제)
CREATE TABLE order_status_history_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by INTEGER,
  change_reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO order_status_history_new (id, order_id, from_status, to_status, changed_by, change_reason, created_at)
  SELECT id, order_id, from_status, to_status, changed_by, change_reason, created_at
  FROM order_status_history;

DROP TABLE order_status_history;
ALTER TABLE order_status_history_new RENAME TO order_status_history;

CREATE INDEX IF NOT EXISTS idx_order_history_order ON order_status_history(order_id);

PRAGMA foreign_keys = ON;
