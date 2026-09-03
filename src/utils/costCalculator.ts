// 주문 라인별 원가 계산 유틸리티
// ----------------------------------------------------------------------------
// ★ 2026-09-02 — 재료비·잉크의 **1순위는 BOM 기반 실소요량**(`utils/orderLineCost`)이다.
//   종전엔 `cost_standards`(카테고리별 ㎡단가)만 봤는데 **그 표가 prod 0건**이라
//   `order_items.total_cost` 가 22,973줄 전량 0이었다. 계산기는 정상이고 기준 데이터가 없었다.
//   BOM 은 「어느 원단을 얼마나 쓰는가」를 실제로 계산하므로 표를 채울 필요가 없다.
//
//   순서 = ①BOM(product_materials + avg_unit_cost) → ②cost_standards 폴백 → ③후가공은 항상 가산.
//   ⚠️계산 **사본을 만들지 않는다** — 소요량 산식은 `rollConsumption` 하나뿐이고
//     자동차감·발주·원가가 전부 그것을 지난다. 여기서 다시 구현하면 원가와 실차감이 갈린다.

import { computeLineCost, loadCostMaterials, loadInkCostPerSqm, loadInkCostByCategory } from './orderLineCost'
import type { D1Database } from '@cloudflare/workers-types'

/**
 * 후가공 비용 — `additional_cost × 수량`. **DB 를 보지 않는다.**
 * (라인마다 `calculateItemCost` 를 부르면 후가공 하나 때문에 `cost_standards` SELECT 가 라인 수만큼 난다)
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

export interface CostResult {
  material_cost: number
  ink_cost: number
  pp_cost: number
  total_cost: number
  unit_cost: number
  margin_rate: number
}

/**
 * 주문 라인의 원가를 계산합니다.
 * 면적 기반: (width_cm / 100) * (height_cm / 100) = m² → 단가 적용
 */
export async function calculateItemCost(
  db: D1Database,
  params: {
    width?: number       // cm
    height?: number      // cm
    quantity: number
    unit_price: number   // 판매 단가
    category_name?: string
    post_processing?: string // JSON array
  }
): Promise<CostResult> {
  const { width, height, quantity, unit_price, category_name, post_processing } = params

  let material_cost = 0
  let ink_cost = 0
  let pp_cost = 0

  // 면적 계산 (cm → m²)
  const areaSqm = (width && height) ? (width / 100) * (height / 100) : 0

  // 카테고리별 원가 기준 조회
  if (category_name && areaSqm > 0) {
    const standard = await db.prepare(
      'SELECT media_cost_per_sqm, ink_cost_per_sqm FROM cost_standards WHERE category_name = ?'
    ).bind(category_name).first() as any

    if (standard) {
      material_cost = areaSqm * (parseFloat(standard.media_cost_per_sqm) || 0) * quantity
      ink_cost = areaSqm * (parseFloat(standard.ink_cost_per_sqm) || 0) * quantity
    }
  }

  pp_cost = computePpCost(post_processing, quantity)

  const total_cost = material_cost + ink_cost + pp_cost
  const amount = unit_price * quantity
  const unit_cost = quantity > 0 ? total_cost / quantity : 0
  const margin_rate = amount > 0 ? ((amount - total_cost) / amount) * 100 : 0

  return {
    material_cost: Math.round(material_cost),
    ink_cost: Math.round(ink_cost),
    pp_cost: Math.round(pp_cost),
    total_cost: Math.round(total_cost),
    unit_cost: Math.round(unit_cost),
    margin_rate: Math.round(margin_rate * 10) / 10
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
      i.category as ink_category
    FROM order_items oi
    LEFT JOIN items i ON oi.item_id = i.id
    LEFT JOIN item_categories ic ON i.category_id = ic.id
    WHERE oi.order_id = ? AND oi.parent_item_id IS NULL
  `).bind(orderId).all() as any

  const rows = items || []
  if (rows.length === 0) return

  // BOM 자재·잉크 단가는 주문당 1회만 로드한다(라인마다 조회하면 D1 왕복이 라인 수만큼 난다).
  const matMap = await loadCostMaterials(db, rows.map((r: any) => Number(r.item_id) || 0))
  // 잉크 ㎡단가는 **인쇄방식(items.category)마다 다르다** — 맵이 있으면 단일값은 쓰지 않는다.
  const inkCostByCategory = await loadInkCostByCategory(db)
  const inkCostPerSqm = inkCostByCategory ? 0 : await loadInkCostPerSqm(db)

  // 카테고리 기준표도 **주문당 1회**. 종전엔 라인마다 `calculateItemCost` 를 await 해서
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
  for (const item of rows) {
    const qty = Number(item.quantity) || 1
    const areaSqm = (item.width && item.height) ? (Number(item.width) / 100) * (Number(item.height) / 100) : 0
    const std = stdByCat.get(String(item.category_name ?? '')) ?? { media: 0, ink: 0 }
    const stdMaterial = Math.round(areaSqm * std.media * qty)
    const stdInk = Math.round(areaSqm * std.ink * qty)

    const bom = computeLineCost(matMap.get(Number(item.item_id) || 0), {
      item_id: item.item_id, width: item.width, height: item.height, quantity: qty,
      category: item.ink_category,
    }, { inkCostPerSqm, inkCostByCategory })

    // ★재료비와 잉크는 **판정이 다르다**(2026-09-03 리뷰).
    //   재료비 = 자재를 골랐고 단가가 있을 때(FULL)만 BOM 채택 —
    //     NO_PRICE/NO_MATERIAL_LINK 를 0원으로 받으면 「원가 없음」이 「원가 0」으로 둔갑한다.
    //   잉크   = 규격+분류만 있으면 계산된다. 자재 판정에 묶어 버리면 무차감(NO_DEDUCT) 인쇄물의
    //     잉크가 통째로 사라져 **같은 인쇄물이 BOM 유무로 잉크가 갈린다.**
    const material_cost = bom.coverage === 'FULL' ? bom.material_cost : stdMaterial
    const ink_cost = bom.ink_cost > 0 ? bom.ink_cost : stdInk
    const pp_cost = Math.round(computePpCost(item.post_processing, qty))
    const total_cost = material_cost + ink_cost + pp_cost

    // ★마진의 분모는 **실제 청구금액(`order_items.amount`)** 이다.
    //   `unit_price × 수량` 은 AREA 과금(단가 × 청구㎡ × 수량)과 라인 에누리(0501)를 둘 다 무시한다 —
    //   450×90 현수막이면 20,250원을 5,000원으로 봐서 마진이 88.8% → 54.8% 로 뒤집힌다.
    const rawAmount = item.amount
    const amount = (rawAmount !== null && rawAmount !== undefined && Number.isFinite(Number(rawAmount)))
      ? Number(rawAmount)
      : (parseFloat(item.unit_price) || 0) * qty
    const unit_cost = qty > 0 ? Math.round(total_cost / qty) : 0
    const margin_rate = amount > 0 ? Math.round(((amount - total_cost) / amount) * 1000) / 10 : 0

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
