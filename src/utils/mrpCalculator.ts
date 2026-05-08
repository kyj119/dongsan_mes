// ============================================================================
// MRP (자재소요계획) 계산 엔진
// ============================================================================

interface OrderItem {
  id: number
  order_id: number
  item_id: number | null
  item_name: string
  category_name: string | null
  width: number | null   // cm
  height: number | null  // cm
  quantity: number
}

interface BomItem {
  id: number
  item_id: number | null
  category_name: string | null
  material_item_id: number
  material_name: string
  usage_per_sqm: number
  usage_unit: string
  waste_factor: number
}

interface MaterialRequirement {
  material_item_id: number
  material_name: string
  required_quantity: number
  current_stock: number
  on_order_quantity: number
  shortfall: number
}

// 주문 아이템에서 면적(m²) 산출
function calculateAreaSqm(item: OrderItem): number {
  const w = item.width || 0
  const h = item.height || 0
  if (w <= 0 || h <= 0) return 0
  // cm → m 변환 후 면적 × 수량
  return (w / 100) * (h / 100) * (item.quantity || 1)
}

// MRP 계산 실행
export async function runMrpCalculation(
  db: D1Database,
  options: {
    dateFrom?: string
    dateTo?: string
    orderId?: number
    runBy?: number
    runType?: string
  }
): Promise<{
  runId: number
  runNumber: string
  results: MaterialRequirement[]
  totalMaterials: number
  shortfallCount: number
}> {
  // 1. 대상 주문 아이템 조회
  let orderItemsQuery = `
    SELECT oi.id, oi.order_id, oi.item_id, oi.item_name, oi.category_name,
           oi.width, oi.height, oi.quantity
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE o.status IN ('CONFIRMED', 'IN_PRODUCTION')
  `
  const params: any[] = []

  if (options.orderId) {
    orderItemsQuery += ` AND o.id = ?`
    params.push(options.orderId)
  } else {
    if (options.dateFrom) {
      orderItemsQuery += ` AND o.order_date >= ?`
      params.push(options.dateFrom)
    }
    if (options.dateTo) {
      orderItemsQuery += ` AND o.order_date <= ?`
      params.push(options.dateTo)
    }
  }

  const stmt = params.length > 0
    ? db.prepare(orderItemsQuery).bind(...params)
    : db.prepare(orderItemsQuery)
  const { results: orderItems } = await stmt.all() as { results: OrderItem[] }

  // 2. BOM 조회 (활성 항목만)
  const { results: bomItems } = await db.prepare(
    `SELECT id, item_id, category_name, material_item_id, material_name,
            usage_per_sqm, usage_unit, waste_factor
     FROM bom_items WHERE is_active = 1`
  ).all() as { results: BomItem[] }

  // 3. 자재별 소요량 집계
  const materialMap = new Map<number, MaterialRequirement>()

  for (const oi of orderItems) {
    const areaSqm = calculateAreaSqm(oi)
    if (areaSqm <= 0) continue

    // BOM 매칭: item_id 우선, 없으면 category_name fallback
    const matchedBoms = bomItems.filter(b =>
      (b.item_id && b.item_id === oi.item_id) ||
      (!b.item_id && b.category_name && b.category_name === oi.category_name)
    )

    // item_id 매칭이 있으면 그것만 사용, 없으면 category fallback
    const itemBoms = matchedBoms.filter(b => b.item_id === oi.item_id)
    const effectiveBoms = itemBoms.length > 0
      ? itemBoms
      : matchedBoms.filter(b => !b.item_id)

    for (const bom of effectiveBoms) {
      const required = areaSqm * bom.usage_per_sqm * bom.waste_factor
      const existing = materialMap.get(bom.material_item_id)
      if (existing) {
        existing.required_quantity += required
      } else {
        materialMap.set(bom.material_item_id, {
          material_item_id: bom.material_item_id,
          material_name: bom.material_name,
          required_quantity: required,
          current_stock: 0,
          on_order_quantity: 0,
          shortfall: 0,
        })
      }
    }
  }

  // 4. 현재 재고 조회
  const materialIds = Array.from(materialMap.keys())
  if (materialIds.length > 0) {
    const placeholders = materialIds.map(() => '?').join(',')
    const { results: stocks } = await db.prepare(
      `SELECT id, quantity FROM inventory WHERE id IN (${placeholders})`
    ).bind(...materialIds).all() as { results: { id: number; quantity: number }[] }

    for (const s of stocks) {
      const m = materialMap.get(s.id)
      if (m) m.current_stock = s.quantity || 0
    }

    // 5. 발주중 수량 조회 (PENDING/APPROVED 상태의 PO)
    const { results: onOrder } = await db.prepare(`
      SELECT poi.item_id, SUM(poi.quantity) as total_qty
      FROM purchase_order_items poi
      JOIN purchase_orders po ON poi.purchase_order_id = po.id
      WHERE po.status IN ('PENDING', 'APPROVED', 'ORDERED')
        AND poi.item_id IN (${placeholders})
      GROUP BY poi.item_id
    `).bind(...materialIds).all() as { results: { item_id: number; total_qty: number }[] }

    for (const oo of onOrder) {
      const m = materialMap.get(oo.item_id)
      if (m) m.on_order_quantity = oo.total_qty || 0
    }
  }

  // 6. shortfall 계산
  const results: MaterialRequirement[] = []
  for (const m of materialMap.values()) {
    m.shortfall = Math.max(0, m.required_quantity - m.current_stock - m.on_order_quantity)
    results.push(m)
  }
  results.sort((a, b) => b.shortfall - a.shortfall)

  // 7. 실행 번호 생성
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const { results: existingRuns } = await db.prepare(
    `SELECT COUNT(*) as cnt FROM mrp_runs WHERE run_number LIKE ?`
  ).bind(`MRP-${today}-%`).all()
  const seq = ((existingRuns[0] as any)?.cnt || 0) + 1
  const runNumber = `MRP-${today}-${String(seq).padStart(3, '0')}`

  // 8. 결과 저장
  const runResult = await db.prepare(`
    INSERT INTO mrp_runs (run_number, run_type, date_from, date_to, order_id, status, total_materials, shortfall_count, run_by)
    VALUES (?, ?, ?, ?, ?, 'COMPLETED', ?, ?, ?)
  `).bind(
    runNumber,
    options.runType || 'MANUAL',
    options.dateFrom || null,
    options.dateTo || null,
    options.orderId || null,
    results.length,
    results.filter(r => r.shortfall > 0).length,
    options.runBy || null
  ).run()

  const runId = runResult.meta?.last_row_id as number

  // 결과 행 저장
  for (const r of results) {
    await db.prepare(`
      INSERT INTO mrp_results (run_id, material_item_id, material_name, required_quantity, current_stock, on_order_quantity, shortfall)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(runId, r.material_item_id, r.material_name, r.required_quantity, r.current_stock, r.on_order_quantity, r.shortfall).run()
  }

  return {
    runId,
    runNumber,
    results,
    totalMaterials: results.length,
    shortfallCount: results.filter(r => r.shortfall > 0).length,
  }
}
