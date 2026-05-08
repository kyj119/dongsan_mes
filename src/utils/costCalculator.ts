// 주문 라인별 원가 계산 유틸리티

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

  // 후가공 비용 (additional_cost × quantity)
  if (post_processing) {
    try {
      const ppArr = typeof post_processing === 'string' ? JSON.parse(post_processing) : post_processing
      if (Array.isArray(ppArr)) {
        for (const pp of ppArr) {
          pp_cost += (parseFloat(pp.additional_cost) || 0) * quantity
        }
      }
    } catch (_) {}
  }

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
    SELECT oi.id, oi.width, oi.height, oi.quantity, oi.unit_price, oi.post_processing,
      COALESCE(oi.category_name, ic.category_name) as category_name
    FROM order_items oi
    LEFT JOIN items i ON oi.item_id = i.id
    LEFT JOIN item_categories ic ON i.category_id = ic.id
    WHERE oi.order_id = ? AND oi.parent_item_id IS NULL
  `).bind(orderId).all() as any

  for (const item of (items || [])) {
    const cost = await calculateItemCost(db, {
      width: item.width,
      height: item.height,
      quantity: item.quantity || 1,
      unit_price: parseFloat(item.unit_price) || 0,
      category_name: item.category_name,
      post_processing: item.post_processing
    })

    await db.prepare(`
      UPDATE order_items SET
        material_cost = ?, ink_cost = ?, pp_cost = ?, total_cost = ?,
        unit_cost = ?, margin_rate = ?
      WHERE id = ?
    `).bind(
      cost.material_cost, cost.ink_cost, cost.pp_cost, cost.total_cost,
      cost.unit_cost, cost.margin_rate,
      item.id
    ).run()
  }
}
