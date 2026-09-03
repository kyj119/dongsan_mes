# Code review — `src/utils src/services src/middleware src/layout src/constants` (working tree vs HEAD, 2026-09-02)

Scope actually touched: `src/utils/rollConsumption.ts`, `src/utils/orderLineCost.ts` (new), `src/utils/costCalculator.ts`, `src/utils/materialRequirement.ts`. No changes under services/middleware/layout/constants.
Gates: `npx tsc --noEmit` exit 0 · `node scripts/orderline-cost-selftest.cjs` 25/25 pass.
Method: 5 finder angles (30 candidates) → dedup → verified by running the compiled TS (`scripts/lib/compile-ts.cjs`) and by code/DB inspection. Verdicts: CONFIRMED unless marked PLAUSIBLE.

```json
[
  {
    "file": "src/utils/materialRequirement.ts",
    "line": 84,
    "summary": "The planning loader never selects `i.avg_unit_cost`, so `selectRollPlacement` runs in area mode for shortage-check/weekly-purchase but in price mode for order cost (`orderLineCost.loadCostMaterials` includes the price) — the two callers the header says cannot diverge pick different rolls for the same line. [CONFIRMED by running compiled code]",
    "failure_scenario": "Selftest AQ2 fixture (700폭 436원/yd … 1800폭 1,044), line 70×170 cm qty 1: plan (no price) → AQ2-70, 1.859 yd; cost (with price) → AQ2-180, 0.766 yd. Weekly purchase demands AQ2-70 while `order_items.material_cost` is booked against AQ2-180. Fix: either load avg_unit_cost in materialRequirement (reuse loadCostMaterials) or make the criterion an explicit parameter of selectRollPlacement."
  },
  {
    "file": "src/utils/rollConsumption.ts",
    "line": 161,
    "summary": "`byPrice` is computed over every usable candidate, so a single BOM roll with `avg_unit_cost` 0/NULL flips the whole selection to area mode, which can then pick that unpriced roll over a priced roll that fits — turning a computable cost into `NO_PRICE` and, in recalculateOrderCosts, into material_cost 0. [CONFIRMED by running compiled code]",
    "failure_scenario": "BOM [700폭 price 0, 900폭 459원/yd], line 65×300 cm: area picks 700폭 → computeLineCost coverage=NO_PRICE, material_cost=0; with only the priced roll present it picks 900폭 → FULL, 3.28 yd × 459 = 1,506원. Adding one never-purchased roll to a product's BOM zeroes every existing line's cost on next recalc and undercounts FULL in the backfill dry-run."
  },
  {
    "file": "src/utils/costCalculator.ts",
    "line": 135,
    "summary": "`amount = unit_price × qty` ignores AREA pricing (`computeLineAmount`: unit_price × billed ㎡ × qty) and the 0501 `line_discount`, so the stored `margin_rate` is wrong for every area-priced or discounted line; `order_items.amount` is the actual billed figure and is not read. [CONFIRMED vs src/utils/orderLineAmount.ts:113-116]",
    "failure_scenario": "AREA banner 450×90, unit_price 5,000원/㎡, qty 1 → real amount ≈ 20,250 (billed 4.05㎡); code uses amount=5,000. With total_cost 2,259: real margin 88.8%, stored margin_rate 54.8%. Line with unit_price 10,000 ×2, line_discount 4,000 (amount 16,000), cost 12,000 → real 25%, stored 40%. Reports built on margin_rate misrank exactly the lines whose margin matters."
  },
  {
    "file": "src/utils/costCalculator.ts",
    "line": 128,
    "summary": "`useBom = coverage === 'FULL'` conflates material coverage with ink coverage: the ink_cost computeLineCost deliberately produces for NO_DEDUCT (and NO_PRICE) lines is thrown away and replaced by `std.ink_cost` (0 while cost_standards is empty); conversely for FULL lines `cost_standards.ink_cost_per_sqm` is never layered in. [CONFIRMED by running compiled code]",
    "failure_scenario": "수성 product whose only BOM row is a NONE item, line 100×200 cm qty 5, map 수성=189: computeLineCost → NO_DEDUCT, ink_cost 1,890; recalculateOrderCosts writes ink_cost 0, total_cost 0, margin 100%. Same print with a ROLL link carries 1,890 ink — identical prints disagree on ink. Deeper fix: computeLineCost owns material+ink (with cost_standards as its own per-component fallback); recalculateOrderCosts only adds pp_cost."
  },
  {
    "file": "src/utils/costCalculator.ts",
    "line": 113,
    "summary": "recalculateOrderCosts still awaits `calculateItemCost` per line, issuing one `cost_standards` SELECT per line (table is 0 rows in prod) even when the BOM result is FULL and std.material/ink are discarded; only pp_cost (no DB needed) is kept, and the total/unit/margin it computes are recomputed and dropped. [CONFIRMED]",
    "failure_scenario": "Per order: 1 (lines) + 1 (materials) + 1-2 (settings) + N (cost_standards) + 1 (batch). `POST /costs/backfill {limit:100}` with multi-line orders (40×10 lines + 60×2) ≈ 920+ D1 calls → 'Too many subrequests'; costs.ts:141-146 logs those orders as coverage.ERROR while `lastOrderId` still advances, so the next cursor call skips them permanently (total_cost stays 0). Every PUT/create/append now also pays N serial round-trips. Fix: one `cost_standards … WHERE category_name IN (…)` per order (or none when every line is FULL) and inline pp_cost."
  },
  {
    "file": "src/utils/costCalculator.ts",
    "line": 90,
    "summary": "The cost snapshot is maintained by fanning `recalculateOrderCosts` out to individual writers (create, append, PUT, CONFIRM, backfill), but two `order_items` INSERT paths never call it — quotation convert-to-order (`src/routes/quotations.ts:692,721`) and order copy (`src/routes/orders/operations.ts:199,239`) — so orders born there keep total_cost 0 / margin 100% until edited or confirmed. [CONFIRMED by grep]",
    "failure_scenario": "견적 전환 주문 or a copied order shows 0 cost in /reports 수익성 exactly as before this change; the backfill route cannot tell 'never computed' from 'computed as 0'. CLAUDE.md §누적 캐시: '수정·삭제 경로가 그걸 모르는 것 — 가장 자주 재발한 결함'. Deeper fix: recompute at the one place lines are persisted (a shared persist helper) rather than per call site."
  },
  {
    "file": "src/utils/materialRequirement.ts",
    "line": 138,
    "summary": "When `selectRollPlacement` returns null (every ROLL candidate has width_mm ≤ 0 — passes the `!= null` filter, dropped by `usable`) the line is silently skipped: no requirement, no `unresolved` entry, and BOARD rows in the same BOM are ignored by the else-if; the cost path labels the identical state NO_MATERIAL_LINK. Old code produced an Infinity requirement that at least surfaced as a shortage row. [PLAUSIBLE — null path confirmed by running compiled code; needs a width_mm=0 item]",
    "failure_scenario": "Product linked to a ROLL item saved with width_mm=0: computeMaterialCoverage → requirements={}, unresolved=[] → checkMaterialCoverage on CONFIRM reports '자재 이상 없음', weeklyPurchase plans 0 demand, while the costs dry-run for the same line reports NO_MATERIAL_LINK. Fix: `if (!pick) unresolved.push({reason:'NO_MATERIAL_LINK',…})` or fall through to boardMats."
  },
  {
    "file": "src/utils/materialRequirement.ts",
    "line": 46,
    "summary": "Doc comments (lines 3, 46-51 '주문폭 이상 최소폭 원단 선택 / N=ceil(주문폭÷최대폭) / autoDeduct 미러링') and orderLineCost.ts:10-11 / costCalculator.ts:9-10 claim a single selection rule, but `autoDeductInventory.ts:154-160` still selects the narrowest roll with width_mm ≥ output_width (no orientation, no price, no split fallback), so the 이론 소요 ↔ 실제 차감 = 로스 measurement the new file is built for compares different rolls. [CONFIRMED by reading autoDeductInventory.ts]",
    "failure_scenario": "70×170 cm line printed with output_width 700: autoDeduct deducts AQ2-70 1.859 yd; order_items.material_cost was booked on AQ2-180 0.766 yd → 'loss' = −59% on a different SKU. The stale header will lead the next maintainer to copy the old rule back into planning. Either autoDeduct adopts selectRollPlacement (print orientation as hint) or the headers stop claiming parity."
  },
  {
    "file": "src/utils/orderLineCost.ts",
    "line": 211,
    "summary": "loadCostMaterials/computeLineCost ignore `product_materials.quantity / usage_type / usage_param` (migration 0508: FIXED_QTY, PER_AREA, PER_AREA_SHEET, PER_LED, PER_PERIMETER, seeded for SIGN-CH/SIGN-FRL), so sign BOM rows are either costed with the roll/board heuristic or dropped, yet the line can still be reported FULL. [PLAUSIBLE — no code in src reads usage_type; local D1 has no SIGN rows so prod values unverified]",
    "failure_scenario": "SIGN-CH 200×100 cm: ALM-2T-WH-48 PER_AREA_SHEET param 2.5 → if BOARD with sheet_spec NULL, required = 2㎡/2.977 = 0.67 sheet instead of ceil(2/2.5)=1; LED/SMPS/입체바 (EA, width NULL) filtered out → 간판 cost = aluminium only with coverage FULL. If deduction_method is NULL it is coalesced to ROLL and dropped → NO_DEDUCT, cost 0 labelled 'intended'."
  },
  {
    "file": "src/utils/orderLineCost.ts",
    "line": 202,
    "summary": "Cleanup: `loadCostMaterials` is a verbatim copy of the product_materials loader in materialRequirement.ts:78-96 (only `avg_unit_cost` added); computeLineCost re-implements the NO_ITEM/NO_SIZE/NO_MATERIAL_LINK + ROLL/BOARD/NONE dispatch and the BOARD sheet formula (third copy with autoDeductInventory); `computeOrderLineCosts` (line 272) has zero callers while its 3-step recipe is inlined in costCalculator.ts:105-108 and costs.ts:131-135; materialRequirement.ts:129 keeps a now-pointless width sort. [CONFIRMED by grep]",
    "failure_scenario": "The file's own header says the consumption formula must not be copied, yet selection/dispatch now lives in three places and the ink-precedence rule in three; the next change (waste_factor for rolls, BOM with ROLL+BOARD, map fallback) must be made 3× or cost/plan/deduct drift — the 2026-08-27 `[0]` incident class. Simpler form: one `resolveLineMaterial(mats, line) → {mat, required} | {reason}` in rollConsumption used by both computeMaterialCoverage and computeLineCost; make materialRequirement call loadCostMaterials; delete or adopt computeOrderLineCosts."
  }
]
```

Dropped after verification: ±1원 rounding drift from summing rounded components (observable but negligible); getSettings helper reuse (minor); nested tie-break readability (folded into cleanup finding).
