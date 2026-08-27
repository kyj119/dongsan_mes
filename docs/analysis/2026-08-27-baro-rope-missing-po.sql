-- ============================================================================
-- 2026-08-27 (6) 「바로」 03-24 재단로프 매입 누락분 등록 — 4,810,000 (용준님 지시)
--
-- 근거 = 용준님이 준 「바로」 거래처원장
--   25.03.24  로프 3.5mm  200 X 4  130개 × 37,000 = **4,810,000**(공급가) · VAT 481,000 · 합계 5,291,000
--
-- MES 의 「바로」 매입은 4전표(3/11·4/03·4/21·7/22)뿐이고 **이 건이 어디에도 없다**.
--   재단로프(`ACC-038`) 매입 이력도 판다코리아 01-12(100개·38,000) + 법인간 2건뿐이었다.
--   4,810,000·5,291,000 두 금액 모두 `purchase_orders` 전건 조회로 **중복 없음** 확인 후 등록.
--
-- ⚠️**동산(e1) 매입 총액이 +4,810,000 된다.** 데이터가 늘어나는 게 아니라
--   원래 있어야 할 매입이 빠져 있던 것이라 손익·원가율이 그만큼 정확해진다.
--   (`purchase_invoices` 는 선명 전용이라 동산은 계산서 행을 만들지 않는다 — 기존 4전표와 동일)
--
-- ★전표 모양은 기존 「바로」 4전표를 그대로 따른다(`status='RECEIVED'` · `created_by=5` ·
--   `vat_amount`=공급가×0.1 · `final_amount`=공급가+VAT). 재고는 건드리지 않는다 —
--   기존 4전표도 `inventory_receipts` 행 없이 적재돼 있어 같은 규약을 유지한다.
--
-- 멱등 = `po_number` 로 막는다(재실행 시 INSERT 0건).
-- ============================================================================

INSERT INTO purchase_orders (
  po_number, supplier_id, status, order_date, total_amount, vat_amount,
  discount_amount, final_amount, notes, created_by, entity_id
)
SELECT 'E1-PO-3860-20260324', 3860, 'RECEIVED', '2026-03-24', 4810000, 481000,
       0, 5291000,
       '바로 거래처원장 · 로프 3.5mm 200X4 · 130 X 37,000 (2026-08-27 MES 누락분 등록)', 5, 1
WHERE NOT EXISTS (SELECT 1 FROM purchase_orders WHERE po_number = 'E1-PO-3860-20260324');

INSERT INTO purchase_order_items (
  po_id, item_id, item_name, category_name, quantity, received_quantity, unit,
  unit_price, amount, vat_included, sort_order, line_status, price_status, notes
)
SELECT po.id, i.id, '재단로프 3.5mm (200X4)', i.category, 130, 130, 'EA',
       37000, 4810000, 1, 1, 'RECEIVED', 'CONFIRMED',
       '바로 거래처원장 03-24 · 130 X 37,000'
FROM purchase_orders po, items i
WHERE po.po_number = 'E1-PO-3860-20260324' AND i.item_code = 'ACC-038'
  AND NOT EXISTS (SELECT 1 FROM purchase_order_items x WHERE x.po_id = po.id);

-- ── 부수: `ACC-038` 원가가 법인간 이체가로 잡혀 있었다 ──────────────────────
-- 등록 후 매입 이력 5건이 이렇게 된다:
--   2026-01-12 판다코리아   100 × 38,000 = 3,800,000   (e1 · 외부매입)
--   2026-03-24 바로         130 × 37,000 = 4,810,000   (e1 · 외부매입 ← 이번 등록분)
--   2026-04-03 바로         200 × 37,000 = 7,400,000   (e1 · 외부매입)
--   2026-02-05 (주)동산기획    2 × 35,000 =    70,000   (e2 · **법인간 이체**)
--   2026-04-08 (주)동산기획    4 × 35,000 =   140,000   (e2 · **법인간 이체**)
--
-- 그런데 `avg_unit_cost` 는 **35,000** — 6개짜리 법인간 이체가만 반영돼 있고
-- 430개 외부매입(1,601만)이 통째로 빠져 있었다. 재단로프는 판매도 하는 품목이라
-- (판매 5건 · `base_price` 50,000) 원가가 낮게 잡히면 **마진이 그만큼 부풀려진다**.
--
-- ★법인간 이체가는 원가가 아니다 — AP 집계에서 내부 법인을 빼는 것과 같은 규칙
--   ([[design-intercompany-ledger-relocation]]). 외부매입 430개 가중평균 =
--   16,010,000 ÷ 430 = **37,232.56**.
-- ⚠️`POST /inventory-valuation/recalculate-avg` 는 `inventory_transactions` IN 행으로 계산하는데
--   이 품목엔 그 행이 없어 **건너뛴다** → 여기서 고쳐도 되돌아가지 않는다.
UPDATE items SET avg_unit_cost = 37232.56, updated_at = datetime('now', '+9 hours')
WHERE item_code = 'ACC-038' AND avg_unit_cost = 35000;

-- ============================================================================
-- 검증
--   SELECT po.po_number, po.order_date, po.total_amount, po.vat_amount, po.final_amount,
--          poi.item_name, poi.quantity, poi.unit_price, poi.amount
--     FROM purchase_orders po JOIN purchase_order_items poi ON poi.po_id = po.id
--    WHERE po.po_number = 'E1-PO-3860-20260324';
--   -- 라인 합계 4,810,000 = total_amount 이어야 한다
--
--   -- ACC-038 매입 이력이 4건이 된다(판다 100 · 동산기획 2 · 4 · 바로 130)
--   SELECT po.order_date, c.client_name, poi.quantity, poi.unit_price, poi.amount
--     FROM purchase_order_items poi JOIN purchase_orders po ON po.id=poi.po_id
--     LEFT JOIN clients c ON c.id=po.supplier_id
--     JOIN items i ON i.id=poi.item_id WHERE i.item_code='ACC-038' ORDER BY po.order_date;
--
-- ── 롤백 ────────────────────────────────────────────────────────────────────
-- DELETE FROM purchase_order_items WHERE po_id = (SELECT id FROM purchase_orders WHERE po_number='E1-PO-3860-20260324');
-- DELETE FROM purchase_orders WHERE po_number = 'E1-PO-3860-20260324';
-- ============================================================================
