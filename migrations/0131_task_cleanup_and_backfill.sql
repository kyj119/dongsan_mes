-- ============================================================================
-- Migration 0131 — Task type cleanup + backfill
-- ----------------------------------------------------------------------------
-- Two changes:
--   1. Drop NAS_UPLOAD and RIP_MONITOR from tasks.type CHECK.
--      Operational review concluded these don't earn their keep:
--        * NAS_UPLOAD is a cheap inline File.Copy; the only failure mode is
--          "Z: drive unmapped" which won't heal by retry.
--        * RIP_MONITOR is a passive FileSystemWatcher / log tail; tasks-based
--          per-card watches add SLA complexity we don't need yet.
--      Keeping them in the CHECK invited confusion when ops saw the types
--      in the UI dropdown but never saw rows.
--   2. Backfill one AI_PROCESS task per CONFIRMED order that has an
--      ai_file_path but no corresponding task row yet. Required because
--      orders created before migration 0016/0017 went out still exist in
--      CONFIRMED state; without a task row the new /tasks UI shows "nothing
--      pending" even though IllustratorAutomat is actively processing them.
-- ============================================================================

-- SQLite (D1) doesn't support DROP CONSTRAINT. Rebuild the table.
-- We also take the opportunity to keep MANUAL for human-created tickets.

CREATE TABLE IF NOT EXISTS tasks_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK(type IN ('AI_PROCESS', 'MANUAL')),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN (
    'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED'
  )),
  order_id INTEGER,
  card_id INTEGER,
  ref_table TEXT,
  ref_id INTEGER,
  input_payload TEXT,
  output_payload TEXT,
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

-- Copy rows that still pass the new CHECK (AI_PROCESS / MANUAL only).
INSERT INTO tasks_new
SELECT * FROM tasks WHERE type IN ('AI_PROCESS', 'MANUAL');

DROP TABLE tasks;
ALTER TABLE tasks_new RENAME TO tasks;

CREATE INDEX IF NOT EXISTS idx_tasks_status_type ON tasks(status, type);
CREATE INDEX IF NOT EXISTS idx_tasks_order ON tasks(order_id);
CREATE INDEX IF NOT EXISTS idx_tasks_card ON tasks(card_id);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);

-- Backfill. NOTE: `created_by` is NULL because we don't have a session user;
-- the API hook in src/routes/orders.ts already populates it for new orders.
INSERT INTO tasks (type, status, order_id, input_payload, created_by, created_at)
SELECT
  'AI_PROCESS',
  'PENDING',
  o.id,
  json_object(
    'order_number', o.order_number,
    'ai_file_path', o.ai_file_path,
    'ai_analysis_id', o.ai_analysis_id,
    'backfilled', 1
  ),
  NULL,
  o.created_at
FROM orders o
WHERE o.status = 'CONFIRMED'
  AND o.ai_file_path IS NOT NULL
  AND o.ai_file_path != ''
  AND NOT EXISTS (
    SELECT 1 FROM tasks t
    WHERE t.order_id = o.id AND t.type = 'AI_PROCESS'
  );
