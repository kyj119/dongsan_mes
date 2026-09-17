-- 0617 품목 단위표 (2026-09-17) — spec docs/superpowers/specs/2026-09-17-item-units.md
-- 두 단계 고정(unit/base_unit/pack_size) → N단위 표. 재고·소모·단가는 기본단위 고정.
-- items.unit/base_unit/pack_size 는 표에서 파생되는 호환 열로 남는다(정본=item_units, 동기=utils/itemUnits.ts).
-- 멱등: CREATE IF NOT EXISTS + INSERT OR IGNORE(UNIQUE(item_id, unit)).

CREATE TABLE IF NOT EXISTS item_units (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  unit TEXT NOT NULL,
  factor REAL NOT NULL DEFAULT 1 CHECK (factor > 0),   -- 1 unit = factor × 기본단위
  is_base INTEGER NOT NULL DEFAULT 0,                  -- 품목당 정확히 1행(factor 1)
  role_purchase INTEGER NOT NULL DEFAULT 0,            -- 발주·입고 기본 단위
  role_sales INTEGER NOT NULL DEFAULT 0,               -- 주문서·견적서 기본 단위
  role_count INTEGER NOT NULL DEFAULT 0,               -- 실사 입력(포장) 단위
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(item_id, unit)
);
CREATE INDEX IF NOT EXISTS idx_item_units_item ON item_units(item_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_item_units_base ON item_units(item_id) WHERE is_base = 1;

-- 1) 기본단위 행 — 전 품목. 다단위 쌍(base_unit≠unit AND pack_size>1)이면 base_unit, 아니면 unit.
--    단일단위면 발주·판매·실사 역할이 전부 기본단위 행에 붙는다.
INSERT OR IGNORE INTO item_units (item_id, unit, factor, is_base, role_purchase, role_sales, role_count, sort_order)
SELECT i.id,
       CASE WHEN i.base_unit IS NOT NULL AND i.base_unit <> '' AND i.base_unit <> i.unit AND COALESCE(i.pack_size, 0) > 1
            THEN i.base_unit ELSE COALESCE(NULLIF(i.unit, ''), 'EA') END,
       1, 1,
       CASE WHEN i.base_unit IS NOT NULL AND i.base_unit <> '' AND i.base_unit <> i.unit AND COALESCE(i.pack_size, 0) > 1 THEN 0 ELSE 1 END,
       1,
       CASE WHEN i.base_unit IS NOT NULL AND i.base_unit <> '' AND i.base_unit <> i.unit AND COALESCE(i.pack_size, 0) > 1 THEN 0 ELSE 1 END,
       0
FROM items i;

-- 2) 발주·입고 단위 행 — 다단위 쌍만(시트 롤=50M 등). AQ*(base 없음, pack 130=실사 편의계수)·잉크(base 없음)는 자동 제외.
INSERT OR IGNORE INTO item_units (item_id, unit, factor, is_base, role_purchase, role_sales, role_count, sort_order)
SELECT i.id, i.unit, i.pack_size, 0, 1, 0, 1, 1
FROM items i
WHERE i.base_unit IS NOT NULL AND i.base_unit <> '' AND i.base_unit <> i.unit AND COALESCE(i.pack_size, 0) > 1
  AND i.unit IS NOT NULL AND i.unit <> '';

-- 3) 포맥스 「단」 후보 — 3x6 = 10장 · 4x8 = 5장(용준님 2026-09-17, 3T 기준). 역할은 전부 0 = 표시 후보.
--    사람이 품목 상세에서 계수를 확인하고 「발주·입고」 역할을 켜는 순간에만 items.unit/base_unit/pack_size 가 파생된다.
INSERT OR IGNORE INTO item_units (item_id, unit, factor, is_base, role_purchase, role_sales, role_count, sort_order)
SELECT i.id, '단', CASE i.sheet_spec WHEN '3x6' THEN 10 WHEN '4x8' THEN 5 END, 0, 0, 0, 0, 2
FROM items i
WHERE i.item_code LIKE 'FMX-%' AND i.unit = '장' AND i.sheet_spec IN ('3x6', '4x8')
  AND (i.base_unit IS NULL OR i.base_unit = '');
