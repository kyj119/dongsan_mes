/**
 * purchaseOrders/stock-alerts.ts — 재고 경고 (3 routes)
 * 2026-04-15 분할
 */
import { Hono } from 'hono'
import type { HonoEnv } from '../../types/env'
import type { PurchaseOrder, PurchaseOrderItem, ApiResponse, PaginatedResponse } from '../../types/models'
import { authMiddleware, requireRole } from '../../middleware/auth'

const stockAlertsRouter = new Hono<HonoEnv>()
stockAlertsRouter.use('/*', authMiddleware, requireRole('ADMIN', 'MANAGER'))

stockAlertsRouter.get('/stock-alerts', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const status = c.req.query('status') || 'ACTIVE'

    const { results } = await c.env.DB.prepare(`
      SELECT sa.*, i.item_name, i.item_code, i.category, i.unit,
        inv.quantity as current_stock, inv.safe_stock, inv.reorder_point,
        sz.zone_name, u.name as acknowledged_by_name
      FROM stock_alerts sa
      JOIN items i ON sa.item_id = i.id
      LEFT JOIN inventory inv ON inv.item_id = i.id
      LEFT JOIN storage_zones sz ON i.storage_zone_id = sz.id
      LEFT JOIN users u ON sa.acknowledged_by = u.id
      WHERE sa.status = ?
      ORDER BY sa.created_at DESC
    `).bind(status).all()

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
    const { results: lowItems } = await c.env.DB.prepare(`
      SELECT inv.item_id, inv.quantity, inv.reorder_point, inv.safe_stock, inv.auto_pr_enabled
      FROM inventory inv
      JOIN items i ON inv.item_id = i.id
      WHERE i.is_active = 1
        AND inv.reorder_point > 0
        AND inv.quantity <= inv.reorder_point
        AND NOT EXISTS (
          SELECT 1 FROM stock_alerts sa
          WHERE sa.item_id = inv.item_id AND sa.status IN ('ACTIVE', 'ACKNOWLEDGED')
        )
    `).all() as any

    let created = 0
    for (const item of lowItems) {
      await c.env.DB.prepare(`
        INSERT INTO stock_alerts (item_id, alert_type, current_quantity, threshold_quantity)
        VALUES (?, ?, ?, ?)
      `).bind(
        item.item_id,
        item.quantity <= item.safe_stock ? 'LOW_STOCK' : 'REORDER_POINT',
        item.quantity,
        item.reorder_point
      ).run()
      created++
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
