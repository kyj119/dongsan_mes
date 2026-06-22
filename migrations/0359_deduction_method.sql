-- 0359: 차감방식 구조화 — items.deduction_method(ROLL/BOARD/NONE) + sheet_spec + waste_factor
-- autoDeduct가 자재의 deduction_method를 읽어 공식 적용. 신규 판재=등록+연결만(코드 0).
-- ROLL(기본)=폭매칭+yd / BOARD=면적→장(보드규격 환산·로스율) / NONE=차감안함.
ALTER TABLE items ADD COLUMN deduction_method TEXT DEFAULT 'ROLL';
ALTER TABLE items ADD COLUMN sheet_spec TEXT;          -- 보드규격 '4x8'/'3x6'
ALTER TABLE items ADD COLUMN waste_factor REAL DEFAULT 1.0;
ALTER TABLE inventory_auto_deductions ADD COLUMN deduction_method TEXT DEFAULT 'ROLL';

-- 자작나무 보드 → BOARD (4x8, 로스 1.0=면적정확)
UPDATE items SET deduction_method='BOARD', sheet_spec='4x8', waste_factor=1.0
WHERE item_group='자작나무' AND item_type='MATERIAL';

-- 자작나무 제품 → 동일 두께 보드 연결 (spec 매칭)
INSERT INTO product_materials (product_item_id, material_item_id, is_default)
SELECT p.id, m.id, 0
FROM items p JOIN items m
  ON (m.item_group='자작나무' AND m.item_type='MATERIAL' AND p.specification=m.specification)
WHERE p.item_group='자작나무' AND p.item_type='PRODUCT';
