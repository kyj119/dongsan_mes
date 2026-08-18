// ============================================================================
// 주문 확정 시 자재 부족 경고 (Phase 5)
//   #465: 구 bom_items(동결) → 신모델(product_materials + 차감설정, autoDeduct 산식)로 재배선.
// ============================================================================
import { computeMaterialCoverage, type UnresolvedLine, type UnresolvedReason } from './materialRequirement'

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

/** 판정 불가 요약 — 「부족 없음」과 「자재를 모름」을 화면에서 갈라주기 위한 값 */
export interface CoverageGap {
  /** 소요량을 못 낸 라인 수 */
  lines: number
  /** 사유별 라인 수 */
  by_reason: Record<UnresolvedReason, number>
  /** 대표 품목명 (최대 5개, 중복 제거) */
  sample_names: string[]
}

export interface MaterialCoverageResult {
  warnings: ShortageWarning[]
  gap: CoverageGap | null   // 판정 불가가 0건이면 null
}

/**
 * 단일 주문에 대해 신모델 기반 자재 부족 체크 + **판정 불가 라인 요약**.
 * - 주문 품목 규격 → product_materials 차감산식(ROLL/BOARD, 분할근사) → 소요량
 * - 현재고 + 발주중 대비 부족량
 *
 * ⚠️ 부족 0건과 판정 불가는 전혀 다른 상태다. 예전엔 부족량만 돌려줘 둘 다 빈 배열이었고,
 *    화면에서 「자재 이상 없음」으로 똑같이 보였다 — 실측상 최근 라인의 1/3이 판정 불가였다.
 *    그래서 부족량만 내는 변형을 **일부러 두지 않는다**(있으면 다시 그걸 쓰게 된다).
 */
export async function checkMaterialCoverage(
  db: D1Database,
  orderId: number,
  entityId?: number
): Promise<MaterialCoverageResult> {
  // 1. 주문 품목 조회 (자녀=분할청구 라인은 부모가 실물을 갖는다 → 중복 계상 방지)
  const { results: orderItems } = await db.prepare(`
    SELECT oi.id, oi.item_id, oi.item_name,
           oi.width, oi.height, oi.quantity
    FROM order_items oi
    WHERE oi.order_id = ? AND oi.parent_item_id IS NULL
  `).bind(orderId).all()

  if (!orderItems || orderItems.length === 0) return { warnings: [], gap: null }

  // 2. 신모델 소요량 산정 (product_materials + 품목 차감설정) + 판정 불가 수집
  const { requirements: materialMap, unresolved } = await computeMaterialCoverage(db, orderItems as any[])
  const gap = summarizeGap(unresolved)
  if (materialMap.size === 0) return { warnings: [], gap }

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
  return { warnings, gap }
}

/** 사람이 읽는 한 줄. 서버·화면이 같은 문구를 쓰도록 여기서 만든다. */
export function describeGap(gap: CoverageGap): string {
  const parts: string[] = []
  if (gap.by_reason.NO_ITEM) parts.push(`품목 미연결 ${gap.by_reason.NO_ITEM}`)
  if (gap.by_reason.NO_SIZE) parts.push(`규격 없음 ${gap.by_reason.NO_SIZE}`)
  if (gap.by_reason.NO_MATERIAL_LINK) parts.push(`자재 미등록 ${gap.by_reason.NO_MATERIAL_LINK}`)
  const names = gap.sample_names.length ? ` (${gap.sample_names.join(', ')})` : ''
  return `자재 판정 불가 ${gap.lines}건 — ${parts.join(' · ')}${names}. 부족 여부를 확인하지 못했습니다.`
}

/** 판정 불가 라인 배열 → 사유별 집계. 0건이면 null(호출부에서 조건 표시가 쉬워진다). */
function summarizeGap(unresolved: UnresolvedLine[]): CoverageGap | null {
  if (unresolved.length === 0) return null
  const by_reason: Record<UnresolvedReason, number> = { NO_ITEM: 0, NO_SIZE: 0, NO_MATERIAL_LINK: 0 }
  const names: string[] = []
  for (const u of unresolved) {
    by_reason[u.reason] = (by_reason[u.reason] || 0) + 1
    const n = (u.item_name || '').trim()
    if (n && names.length < 5 && !names.includes(n)) names.push(n)
  }
  return { lines: unresolved.length, by_reason, sample_names: names }
}
