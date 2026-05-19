-- #119: fixed_expenses / loans 에 entity_id 추가
ALTER TABLE fixed_expenses ADD COLUMN entity_id INTEGER DEFAULT 1;
ALTER TABLE loans ADD COLUMN entity_id INTEGER DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_fixed_expenses_entity ON fixed_expenses(entity_id);
CREATE INDEX IF NOT EXISTS idx_loans_entity ON loans(entity_id);
