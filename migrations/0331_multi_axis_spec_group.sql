-- 0331: 다축(multi-axis) 변종 — 품목당 규격그룹 2개 지원 (호수 × 게양방식 등)
-- spec: docs/superpowers/specs/2026-06-20-spec-group-variant-item-plan.md §D2 (2D)
-- 용준님 결정(2026-06-21): 게양방식 = 별도 규격그룹, 호수와 2축 조합.
-- 모델: spec_group_id(축1) + spec_group_id2(축2). 변종 = 축1값 × 축2값 카테시안.
--   변종코드 = {base}-{값1}-{값2} (예: P-0033-7HO-GY = 태극기 7호 게양용).
-- ⚠️ ALTER ADD COLUMN 멱등 불가 → prod 1회만. 시드는 개별 INSERT(멱등).

ALTER TABLE items ADD COLUMN spec_group_id2 INTEGER REFERENCES spec_groups(id);
ALTER TABLE items ADD COLUMN spec_value2 TEXT;
CREATE INDEX IF NOT EXISTS idx_items_spec_group2 ON items(spec_group_id2);

-- 게양방식 규격그룹 (축2 후보)
INSERT INTO spec_groups (name, unit, sort_order, is_active)
SELECT '게양방식', '', 4, 1 WHERE NOT EXISTS (SELECT 1 FROM spec_groups WHERE name='게양방식');

-- 값: 게양용·구게양용·대형·영구용 (value_code=ASCII 불변, label=표시)
INSERT INTO spec_group_values (group_id, value_code, label, sort_order, is_active)
SELECT (SELECT id FROM spec_groups WHERE name='게양방식'), 'GY', '게양용', 1, 1
WHERE NOT EXISTS (SELECT 1 FROM spec_group_values sgv JOIN spec_groups sg ON sgv.group_id=sg.id WHERE sg.name='게양방식' AND sgv.value_code='GY');
INSERT INTO spec_group_values (group_id, value_code, label, sort_order, is_active)
SELECT (SELECT id FROM spec_groups WHERE name='게양방식'), 'GGY', '구게양용', 2, 1
WHERE NOT EXISTS (SELECT 1 FROM spec_group_values sgv JOIN spec_groups sg ON sgv.group_id=sg.id WHERE sg.name='게양방식' AND sgv.value_code='GGY');
INSERT INTO spec_group_values (group_id, value_code, label, sort_order, is_active)
SELECT (SELECT id FROM spec_groups WHERE name='게양방식'), 'DH', '대형', 3, 1
WHERE NOT EXISTS (SELECT 1 FROM spec_group_values sgv JOIN spec_groups sg ON sgv.group_id=sg.id WHERE sg.name='게양방식' AND sgv.value_code='DH');
INSERT INTO spec_group_values (group_id, value_code, label, sort_order, is_active)
SELECT (SELECT id FROM spec_groups WHERE name='게양방식'), 'YG', '영구용', 4, 1
WHERE NOT EXISTS (SELECT 1 FROM spec_group_values sgv JOIN spec_groups sg ON sgv.group_id=sg.id WHERE sg.name='게양방식' AND sgv.value_code='YG');
