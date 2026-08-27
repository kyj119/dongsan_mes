-- ============================================================================
-- 2026-08-27 (2) 환봉나무 25파이 신설 + 재고단위 라벨 재정리 409건
-- ============================================================================
--
-- ── 1. 환봉나무 25파이 ──────────────────────────────────────────────────────
-- `E1-PO-3860-20260421` 105,000 의 원본 품명이 「환봉나무25」였다.
-- 용준님 확인(2026-08-27): **25파이 = 굵기가 두꺼운 품목**.
--
-- ★규격 축이 형제와 다르다 — `-90`·`-70` 은 **길이**, `-25P` 는 **굵기**다.
--   원장 품명이 그렇게만 적혀 있어 아는 만큼만 넣는다. 나중에 길이·굵기가 다 나오면
--   그때 두 축을 채운다. (지금 없는 축을 추측해 넣으면 그게 정본이 돼 버린다.)
--
-- ⚠️수량 750 은 **역산이다** — 105,000 ÷ 140. 원장 라인을 못 받았다.
--   단가 140 은 같은 달 04-03 전표로 확증됐지만, 이 전표가 순수 환봉인지는 미확인이다.
--   `notes` 에 역산임을 남겨 두었다. 원장이 나오면 그걸로 덮어쓸 것.
--
-- ── 2. 재고단위 라벨 재정리 ────────────────────────────────────────────────
-- **증상**: 개수로 세는 품목이 재고 화면·실사표에 **`yd`** 로 표시된다.
-- **원인**: `items.deduction_method` 의 DB 기본값이 `'ROLL'` 이라 지정하지 않고 만든 품목에
--   전부 흘러들었고, `resolveStockUnit` 이 base_unit 없는 ROLL 을 `yd` 로 떨어뜨린다
--   (`src/utils/rollConsumption.ts:98`).
--
--   | 현재 | 건수 | 지금 라벨 | 고친 뒤 |
--   |---|---|---|---|
--   | ROLL · unit=EA · base_unit 없음 | 370 | `yd` ❌ | `EA` |
--   | ROLL · unit=장 · base_unit 없음 |  39 | `yd` ❌ | `장` |
--
-- **왜 NONE 인가 — 동작 변화가 0이기 때문이다.**
--   ROLL 차감은 `deduction_method='ROLL' AND width_mm != null` 로 걸러진다
--   (`autoDeductInventory.ts:139` · `materialRequirement.ts:128`). 위 409건은 **전부 `width_mm` 이 NULL** 이라
--   이미 ROLL 분기에 못 들어간다 — 즉 ROLL 설정이 **무효**였고, 유일한 효과가 틀린 라벨이었다.
--   NONE 으로 내리면 `resolveStockUnit` 이 `unit` 을 그대로 쓰므로 라벨만 맞아지고 계산은 그대로다.
--
-- ⛔**39건 판재를 BOARD 로 올리지 않는다** — 라벨만 보면 BOARD 가 맞아 보이지만,
--   39건 전부 `sheet_spec` 이 비어 있고 `BOARD_AREA_SQM[...] || '4x8'` 로 폴백한다
--   (`autoDeductInventory.ts:137,164`). 코드가 `-36`(3x6=1.674㎡)·`-48`(4x8=2.977㎡) 로 갈리는데
--   전부 4x8 로 계산되면 **-36 계열이 78% 과소차감**된다. 게다가 BOM 에 걸린 20건이
--   **지금은 무차감**인데 갑자기 차감이 시작된다. → `sheet_spec` 을 먼저 채우는 별도 건이다.
--
-- ★진짜 롤 자재가 이 안에 섞여 있다(`CLEAR-RM-127` 30M · `KEL-SV50-127` 50M · `HJ-YMSIDE50-P127`).
--   그건 3층 구조(unit=롤 / base_unit=M / pack_size)로 올려야 할 이관 대상이지
--   ROLL 플래그만으로는 아무것도 안 된다. 백업 테이블에 원래 값이 남으니 그때 찾아 쓸 것.
--   → [[design-stock-base-unit-rebase]]
--
-- 백업: _bak_0827_wood25_poi (1행) · _bak_0827_dedmethod (409행)
-- ============================================================================

CREATE TABLE IF NOT EXISTS _bak_0827_wood25_poi AS
SELECT * FROM purchase_order_items WHERE id = 3410;

CREATE TABLE IF NOT EXISTS _bak_0827_dedmethod AS
SELECT id, item_code, item_name, unit, base_unit, pack_size, width_mm, sheet_spec, deduction_method
FROM items
WHERE is_active = 1 AND deduction_method = 'ROLL'
  AND (base_unit IS NULL OR base_unit = '') AND unit IN ('EA', '장');

-- ── 1. 환봉나무 25파이 신설 + 04-21 전표 연결 ───────────────────────────────
INSERT INTO items (
  category_id, item_code, item_name, specification, unit, item_type, category,
  item_group, group_sort, is_sales_item, is_purchase_item,
  deduction_method, stock_mode, production_required, pricing_method,
  avg_unit_cost, base_price, is_active, search_keywords
) VALUES
  (5, 'ACC-030-WOOD-25P', '환봉나무(원목 깃대봉) 25파이', '25파이', 'EA', 'PRODUCT', '원자재',
   '깃대 파이프', 0, 0, 1, 'NONE', 'CONTINUOUS', 0, 'FIXED', 140, 0, 1, '환봉나무25 굵은');

UPDATE purchase_order_items SET
  item_id           = (SELECT id FROM items WHERE item_code = 'ACC-030-WOOD-25P'),
  item_name         = '환봉나무(원목 깃대봉) 25파이',
  quantity          = 750,
  received_quantity = 750,
  unit_price        = 140,
  amount            = 105000,
  notes             = '2026-08-27 수량은 105,000÷140 역산 — 원장 라인 미대사',
  updated_at        = datetime('now', '+9 hours')
WHERE id = 3410;

INSERT INTO inventory (item_id, quantity, safe_stock, reorder_point, entity_id, storage_zone_id)
SELECT i.id, 0, 0, 0, 1, NULL
FROM items i WHERE i.item_code = 'ACC-030-WOOD-25P'
  AND NOT EXISTS (SELECT 1 FROM inventory v WHERE v.item_id = i.id AND v.entity_id = 1);

-- ── 2. 라벨 재정리 — ROLL(무효) → NONE ──────────────────────────────────────
UPDATE items SET
  deduction_method = 'NONE',
  updated_at = datetime('now', '+9 hours')
WHERE is_active = 1 AND deduction_method = 'ROLL'
  AND (base_unit IS NULL OR base_unit = '')
  AND unit IN ('EA', '장')
  AND width_mm IS NULL;          -- ★안전판: width 가 있으면 진짜 ROLL 이므로 건드리지 않는다

-- ============================================================================
-- 검증
--   -- ① 남은 오라벨 0 이어야 한다
--   SELECT COUNT(*) FROM items WHERE is_active=1 AND deduction_method='ROLL'
--     AND (base_unit IS NULL OR base_unit='') AND unit IN ('EA','장');
--   -- ② 진짜 롤은 그대로 (ROLL·unit=롤·base=M 141건 · ROLL·unit=yd 110건)
--   SELECT deduction_method, unit, COALESCE(base_unit,'-') b, COUNT(*) n
--     FROM items WHERE is_active=1 GROUP BY 1,2,3 ORDER BY 1, n DESC;
--
-- ── 롤백 ────────────────────────────────────────────────────────────────────
-- UPDATE items SET deduction_method = (SELECT b.deduction_method FROM _bak_0827_dedmethod b WHERE b.id = items.id)
--   WHERE id IN (SELECT id FROM _bak_0827_dedmethod);
-- UPDATE purchase_order_items SET
--   item_id=(SELECT b.item_id FROM _bak_0827_wood25_poi b WHERE b.id=purchase_order_items.id),
--   item_name=(SELECT b.item_name FROM _bak_0827_wood25_poi b WHERE b.id=purchase_order_items.id),
--   quantity=(SELECT b.quantity FROM _bak_0827_wood25_poi b WHERE b.id=purchase_order_items.id),
--   received_quantity=(SELECT b.received_quantity FROM _bak_0827_wood25_poi b WHERE b.id=purchase_order_items.id),
--   unit_price=(SELECT b.unit_price FROM _bak_0827_wood25_poi b WHERE b.id=purchase_order_items.id),
--   notes=(SELECT b.notes FROM _bak_0827_wood25_poi b WHERE b.id=purchase_order_items.id)
-- WHERE id = 3410;
-- DELETE FROM inventory WHERE item_id IN (SELECT id FROM items WHERE item_code='ACC-030-WOOD-25P');
-- DELETE FROM items WHERE item_code = 'ACC-030-WOOD-25P';
-- ============================================================================
