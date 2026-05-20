-- #131: depreciation_records entity_id 누락
ALTER TABLE depreciation_records ADD COLUMN entity_id INTEGER DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_depr_entity ON depreciation_records(entity_id);

-- 기존 레코드 entity_id 채우기 (parent asset 기준)
UPDATE depreciation_records SET entity_id = (
  SELECT fa.entity_id FROM fixed_assets fa WHERE fa.id = depreciation_records.asset_id
) WHERE entity_id = 1;
