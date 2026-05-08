-- Print events from LogWatcher agents on RIP PCs
CREATE TABLE IF NOT EXISTS print_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  card_number TEXT,
  card_id INTEGER,
  order_number TEXT,
  file_path TEXT NOT NULL,
  file_name TEXT,
  printer_name TEXT,
  print_status TEXT NOT NULL,
  print_started_at TEXT,
  print_completed_at TEXT,
  output_width TEXT,
  output_height TEXT,
  dpi TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(file_path, print_completed_at)
);

CREATE INDEX IF NOT EXISTS idx_print_events_agent ON print_events(agent_id);
CREATE INDEX IF NOT EXISTS idx_print_events_status ON print_events(print_status);
CREATE INDEX IF NOT EXISTS idx_print_events_card ON print_events(card_number);
CREATE INDEX IF NOT EXISTS idx_print_events_created ON print_events(created_at);

-- Agent heartbeat tracking
CREATE TABLE IF NOT EXISTS agent_heartbeats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL UNIQUE,
  agent_version TEXT,
  ip_address TEXT,
  last_seen_at DATETIME,
  print_log_path TEXT,
  status TEXT DEFAULT 'online',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
