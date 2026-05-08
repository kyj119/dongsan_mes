-- 거래처별 카테고리별 단가 할인/할증율
-- rate_percent: 양수=할증, 음수=할인 (예: -10 → 10% 할인)
-- category NULL → 해당 거래처 전체 카테고리 기본 할인율
CREATE TABLE IF NOT EXISTS client_price_rates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  category TEXT,
  rate_percent REAL NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_client_price_rates_unique
  ON client_price_rates(client_id, COALESCE(category, '__ALL__'));

CREATE INDEX IF NOT EXISTS idx_client_price_rates_client
  ON client_price_rates(client_id);
