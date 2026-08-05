-- 작업지시서 자동 발행·관리 (2026-08-05 work-order-auto-issue)
-- 카드=작업지시서 승격: 현장 진행 체크리스트 + 개정필요 플래그
-- spec: docs/superpowers/specs/2026-08-05-work-order-auto-issue.md

CREATE TABLE IF NOT EXISTS card_checklist_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  step_code TEXT NOT NULL,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'AUTO',
  checked_by INTEGER,
  checked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ccl_card ON card_checklist_items(card_id);

ALTER TABLE cards ADD COLUMN needs_reissue INTEGER NOT NULL DEFAULT 0;
