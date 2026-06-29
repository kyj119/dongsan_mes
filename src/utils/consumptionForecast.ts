// ============================================================================
// 소모 예측 엔진 — inventory_transactions 기반 주간 평균 소모량 산출
// ============================================================================

export interface ConsumptionData {
  item_id: number
  item_name: string
  category: string | null
  unit: string
  current_stock: number
  safe_stock: number
  reorder_point: number
  auto_pr_enabled: number
  /** 최근 N주간 총 출고량 */
  total_consumption: number
  /** 주간 평균 소모량 */
  weekly_avg: number
  /** 소모 데이터가 있는 주(week) 수 */
  active_weeks: number
  /** entity_id */
  entity_id: number
}

/**
 * 품목별 주간 평균 소모량 계산
 * - inventory_transactions에서 OUT 타입 기록을 분석
 * - 최근 weeksBack 주간의 데이터를 기반으로 주간 평균 산출
 */
export async function getConsumptionForecast(
  db: D1Database,
  options: {
    entityId: number
    weeksBack?: number  // 기본 8주
    itemIds?: number[]  // 특정 품목만 조회 (없으면 전체 purchase_item)
  }
): Promise<ConsumptionData[]> {
  const weeksBack = options.weeksBack || 8
  const entityId = options.entityId
  const sinceDate = new Date()
  sinceDate.setDate(sinceDate.getDate() - weeksBack * 7)
  const sinceDateStr = sinceDate.toISOString().split('T')[0]

  // 1. 재고 품목 목록 (is_purchase_item=1, auto_pr_enabled or safe_stock > 0)
  let itemFilter = ''
  const params: any[] = []

  if (options.itemIds && options.itemIds.length > 0) {
    const ph = options.itemIds.map(() => '?').join(',')
    itemFilter = `AND i.id IN (${ph})`
    params.push(...options.itemIds)
  }

  const invCondition = entityId > 0
    ? 'LEFT JOIN inventory inv ON i.id = inv.item_id AND inv.entity_id = ?'
    : 'LEFT JOIN inventory inv ON i.id = inv.item_id'
  const invParams = entityId > 0 ? [entityId] : []

  // UP4: 창고별 다중행 → 품목당 1행으로 집계. current_stock=SUM(전 창고), 임계치=MAX(기본창고 행에 저장됨).
  //   GROUP BY 없으면 다중 창고 보유 품목이 행 중복 → 이중 발주·재고 분할 오집계(회귀).
  const { results: items } = await db.prepare(`
    SELECT
      i.id as item_id, i.item_name, i.category, i.unit,
      COALESCE(SUM(inv.quantity), 0) as current_stock,
      COALESCE(MAX(inv.safe_stock), 0) as safe_stock,
      COALESCE(MAX(inv.reorder_point), 0) as reorder_point,
      COALESCE(MAX(inv.auto_pr_enabled), 0) as auto_pr_enabled,
      COALESCE(MAX(inv.entity_id), ${entityId || 1}) as entity_id
    FROM items i
    ${invCondition}
    WHERE i.is_purchase_item = 1 AND i.is_active = 1 ${itemFilter}
    GROUP BY i.id
    ORDER BY i.category, i.item_name
  `).bind(...invParams, ...params).all()

  if (items.length === 0) return []

  // 2. 출고 이력 집계 (최근 N주)
  //    바인드 한도 회피(B): item 필터를 JOIN으로 푸시다운 → itemIds IN(...) 바인드 제거
  //    (활성 매입품목 >100이어도 D1 "too many SQL variables" 안 남)
  const txCondition = entityId > 0
    ? `AND t.entity_id = ?`
    : ''
  const txParams = entityId > 0 ? [entityId] : []

  const { results: consumption } = await db.prepare(`
    SELECT
      t.item_id,
      SUM(ABS(t.quantity)) as total_out,
      COUNT(DISTINCT strftime('%Y-%W', t.transaction_date)) as active_weeks
    FROM inventory_transactions t
    JOIN items i ON i.id = t.item_id
    WHERE t.transaction_type = 'OUT'
      AND t.transaction_date >= ?
      AND i.is_purchase_item = 1 AND i.is_active = 1 ${itemFilter}
      ${txCondition}
    GROUP BY t.item_id
  `).bind(sinceDateStr, ...params, ...txParams).all()

  // 소모 데이터 맵
  const consumptionMap: Record<number, { total: number; weeks: number }> = {}
  for (const c of consumption) {
    consumptionMap[c.item_id as number] = {
      total: c.total_out as number,
      weeks: Math.max(c.active_weeks as number, 1),
    }
  }

  // 3. 결과 조합
  return items.map((it: any) => {
    const cons = consumptionMap[it.item_id] || { total: 0, weeks: 0 }
    const weeklyAvg = cons.weeks > 0 ? cons.total / weeksBack : 0

    return {
      item_id: it.item_id,
      item_name: it.item_name,
      category: it.category,
      unit: it.unit,
      current_stock: it.current_stock,
      safe_stock: it.safe_stock,
      reorder_point: it.reorder_point,
      auto_pr_enabled: it.auto_pr_enabled,
      total_consumption: cons.total,
      weekly_avg: Math.round(weeklyAvg * 100) / 100,
      active_weeks: cons.weeks,
      entity_id: it.entity_id,
    } as ConsumptionData
  })
}
