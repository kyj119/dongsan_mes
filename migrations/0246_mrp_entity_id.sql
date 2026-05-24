-- #174: mrp_runs/mrp_results에 entity_id 추가
ALTER TABLE mrp_runs ADD COLUMN entity_id INTEGER DEFAULT 1;
ALTER TABLE mrp_results ADD COLUMN entity_id INTEGER DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_mrp_runs_entity ON mrp_runs(entity_id);
