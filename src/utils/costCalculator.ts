// 주문 라인별 원가 계산 유틸리티
// ----------------------------------------------------------------------------
// ★ 2026-09-02 — 재료비·잉크의 **1순위는 BOM 기반 실소요량**(`utils/orderLineCost`)이다.
//   종전엔 `cost_standards`(카테고리별 ㎡단가)만 봤는데 **그 표가 prod 0건**이라
//   `order_items.total_cost` 가 22,973줄 전량 0이었다. 계산기는 정상이고 기준 데이터가 없었다.
//   BOM 은 「어느 원단을 얼마나 쓰는가」를 실제로 계산하므로 표를 채울 필요가 없다.
//
//   순서 = ①BOM(product_materials + avg_unit_cost) → ②cost_standards 폴백 → ③후가공은 항상 가산.
//   ⚠️계산 **사본을 만들지 않는다** — 「어느 자재를 얼마나」는 `rollConsumption.resolveLineMaterials`
//     하나뿐이고 자동차감·소요량계획·원가가 전부 그것을 지난다. 여기서 다시 구현하면 갈린다.
//     라인 원가 조합(자재 로드 + 잉크 단가 + 계산)도 `orderLineCost.computeOrderLineCosts` 하나다.

import { computeOrderLineCosts, type LineCost } from './orderLineCost'
import { computeLineAmount } from './orderLineAmount'
import type { D1Database } from '@cloudflare/workers-types'

/**
 * 후가공 비용 — `additional_cost × 수량`. **DB 를 보지 않는다.**
 * (라인마다 원가 계산기를 부르면 후가공 하나 때문에 `cost_standards` SELECT 가 라인 수만큼 난다)
 */
export function computePpCost(postProcessing: unknown, quantity: number): number {
  if (!postProcessing) return 0
  try {
    const arr = typeof postProcessing === 'string' ? JSON.parse(postProcessing) : postProcessing
    if (!Array.isArray(arr)) return 0
    let sum = 0
    for (const pp of arr) sum += (parseFloat((pp as any)?.additional_cost) || 0) * quantity
    return sum
  } catch (_) {
    return 0
  }
}

// ★`calculateItemCost()` 는 삭제했다(2026-09-03) — 호출부가 0이 됐다.
//   라인마다 이걸 await 하느라 `cost_standards` SELECT 가 라인 수만큼 났고(prod 0행인 표를),
//   정작 그 결과에서 쓰는 건 `pp_cost` 뿐이었다. 재료·잉크·마진은 아래에서 다시 계산해 버렸다.
//   후가공만 `computePpCost()`(DB 불요)로 남기고, 기준표는 주문당 1회 조회한다.

/** `order_items` 에 저장할 한 줄. `amount` 는 마진 분모로 실제 쓴 값(검증용). */
export interface StoredLineCost {
  material_cost: number
  ink_cost: number
  pp_cost: number
  total_cost: number
  unit_cost: number
  margin_rate: number
  amount: number
}

/**
 * BOM 결과 + 카테고리 기준표 + 라인 정보 → **저장할 값**. `db` 를 보지 않는 순수 함수라
 * 픽스처로 그대로 검증된다(게이트 `test:orderline-cost`) — 이 판정들이 전부 「200 이 나오는 오답」이라
 * 타입체크·빌드·smoke 로는 절대 안 잡히기 때문이다.
 */
export function combineLineCost(input: {
  bom: LineCost
  /** cost_standards 의 ㎡단가. 없으면 {media:0, ink:0} */
  std: { media: number; ink: number }
  /** 실규격 면적(㎡, 수량 제외) */
  areaSqm: number
  quantity: number
  post_processing?: unknown
  /** order_items.amount — 실제 청구금액 */
  amount?: unknown
  unit_price?: unknown
  pricing_method?: string | null
  min_billing_side_cm?: number | null
  width?: number | null
  height?: number | null
}): StoredLineCost {
  const { bom, std } = input
  const qty = Number(input.quantity) || 1
  const areaSqm = Number(input.areaSqm) || 0
  const stdMaterial = Math.round(areaSqm * std.media * qty)
  const stdInk = Math.round(areaSqm * std.ink * qty)

  // ★재료비와 잉크는 **판정이 다르다**(2026-09-03 리뷰).
  //   재료비 = BOM 이 실제로 금액을 냈으면 그것을 쓴다. 0이면(미상·미링크·무차감) 기준표로 메운다 —
  //     「원가 없음」을 「원가 0」으로 받아들이지 않기 위한 것이고, 부분만 산정된 PARTIAL 라인의
  //     실제 자재비를 기준표 평균으로 덮어쓰지도 않는다.
  //   잉크   = 규격+분류만 있으면 계산된다. 자재 판정에 묶으면 무차감(NO_DEDUCT) 인쇄물의 잉크가
  //     통째로 사라져 **같은 인쇄물이 BOM 유무로 잉크가 갈린다.**
  //   ⚠️ 잉크 폴백 판정은 **금액이 아니라 「규칙이 있었나」**로 한다(`detail.ink_per_sqm`).
  //      태극기·간판은 맵에 **명시적 0**(인쇄원단을 매입하므로 잉크가 없다)인데, 0원을 미상으로
  //      보면 기준표가 그 0을 다시 채워 매입 원단에 잉크가 붙는다.
  const material_cost = bom.material_cost > 0 ? bom.material_cost : stdMaterial
  const ink_cost = bom.detail.ink_per_sqm !== null ? bom.ink_cost : stdInk
  const pp_cost = Math.round(computePpCost(input.post_processing, qty))
  const total_cost = material_cost + ink_cost + pp_cost

  // ★마진의 분모는 **실제 청구금액(`order_items.amount`)** 이다.
  //   `unit_price × 수량` 은 AREA 과금(단가 × 청구㎡ × 수량)과 라인 에누리(0501)를 둘 다 무시한다 —
  //   450×90 현수막이면 20,250원을 5,000원으로 봐서 마진이 88.8% → 54.8% 로 뒤집힌다.
  //   amount 가 비어 있는 옛 행은 **청구 산식 정본**(`orderLineAmount`)으로 되살린다.
  //   여기서 `unit_price × qty` 로 폴백하면 AREA 라인에서 같은 오류가 그대로 재현된다.
  const raw = input.amount
  const amount = (raw !== null && raw !== undefined && raw !== '' && Number.isFinite(Number(raw)))
    ? Number(raw)
    : computeLineAmount({
        unit_price: Number(input.unit_price) || 0, quantity: qty,
        width: input.width, height: input.height,
        min_billing_side_cm: input.min_billing_side_cm,
      }, String(input.pricing_method ?? 'FIXED')).final

  return {
    material_cost, ink_cost, pp_cost, total_cost,
    unit_cost: qty > 0 ? Math.round(total_cost / qty) : 0,
    margin_rate: amount > 0 ? Math.round(((amount - total_cost) / amount) * 1000) / 10 : 0,
    amount,
  }
}

/**
 * 주문의 전체 라인에 대해 원가를 일괄 계산하여 DB 업데이트
 */
export async function recalculateOrderCosts(db: D1Database, orderId: number): Promise<void> {
  const { results: items } = await db.prepare(`
    SELECT oi.id, oi.item_id, oi.width, oi.height, oi.quantity, oi.unit_price, oi.amount,
      oi.post_processing,
      COALESCE(oi.category_name, ic.category_name) as category_name,
      i.category as ink_category,
      i.pricing_method, i.min_billing_side_cm
    FROM order_items oi
    LEFT JOIN items i ON oi.item_id = i.id
    LEFT JOIN item_categories ic ON i.category_id = ic.id
    WHERE oi.order_id = ? AND oi.parent_item_id IS NULL
  `).bind(orderId).all() as any

  const rows = items || []
  if (rows.length === 0) return

  // 라인 원가(자재 선택 + 소요 + 잉크)는 **한 함수**가 낸다 — 자재·잉크 단가 로드도 그 안에서 1회다.
  //   종전엔 같은 3단 레시피가 여기와 `routes/costs.ts` 백필에 각각 인라인돼 있어,
  //   저장되는 원가와 백필이 보고하는 커버리지가 서로 다른 규칙이 될 수 있었다(2026-09-03 리뷰).
  const boms = await computeOrderLineCosts(db, rows.map((r: any) => ({
    item_id: r.item_id, width: r.width, height: r.height,
    quantity: Number(r.quantity) || 1, category: r.ink_category,
  })))

  // 카테고리 기준표도 **주문당 1회**. 종전엔 라인마다 계산기를 await 해서
  // `cost_standards` SELECT 가 라인 수만큼 났다 — prod 에서 0행인 표를 40번 조회하는 식이었고,
  // `POST /costs/backfill {limit:100}` 이 subrequest 한도에 걸릴 수 있었다(2026-09-03 리뷰).
  const cats = [...new Set(rows.map((r: any) => r.category_name).filter((v: any) => !!v))] as string[]
  const stdByCat = new Map<string, { media: number; ink: number }>()
  if (cats.length > 0) {
    const ph = cats.map(() => '?').join(',')
    const { results: stds } = await db.prepare(
      `SELECT category_name, media_cost_per_sqm, ink_cost_per_sqm
         FROM cost_standards WHERE category_name IN (${ph})`
    ).bind(...cats).all<any>()
    for (const r of (stds || [])) {
      stdByCat.set(String(r.category_name), {
        media: parseFloat(r.media_cost_per_sqm) || 0,
        ink: parseFloat(r.ink_cost_per_sqm) || 0,
      })
    }
  }

  const stmts: any[] = []
  for (let idx = 0; idx < rows.length; idx++) {
    const item = rows[idx]
    const qty = Number(item.quantity) || 1
    const out = combineLineCost({
      bom: boms[idx],
      std: stdByCat.get(String(item.category_name ?? '')) ?? { media: 0, ink: 0 },
      areaSqm: (item.width && item.height) ? (Number(item.width) / 100) * (Number(item.height) / 100) : 0,
      quantity: qty,
      post_processing: item.post_processing,
      amount: item.amount,
      unit_price: parseFloat(item.unit_price) || 0,
      pricing_method: item.pricing_method,
      min_billing_side_cm: item.min_billing_side_cm,
      width: item.width, height: item.height,
    })
    const { material_cost, ink_cost, pp_cost, total_cost, unit_cost, margin_rate } = out

    stmts.push(db.prepare(`
      UPDATE order_items SET
        material_cost = ?, ink_cost = ?, pp_cost = ?, total_cost = ?,
        unit_cost = ?, margin_rate = ?
      WHERE id = ?
    `).bind(material_cost, ink_cost, pp_cost, total_cost, unit_cost, margin_rate, item.id))
  }
  // batch — 일부만 반영되면 라인마다 기준이 갈린다.
  if (stmts.length > 0) await db.batch(stmts)
}
