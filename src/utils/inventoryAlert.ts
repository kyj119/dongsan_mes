// ============================================================================
// 재고 부족 알림 유틸리티 (Phase 6)
// - in-app 알림 (notifyRoles) + 외부 알림 (SMS) 통합
// ============================================================================

import { notifyRoles } from './notify'

export interface StockAlertItem {
  item_id: number
  item_name: string
  current_stock: number
  safe_stock: number
  unit: string
}

/**
 * 재고 부족 in-app 알림 발송 + stock_alerts 기록
 * - 외부 SMS/카카오 발송은 라우트 레벨에서 처리 (Provider 접근 필요)
 */
export async function triggerLowStockAlert(
  db: D1Database,
  items: StockAlertItem[],
  entityId: number,
): Promise<{ notified: number; newAlerts: number }> {
  if (items.length === 0) return { notified: 0, newAlerts: 0 }

  // 1. 이미 ACTIVE 알림이 있는 품목은 제외
  const itemIds = items.map(i => i.item_id)
  const ph = itemIds.map(() => '?').join(',')
  const { results: existing } = await db.prepare(
    `SELECT item_id FROM stock_alerts WHERE item_id IN (${ph}) AND status = 'ACTIVE'`
  ).bind(...itemIds).all()
  const existingSet = new Set((existing || []).map((e: any) => e.item_id))

  const newItems = items.filter(i => !existingSet.has(i.item_id))
  if (newItems.length === 0) return { notified: 0, newAlerts: 0 }

  // 2. stock_alerts 레코드 생성
  const alertStmts = newItems.map(i =>
    db.prepare(`
      INSERT INTO stock_alerts (item_id, alert_type, current_quantity, threshold_quantity, status, entity_id)
      VALUES (?, 'LOW_STOCK', ?, ?, 'ACTIVE', ?)
    `).bind(i.item_id, i.current_stock, i.safe_stock, entityId)
  )
  await db.batch(alertStmts)

  // 3. in-app 알림
  const itemList = newItems.slice(0, 5).map(i =>
    `${i.item_name}: ${i.current_stock}${i.unit} (안전재고 ${i.safe_stock})`
  ).join(', ')
  const suffix = newItems.length > 5 ? ` 외 ${newItems.length - 5}건` : ''

  await notifyRoles(db, ['ADMIN', 'MANAGER'],
    `재고 부족 알림 ${newItems.length}건`,
    `${itemList}${suffix}`,
    '/weekly-purchase'
  )

  return { notified: newItems.length, newAlerts: newItems.length }
}

/**
 * 주간 발주 분석 요약 SMS 본문 생성
 */
export function buildWeeklyPurchaseSMS(summary: {
  needs_order: number
  urgent: number
  high: number
  supplier_count: number
}): string {
  return `[동산MES] 주간 발주 분석 완료\n` +
    `발주 필요: ${summary.needs_order}건\n` +
    `긴급: ${summary.urgent}건, 높음: ${summary.high}건\n` +
    `공급처: ${summary.supplier_count}곳\n` +
    `MES에서 확인 후 발주해주세요.`
}
