-- #296: price_change_history 멀티테넌트 격리 — entity_id 추가 + 인덱스
ALTER TABLE price_change_history ADD COLUMN entity_id INTEGER DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_pch_entity ON price_change_history(entity_id);
