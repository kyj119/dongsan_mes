-- 2026 생산장비 등록 롤백 (2026-08-07)

DELETE FROM depreciation_records WHERE asset_id = (SELECT id FROM fixed_assets WHERE asset_code='FA-2026-007');
DELETE FROM fixed_assets WHERE asset_code='FA-2026-007';
DELETE FROM depreciation_records WHERE asset_id = (SELECT id FROM fixed_assets WHERE asset_code='FA-2026-008');
DELETE FROM fixed_assets WHERE asset_code='FA-2026-008';
DELETE FROM depreciation_records WHERE asset_id = (SELECT id FROM fixed_assets WHERE asset_code='FA-2026-009');
DELETE FROM fixed_assets WHERE asset_code='FA-2026-009';
