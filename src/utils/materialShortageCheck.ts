// ============================================================================
// 주문 확정 시 자재 부족 경고 (Phase 5)
//   #465: 구 bom_items(동결) → 신모델(product_materials + 차감설정, autoDeduct 산식)로 재배선.
// ============================================================================
import { computeMaterialRequirements } from './materialRequirement'

export interface ShortageWarning {
  material_item_id: number
  item_id: number | null   // items.id (inventory.item_id)
  material_name: string
  required: number
  current_stock: number
  on_order: number
  shortfall: number
  unit: string
}

/**
 * 단일 주문에 대해 신모델 기반 자재 부족 체크
 * - 주문 품목 규격 → product_materials 차감산식(ROLL/BOARD, 분할근사) → 소요량
 * - 현재고 + 발주중 대비 부족량 반환
 */
export async function checkMaterialShortage(
  db: D1Database,
  orderId: number,
  entityId?: number
): Promise<ShortageWarning[]> {
  // 1. 주문 품목 조회
  const { results: orderItems } = await db.prepare(`
    SELECT oi.id, oi.item_id, oi.item_name,
           oi.width, oi.height, oi.quantity
    FROM order_items oi
    WHERE oi.order_id = ?
  `).bind(orderId).all()

  if (!orderItems || orderItems.length === 0) return []

  // 2. 신모델 소요량 산정 (product_materials + 품목 차감설정)
  const materialMap = await computeMaterialRequirements(db, orderItems as any[])
  if (materialMap.size === 0) return []

  // 4. 현재고 + 발주중 조회
  const materialIds = Array.from(materialMap.keys())
  const ph = materialIds.map(() => '?').join(',')

  // inventory에서 item_id도 함께 조회
  const invCondition = entityId && entityId > 0
    ? `AND inv.entity_id = ?`
    : ''
  const invParams = entityId && entityId > 0 ? [entityId] : []

  // UP4 백로그: inventory.id(행PK)≠item_id. item_id 기준 + 다중행 SUM 집계로 교정.
  const { results: stocks } = await db.prepare(`
    SELECT inv.item_id, SUM(inv.quantity) AS quantity, MAX(i.unit) AS unit
    FROM inventory inv
    LEFT JOIN items i ON inv.item_id = i.id
    WHERE inv.item_id IN (${ph}) ${invCondition}
    GROUP BY inv.item_id
  `).bind(...materialIds, ...invParams).all()

  const stockMap: Record<number, { qty: number; itemId: number | null; unit: string }> = {}
  for (const s of stocks as any[]) {
    stockMap[s.item_id] = { qty: s.quantity || 0, itemId: s.item_id, unit: s.unit || 'EA' }
  }

  // 발주중 수량 (inventory.item_id 기준)
  const realItemIds = (stocks as any[]).map(s => s.item_id).filter(Boolean)
  let onOrderMap: Record<number, number> = {}
  if (realItemIds.length > 0) {
    const ph2 = realItemIds.map(() => '?').join(',')
    const { results: onOrder } = await db.prepare(`
      SELECT poi.item_id, SUM(poi.quantity - COALESCE(poi.received_quantity, 0)) as pending_qty
      FROM purchase_order_items poi
      JOIN purchase_orders po ON poi.po_id = po.id
      WHERE po.status IN ('DRAFT', 'CONFIRMED', 'PARTIAL_RECEIVED')
        AND poi.item_id IN (${ph2})
      GROUP BY poi.item_id
    `).bind(...realItemIds).all()

    for (const o of onOrder as any[]) {
      onOrderMap[o.item_id] = Math.max(0, o.pending_qty || 0)
    }
  }

  // 5. 부족량 계산
  const warnings: ShortageWarning[] = []
  for (const [matId, mat] of materialMap) {
    const stock = stockMap[matId] || { qty: 0, itemId: null, unit: 'EA' }
    const onOrder = stock.itemId ? (onOrderMap[stock.itemId] || 0) : 0
    const shortfall = Math.max(0, mat.required - stock.qty - onOrder)

    if (shortfall > 0) {
      warnings.push({
        material_item_id: matId,
        item_id: stock.itemId,
        material_name: mat.material_name,
        required: Math.round(mat.required * 100) / 100,
        current_stock: stock.qty,
        on_order: onOrder,
        shortfall: Math.round(shortfall * 100) / 100,
        unit: stock.itemId ? stock.unit : mat.base_unit,
      })
    }
  }

  warnings.sort((a, b) => b.shortfall - a.shortfall)
  return warnings
}
