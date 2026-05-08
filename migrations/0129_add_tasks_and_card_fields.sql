-- ============================================================================
-- Migration 0129 — Task Manager + card status hardening
-- ----------------------------------------------------------------------------
-- Adds the generic automation `tasks` table (Step 4 roadmap, WORKFLOW_PROPOSAL §C)
-- plus the server-side pieces the Windows agents need:
--   * `cards.rip_file_path` — EdgeAgent reports the actual RIP file path when
--     it flips PRINTING / PRINT_DONE / PRINT_ERROR.
--   * `PRINT_ERROR` is recognised by the API handler (no CHECK constraint on
--     cards.status exists today so no DDL needed beyond the handler update).
-- ============================================================================

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK(type IN (
    'AI_PROCESS',     -- IllustratorAutomat: run JSX, produce EPS
    'NAS_UPLOAD',     -- Copy EPS to Z:\orders\{cat}\{y}\{m}\{order}\
    'RIP_MONITOR',    -- EdgeAgent: watch Preview/Print.log for a specific card
    'MANUAL'          -- Human follow-up needed
  )),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN (
    'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED'
  )),
  order_id INTEGER,
  card_id INTEGER,
  ref_table TEXT,           -- Optional: e.g. 'ai_analysis_requests'
  ref_id INTEGER,           -- Optional: FK into ref_table
  input_payload TEXT,       -- JSON
  output_payload TEXT,      -- JSON
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  last_attempt_at DATETIME,
  started_at DATETIME,
  completed_at DATETIME,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
  FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_status_type ON tasks(status, type);
CREATE INDEX IF NOT EXISTS idx_tasks_order ON tasks(order_id);
CREATE INDEX IF NOT EXISTS idx_tasks_card ON tasks(card_id);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);

-- EdgeAgent writes rip_file_path when it observes a Preview/Job/Print.log event.
-- Schema is flat SQLite so `ALTER ADD COLUMN` is safe (no-op on re-run via IF).
-- D1 doesn't accept `IF NOT EXISTS` on ADD COLUMN; migration is run once per env.
ALTER TABLE cards ADD COLUMN rip_file_path TEXT;
