-- #86: approval_requests entity_id 누락 — 멀티 entity 결재 데이터 격리

ALTER TABLE approval_requests ADD COLUMN entity_id INTEGER NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_ar_entity ON approval_requests(entity_id);

-- 기존 데이터 backfill: requester의 entity 기반
UPDATE approval_requests SET entity_id = COALESCE(
  (SELECT entity_id FROM users WHERE id = approval_requests.requester_id),
  1
);
