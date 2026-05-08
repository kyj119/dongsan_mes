-- 0025: Add equipment_id to cards for RIP PC assignment tracking
ALTER TABLE cards ADD COLUMN equipment_id TEXT DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_cards_equipment_id ON cards(equipment_id);
