-- 0395: 자재 다중단위(multi-UOM) 인프라 P1 — 2026-06-27
-- spec: docs/superpowers/specs/2026-06-27-multi-uom-inventory.md
-- 3단위(unit=관리 / base_unit=차감·저장 / pack_size=환산) + stock_mode(PACK|CONTINUOUS)
-- ⚠️ ALTER ADD COLUMN은 멱등 아님 — 1회만 적용. 재적용 금지.

-- ── items: 다중단위 컬럼 ──
ALTER TABLE items ADD COLUMN base_unit TEXT;        -- 차감·저장 정밀단위(L/cm/yd/EA). NULL=unit과 동일
ALTER TABLE items ADD COLUMN pack_size REAL;        -- 1 unit(관리) = pack_size base_unit. NULL=1
ALTER TABLE items ADD COLUMN stock_mode TEXT DEFAULT 'CONTINUOUS';  -- PACK(미개봉개수,개봉=소모) | CONTINUOUS(연속 base)

-- ── 차감 이력: base 단위 차감량(cm 등) ──
ALTER TABLE inventory_auto_deductions ADD COLUMN deducted_base REAL;

-- ── 입고: 단위 스냅샷(어느 단위로 받았는지) ──
ALTER TABLE inventory_receipt_items ADD COLUMN unit TEXT;

-- ── 잉크 통 전환 (개봉=소모, PACK). pack_size(통용량)는 브랜드/장비별 상이 → 운영 입력 ──
UPDATE items SET unit = '통', base_unit = 'L', stock_mode = 'PACK'
 WHERE item_code LIKE 'RM-I%';
