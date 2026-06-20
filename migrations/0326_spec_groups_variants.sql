-- 0326: 규격그룹 → 변종품목 모델 (품목 대개편 Phase 1)
-- spec: docs/superpowers/specs/2026-06-20-spec-group-variant-item-plan.md §2
-- 모델: 규격그룹(호수·판재두께·원단폭) 정의 → 품목+그룹값 조합으로 변종품목 자동생성.
--   변종품목 = 독립 일반품목(재고·단가·통계 per-variant). 그룹 = 생성·묶음·통계용 메타데이터.
-- 비파괴/additive. 값(어떤 품목을 어느 그룹에 넣을지)은 변종생성 단계라 여기 무관.
-- ★적용: db:migrate 추적 드리프트로 execute --remote --file 직접 적용(0322~0325 동일).
-- ★시드는 개별 INSERT(멱등 WHERE NOT EXISTS). UNION ALL 금지 — workerd SQLite
--   "too many terms in compound SELECT" 한도(낮음)에 걸림(검증 시 확인).

-- ── 1. 규격그룹 마스터 (사용자 self-service 관리) ──
CREATE TABLE IF NOT EXISTS spec_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,           -- 판재두께 / 호수 / 원단폭
  unit TEXT,                           -- T / 호 / mm (표시 보조)
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT (datetime('now')),
  updated_at DATETIME DEFAULT (datetime('now'))
);

-- ── 2. 규격그룹 값 (value_code=ascii 불변, label=표시) ──
CREATE TABLE IF NOT EXISTS spec_group_values (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL REFERENCES spec_groups(id) ON DELETE CASCADE,
  value_code TEXT NOT NULL,            -- 5T, 7HO, 4HO1 (품목코드 suffix·하이픈 없음)
  label TEXT NOT NULL,                 -- 5T, 7호, 4-1호 (표시)
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT (datetime('now')),
  UNIQUE(group_id, value_code)
);
CREATE INDEX IF NOT EXISTS idx_spec_group_values_group ON spec_group_values(group_id);

-- ── 3. items 컬럼: 변종 연결 + ECOUNT 교차참조 ──
-- spec_group_id: base 템플릿=생성할 그룹 / 변종품목=소속 그룹. spec_value: 변종값(value_code).
-- item_group(기존 0092)=변종 base명 묶음. ecount_code=레거시 ECOUNT 참조(item_code와 분리).
ALTER TABLE items ADD COLUMN spec_group_id INTEGER REFERENCES spec_groups(id);
ALTER TABLE items ADD COLUMN spec_value TEXT;
ALTER TABLE items ADD COLUMN ecount_code TEXT;
CREATE INDEX IF NOT EXISTS idx_items_spec_group ON items(spec_group_id);
CREATE INDEX IF NOT EXISTS idx_items_ecount_code ON items(ecount_code);

-- ── 4. 그룹 마스터 시드 (확정분만, 멱등 가드=name UNIQUE) ──
INSERT INTO spec_groups (name, unit, sort_order, is_active)
SELECT '판재두께', 'T', 1, 1 WHERE NOT EXISTS (SELECT 1 FROM spec_groups WHERE name='판재두께');
INSERT INTO spec_groups (name, unit, sort_order, is_active)
SELECT '호수', '호', 2, 1 WHERE NOT EXISTS (SELECT 1 FROM spec_groups WHERE name='호수');
INSERT INTO spec_groups (name, unit, sort_order, is_active)
SELECT '원단폭', 'mm', 3, 1 WHERE NOT EXISTS (SELECT 1 FROM spec_groups WHERE name='원단폭');

-- ── 5. 판재두께 값 시드 (확정: 1·2·3·5·8·10T) — 개별 INSERT ──
INSERT INTO spec_group_values (group_id, value_code, label, sort_order, is_active)
SELECT (SELECT id FROM spec_groups WHERE name='판재두께'), '1T', '1T', 1, 1
WHERE NOT EXISTS (SELECT 1 FROM spec_group_values sgv JOIN spec_groups sg ON sgv.group_id=sg.id WHERE sg.name='판재두께' AND sgv.value_code='1T');
INSERT INTO spec_group_values (group_id, value_code, label, sort_order, is_active)
SELECT (SELECT id FROM spec_groups WHERE name='판재두께'), '2T', '2T', 2, 1
WHERE NOT EXISTS (SELECT 1 FROM spec_group_values sgv JOIN spec_groups sg ON sgv.group_id=sg.id WHERE sg.name='판재두께' AND sgv.value_code='2T');
INSERT INTO spec_group_values (group_id, value_code, label, sort_order, is_active)
SELECT (SELECT id FROM spec_groups WHERE name='판재두께'), '3T', '3T', 3, 1
WHERE NOT EXISTS (SELECT 1 FROM spec_group_values sgv JOIN spec_groups sg ON sgv.group_id=sg.id WHERE sg.name='판재두께' AND sgv.value_code='3T');
INSERT INTO spec_group_values (group_id, value_code, label, sort_order, is_active)
SELECT (SELECT id FROM spec_groups WHERE name='판재두께'), '5T', '5T', 4, 1
WHERE NOT EXISTS (SELECT 1 FROM spec_group_values sgv JOIN spec_groups sg ON sgv.group_id=sg.id WHERE sg.name='판재두께' AND sgv.value_code='5T');
INSERT INTO spec_group_values (group_id, value_code, label, sort_order, is_active)
SELECT (SELECT id FROM spec_groups WHERE name='판재두께'), '8T', '8T', 5, 1
WHERE NOT EXISTS (SELECT 1 FROM spec_group_values sgv JOIN spec_groups sg ON sgv.group_id=sg.id WHERE sg.name='판재두께' AND sgv.value_code='8T');
INSERT INTO spec_group_values (group_id, value_code, label, sort_order, is_active)
SELECT (SELECT id FROM spec_groups WHERE name='판재두께'), '10T', '10T', 6, 1
WHERE NOT EXISTS (SELECT 1 FROM spec_group_values sgv JOIN spec_groups sg ON sgv.group_id=sg.id WHERE sg.name='판재두께' AND sgv.value_code='10T');

-- ── 6. 호수 값 시드 (표준 1~10호. 특수 4-1/7-1/8-1·원단폭 값은 규격그룹 관리 페이지에서 추가) ──
INSERT INTO spec_group_values (group_id, value_code, label, sort_order, is_active)
SELECT (SELECT id FROM spec_groups WHERE name='호수'), '1HO', '1호', 1, 1
WHERE NOT EXISTS (SELECT 1 FROM spec_group_values sgv JOIN spec_groups sg ON sgv.group_id=sg.id WHERE sg.name='호수' AND sgv.value_code='1HO');
INSERT INTO spec_group_values (group_id, value_code, label, sort_order, is_active)
SELECT (SELECT id FROM spec_groups WHERE name='호수'), '2HO', '2호', 2, 1
WHERE NOT EXISTS (SELECT 1 FROM spec_group_values sgv JOIN spec_groups sg ON sgv.group_id=sg.id WHERE sg.name='호수' AND sgv.value_code='2HO');
INSERT INTO spec_group_values (group_id, value_code, label, sort_order, is_active)
SELECT (SELECT id FROM spec_groups WHERE name='호수'), '3HO', '3호', 3, 1
WHERE NOT EXISTS (SELECT 1 FROM spec_group_values sgv JOIN spec_groups sg ON sgv.group_id=sg.id WHERE sg.name='호수' AND sgv.value_code='3HO');
INSERT INTO spec_group_values (group_id, value_code, label, sort_order, is_active)
SELECT (SELECT id FROM spec_groups WHERE name='호수'), '4HO', '4호', 4, 1
WHERE NOT EXISTS (SELECT 1 FROM spec_group_values sgv JOIN spec_groups sg ON sgv.group_id=sg.id WHERE sg.name='호수' AND sgv.value_code='4HO');
INSERT INTO spec_group_values (group_id, value_code, label, sort_order, is_active)
SELECT (SELECT id FROM spec_groups WHERE name='호수'), '5HO', '5호', 5, 1
WHERE NOT EXISTS (SELECT 1 FROM spec_group_values sgv JOIN spec_groups sg ON sgv.group_id=sg.id WHERE sg.name='호수' AND sgv.value_code='5HO');
INSERT INTO spec_group_values (group_id, value_code, label, sort_order, is_active)
SELECT (SELECT id FROM spec_groups WHERE name='호수'), '6HO', '6호', 6, 1
WHERE NOT EXISTS (SELECT 1 FROM spec_group_values sgv JOIN spec_groups sg ON sgv.group_id=sg.id WHERE sg.name='호수' AND sgv.value_code='6HO');
INSERT INTO spec_group_values (group_id, value_code, label, sort_order, is_active)
SELECT (SELECT id FROM spec_groups WHERE name='호수'), '7HO', '7호', 7, 1
WHERE NOT EXISTS (SELECT 1 FROM spec_group_values sgv JOIN spec_groups sg ON sgv.group_id=sg.id WHERE sg.name='호수' AND sgv.value_code='7HO');
INSERT INTO spec_group_values (group_id, value_code, label, sort_order, is_active)
SELECT (SELECT id FROM spec_groups WHERE name='호수'), '8HO', '8호', 8, 1
WHERE NOT EXISTS (SELECT 1 FROM spec_group_values sgv JOIN spec_groups sg ON sgv.group_id=sg.id WHERE sg.name='호수' AND sgv.value_code='8HO');
INSERT INTO spec_group_values (group_id, value_code, label, sort_order, is_active)
SELECT (SELECT id FROM spec_groups WHERE name='호수'), '9HO', '9호', 9, 1
WHERE NOT EXISTS (SELECT 1 FROM spec_group_values sgv JOIN spec_groups sg ON sgv.group_id=sg.id WHERE sg.name='호수' AND sgv.value_code='9HO');
INSERT INTO spec_group_values (group_id, value_code, label, sort_order, is_active)
SELECT (SELECT id FROM spec_groups WHERE name='호수'), '10HO', '10호', 10, 1
WHERE NOT EXISTS (SELECT 1 FROM spec_group_values sgv JOIN spec_groups sg ON sgv.group_id=sg.id WHERE sg.name='호수' AND sgv.value_code='10HO');
