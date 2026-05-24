-- #173: cash_schedule에 entity_id 추가
ALTER TABLE cash_schedule ADD COLUMN entity_id INTEGER DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_cash_schedule_entity ON cash_schedule(entity_id);
