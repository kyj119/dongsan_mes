-- ============================================================================
-- Migration 0259: 전사/태극기 품목 코드 체계 수정
-- TF-xxx → PM-5xxx(전사), PM-6xxx(태극기)
-- 태극기 category '전사' → '태극기' 변경
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. 전사 품목: TF-1xx~9xx → PM-5xxx
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE items SET item_code = 'PM-5001' WHERE item_code = 'TF-101';
UPDATE items SET item_code = 'PM-5002' WHERE item_code = 'TF-102';
UPDATE items SET item_code = 'PM-5003' WHERE item_code = 'TF-201';
UPDATE items SET item_code = 'PM-5004' WHERE item_code = 'TF-202';
UPDATE items SET item_code = 'PM-5005' WHERE item_code = 'TF-301';
UPDATE items SET item_code = 'PM-5006' WHERE item_code = 'TF-302';
UPDATE items SET item_code = 'PM-5007' WHERE item_code = 'TF-303';
UPDATE items SET item_code = 'PM-5008' WHERE item_code = 'TF-401';
UPDATE items SET item_code = 'PM-5009' WHERE item_code = 'TF-402';
UPDATE items SET item_code = 'PM-5010' WHERE item_code = 'TF-501';
UPDATE items SET item_code = 'PM-5011' WHERE item_code = 'TF-502';
UPDATE items SET item_code = 'PM-5012' WHERE item_code = 'TF-601';
UPDATE items SET item_code = 'PM-5013' WHERE item_code = 'TF-701';
UPDATE items SET item_code = 'PM-5014' WHERE item_code = 'TF-801';
UPDATE items SET item_code = 'PM-5015' WHERE item_code = 'TF-901';
UPDATE items SET item_code = 'PM-5016' WHERE item_code = 'TF-902';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. 태극기: TF-01x → PM-6xxx + category 변경
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE items SET item_code = 'PM-6001', category = '태극기' WHERE item_code = 'TF-011';
UPDATE items SET item_code = 'PM-6002', category = '태극기' WHERE item_code = 'TF-012';
UPDATE items SET item_code = 'PM-6003', category = '태극기' WHERE item_code = 'TF-013';
UPDATE items SET item_code = 'PM-6004', category = '태극기' WHERE item_code = 'TF-014';
UPDATE items SET item_code = 'PM-6005', category = '태극기' WHERE item_code = 'TF-015';
UPDATE items SET item_code = 'PM-6006', category = '태극기' WHERE item_code = 'TF-016';
UPDATE items SET item_code = 'PM-6007', category = '태극기' WHERE item_code = 'TF-017';
UPDATE items SET item_code = 'PM-6008', category = '태극기', sub_category = '태극기' WHERE item_code = 'TF-018';
