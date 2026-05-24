-- #165: purchase_request_items에 entity_id 추가 (다중 법인 격리)
ALTER TABLE purchase_request_items ADD COLUMN entity_id INTEGER DEFAULT 1;

-- 기존 데이터: 부모 purchase_requests의 entity_id로 백필
UPDATE purchase_request_items SET entity_id = (
  SELECT COALESCE(pr.entity_id, 1)
  FROM purchase_requests pr WHERE pr.id = purchase_request_items.request_id
);

CREATE INDEX IF NOT EXISTS idx_pri_entity ON purchase_request_items(entity_id);
