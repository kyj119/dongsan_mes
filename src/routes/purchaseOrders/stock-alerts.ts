/**
 * purchaseOrders/stock-alerts.ts — 재고 경고 (3 routes)
 * 2026-04-15 분할
 */
import { Hono } from 'hono'
import type { HonoEnv } from '../../types/env'
import type { PurchaseOrder, PurchaseOrderItem, ApiResponse, PaginatedResponse } from '../../types/models'
import { authMiddleware, requireRole } from '../../middleware/auth'
import { getEntityId, entityFilter } from '../../utils/entityFilter'

const stockAlertsRouter = new Hono<HonoEnv>()
stockAlertsRouter.use('/*', authMiddleware, requireRole('ADMIN', 'MANAGER'))

stockAlertsRouter.get('/stock-alerts', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const status = c.req.query('status') || 'ACTIVE'
    const ef = entityFilter(c, 'sa')  // #446: 전 법인 재고알림 혼재(cross-tenant read) 차단

    // UP4: 창고별 다중행 → 품목×법인 단위로 집계(SUM/MAX)해 알림 행 중복·타법인 합산 방지.
    const { results } = await c.env.DB.prepare(`
      SELECT sa.*, i.item_name, i.item_code, i.category, i.unit,
        inv.quantity as current_stock, inv.safe_stock, inv.reorder_point,
        sz.zone_name, u.name as acknowledged_by_name
      FROM stock_alerts sa
      JOIN items i ON sa.item_id = i.id
      LEFT JOIN (
        SELECT item_id, entity_id, SUM(quantity) AS quantity,
               MAX(safe_stock) AS safe_stock, MAX(reorder_point) AS reorder_point
        FROM inventory GROUP BY item_id, entity_id
      ) inv ON inv.item_id = i.id AND inv.entity_id = sa.entity_id
      LEFT JOIN storage_zones sz ON i.storage_zone_id = sz.id
      LEFT JOIN users u ON sa.acknowledged_by = u.id
      WHERE sa.status = ?${ef.clause}
      ORDER BY sa.created_at DESC
    `).bind(status, ...ef.params).all()

    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('stock-alerts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// POST /stock-alerts/check - 안전재고 부족 품목 체크 & 알림 생성
// ============================================================================
stockAlertsRouter.post('/stock-alerts/check', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    // reorder_point 이하인 품목 중 아직 ACTIVE 알림이 없는 것만 생성
    // UP4: 품목×법인 총재고(SUM) 기준으로 판정(창고별 행단위 오탐 방지). 알림은 그 법인으로 생성.
    const { results: lowItems } = await c.env.DB.prepare(`
      SELECT agg.item_id, agg.entity_id, agg.quantity, agg.reorder_point, agg.safe_stock, agg.auto_pr_enabled
      FROM (
        SELECT inv.item_id, inv.entity_id,
          SUM(inv.quantity) AS quantity, MAX(inv.reorder_point) AS reorder_point,
          MAX(inv.safe_stock) AS safe_stock, MAX(inv.auto_pr_enabled) AS auto_pr_enabled
        FROM inventory inv
        JOIN items i ON inv.item_id = i.id
        WHERE i.is_active = 1
        GROUP BY inv.item_id, inv.entity_id
      ) agg
      WHERE agg.reorder_point > 0
        AND agg.quantity <= agg.reorder_point
        AND NOT EXISTS (
          SELECT 1 FROM stock_alerts sa
          WHERE sa.item_id = agg.item_id AND sa.entity_id = agg.entity_id
            AND sa.status IN ('ACTIVE', 'ACKNOWLEDGED')
        )
    `).all() as any

    let created = 0
    const alertStmts: D1PreparedStatement[] = []  // #350 단순 INSERT 루프 → batch
    for (const item of lowItems) {
      alertStmts.push(c.env.DB.prepare(`
        INSERT INTO stock_alerts (item_id, alert_type, current_quantity, threshold_quantity, entity_id)
        VALUES (?, ?, ?, ?, ?)
      `).bind(
        item.item_id,
        item.quantity <= item.safe_stock ? 'LOW_STOCK' : 'REORDER_POINT',
        item.quantity,
        item.reorder_point,
        item.entity_id || getEntityId(c) || 1
      ))
      created++
    }
    for (let i = 0; i < alertStmts.length; i += 80) {
      await c.env.DB.batch(alertStmts.slice(i, i + 80))
    }

    return c.json({ success: true, data: { created, total_low: lowItems.length }, message: `${created}건의 재고 부족 알림이 생성되었습니다.` })
  } catch (error) {
    console.error('stock-alerts check error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// PATCH /stock-alerts/:id/acknowledge - 알림 확인 처리
// ============================================================================
stockAlertsRouter.patch('/stock-alerts/:id/acknowledge', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')
    const user = c.get('user')

    await c.env.DB.prepare(`
      UPDATE stock_alerts SET status = 'ACKNOWLEDGED', acknowledged_by = ?, acknowledged_at = datetime('now')
      WHERE id = ? AND status = 'ACTIVE'
    `).bind(user.id, id).run()

    return c.json({ success: true, message: '알림이 확인되었습니다.' })
  } catch (error) {
    console.error('stock-alerts acknowledge error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// POST /quick - 빠른 발주 (PR 없이 바로 PO 생성, 자동승인 한도 체크)
// ============================================================================

export default stockAlertsRouter
