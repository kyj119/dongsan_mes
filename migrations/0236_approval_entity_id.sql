-- #139: approval_steps/attachments entity_id 추가
ALTER TABLE approval_steps ADD COLUMN entity_id INTEGER DEFAULT 1;
ALTER TABLE approval_attachments ADD COLUMN entity_id INTEGER DEFAULT 1;

UPDATE approval_steps SET entity_id = (
  SELECT COALESCE(ar.entity_id, 1) FROM approval_requests ar WHERE ar.id = approval_steps.request_id
) WHERE EXISTS (SELECT 1 FROM approval_requests ar WHERE ar.id = approval_steps.request_id);

UPDATE approval_attachments SET entity_id = (
  SELECT COALESCE(ar.entity_id, 1) FROM approval_requests ar WHERE ar.id = approval_attachments.request_id
) WHERE EXISTS (SELECT 1 FROM approval_requests ar WHERE ar.id = approval_attachments.request_id);

CREATE INDEX IF NOT EXISTS idx_as_entity ON approval_steps(entity_id);
CREATE INDEX IF NOT EXISTS idx_aa_entity ON approval_attachments(entity_id);
