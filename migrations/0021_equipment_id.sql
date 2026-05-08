-- 0021: Add equipment_id for RIP PC device tracking
ALTER TABLE agent_heartbeats ADD COLUMN equipment_id TEXT;
ALTER TABLE print_events ADD COLUMN equipment_id TEXT;
CREATE INDEX IF NOT EXISTS idx_print_events_equipment ON print_events(equipment_id);
