-- ============================================================================
-- Migration: 0034 - 거래처-품목 매칭 단가 테이블
-- ============================================================================

CREATE TABLE IF NOT EXISTS client_item_prices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  price REAL NOT NULL DEFAULT 0,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
  UNIQUE(client_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_cip_client ON client_item_prices(client_id);
CREATE INDEX IF NOT EXISTS idx_cip_item ON client_item_prices(item_id);
