import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import type { D1Database } from '@cloudflare/workers-types'
import { authMiddleware } from '../middleware/auth'
import { entityFilter } from '../utils/entityFilter'

const notificationsRouter = new Hono<HonoEnv>()
notificationsRouter.use('/*', authMiddleware)

// ── Helper: 중복 방지 알림 생성 (당일 동일 title 스킵) ──
async function createIfNotExists(db: D1Database, targetRole: string, title: string, message: string, link: string) {
  const existing = await db.prepare(
    `SELECT id FROM notifications WHERE target_role = ? AND title = ? AND date(created_at) = date('now') LIMIT 1`
  ).bind(targetRole, title).first()
  if (existing) return
  await db.prepare(
    `INSERT INTO notifications (target_role, title, message, link) VALUES (?, ?, ?, ?)`
  ).bind(targetRole, title, message, link).run()
}

// Get notifications for current user
notificationsRouter.get('/', async (c) => {
  try {
    const user = c.get('user')
    const { limit = '20', unread_only = '' } = c.req.query()
    const safeLimit = Math.min(Number(limit) || 20, 50)

    let query = `SELECT id, user_id, target_role, title, message, link, is_read, created_at FROM notifications WHERE (user_id = ? OR (user_id IS NULL AND target_role = ?))`
    const params: any[] = [user.id, user.role]

    if (unread_only === '1') {
      query += ' AND is_read = 0'
    }

    query += ' ORDER BY is_read ASC, created_at DESC LIMIT ?'
    params.push(safeLimit)

    const { results } = await c.env.DB.prepare(query).bind(...params).all()

    const countResult = await c.env.DB.prepare(
      `SELECT COUNT(*) as count FROM notifications WHERE (user_id = ? OR (user_id IS NULL AND target_role = ?)) AND is_read = 0`
    ).bind(user.id, user.role).first<{ count: number }>()

    return c.json({
      success: true,
      data: results,
      unread_count: countResult?.count || 0
    })
  } catch (error) {
    console.error('src/routes/notifications.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// Get unread count only (lightweight polling)
notificationsRouter.get('/unread-count', async (c) => {
  try {
    const user = c.get('user')
    const result = await c.env.DB.prepare(
      `SELECT COUNT(*) as count FROM notifications WHERE (user_id = ? OR (user_id IS NULL AND target_role = ?)) AND is_read = 0`
    ).bind(user.id, user.role).first<{ count: number }>()

    return c.json({ success: true, count: result?.count || 0 })
  } catch (error) {
    return c.json({ success: false, count: 0 }, 500)
  }
})

// Nav badge counts for sidebar
notificationsRouter.get('/nav-badges', async (c) => {
  try {
    const db = c.env.DB
    const user = c.get('user')
    const isSupervisor = user?.role === 'ADMIN' || user?.role === 'MANAGER'
    const supervisorClause = isSupervisor ? "OR sz.manager_id IS NULL OR sz.id IS NULL" : ""

    // entity 필터
    const entityId = c.get('entityId') as number
    const efOrders = (entityId && entityId > 0) ? ' AND entity_id = ?' : ''
    const efOrdersParams = (entityId && entityId > 0) ? [entityId] : []
    const efPO = (entityId && entityId > 0) ? ' AND po.entity_id = ?' : ''
    const efPOParams = (entityId && entityId > 0) ? [entityId] : []

    const [orders, receivables, pr, inspPr, inspOverdue, myReceiving, tasksPending] = await Promise.all([
      db.prepare(`SELECT COUNT(*) as cnt FROM orders WHERE status = 'CONFIRMED'${efOrders}`).bind(...efOrdersParams).first<{ cnt: number }>(),
      db.prepare(`SELECT COUNT(DISTINCT client_id) as cnt FROM orders WHERE status != 'CANCELLED'${efOrders} GROUP BY client_id HAVING SUM(final_amount) - COALESCE((SELECT SUM(amount) FROM payments WHERE payments.client_id = orders.client_id), 0) > 0 AND MIN(created_at) < datetime('now', '-30 days')`).bind(...efOrdersParams).all().then((r) => ({ cnt: r.results?.length || 0 })),
      db.prepare(`SELECT COUNT(*) as cnt FROM purchase_requests WHERE status = 'PENDING'`).first<{ cnt: number }>(),
      db.prepare(`SELECT COUNT(*) as cnt FROM inventory_receipts WHERE inspection_status = 'PENDING_REVIEW'`).first<{ cnt: number }>(),
      db.prepare(`SELECT COUNT(*) as cnt FROM inventory_receipts WHERE inspection_status IS NULL AND status != 'CANCELLED' AND created_at <= datetime('now', '-24 hours')`).first<{ cnt: number }>(),
      // nav-badge-my-receiving: 내 담당 창고 입고 대기 라인 수
      db.prepare(`
        SELECT COUNT(*) as cnt
        FROM purchase_order_items poi
        JOIN purchase_orders po ON po.id = poi.po_id
        LEFT JOIN items i ON i.id = poi.item_id
        LEFT JOIN storage_zones sz ON sz.id = COALESCE(poi.storage_zone_id, i.storage_zone_id)
        WHERE poi.line_status IN ('PENDING','PARTIAL')
          AND po.status IN ('CONFIRMED','PARTIAL_RECEIVED')
          AND (sz.manager_id = ? ${supervisorClause})${efPO}
      `).bind(user?.id || 0, ...efPOParams).first<{ cnt: number }>(),
      db.prepare(`SELECT COUNT(*) as cnt FROM tasks WHERE status IN ('PENDING','PROCESSING','FAILED')`).first<{ cnt: number }>(),
    ])
    const inspTotal = (inspPr?.cnt || 0) + (inspOverdue?.cnt || 0)
    return c.json({
      success: true,
      data: {
        'nav-badge-orders': orders?.cnt || 0,
        'nav-badge-receivables': receivables?.cnt || 0,
        'nav-badge-pr': pr?.cnt || 0,
        'nav-badge-insp': inspTotal,
        'nav-badge-my-receiving': myReceiving?.cnt || 0,
        'nav-badge-tasks': tasksPending?.cnt || 0,
      }
    })
  } catch (error: any) {
    console.error('nav-badges error:', error?.message || error)
    return c.json({ success: true, data: {} })
  }
})

// Mark all as read (must be before /:id/read)
notificationsRouter.patch('/read-all', async (c) => {
  try {
    const user = c.get('user')
    await c.env.DB.prepare(
      `UPDATE notifications SET is_read = 1 WHERE (user_id = ? OR (user_id IS NULL AND target_role = ?)) AND is_read = 0`
    ).bind(user.id, user.role).run()
    return c.json({ success: true })
  } catch (error) {
    console.error('src/routes/notifications.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// Mark single notification as read
notificationsRouter.patch('/:id/read', async (c) => {
  try {
    const user = c.get('user')
    const id = c.req.param('id')
    await c.env.DB.prepare(
      `UPDATE notifications SET is_read = 1 WHERE id = ? AND (user_id = ? OR (user_id IS NULL AND target_role = ?))`
    ).bind(id, user.id, user.role).run()
    return c.json({ success: true })
  } catch (error) {
    console.error('src/routes/notifications.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ── POST /generate - 자동 알림 생성 (폴링 시 트리거) ──
notificationsRouter.post('/generate', async (c) => {
  try {
    const db = c.env.DB
    const today = new Date().toISOString().slice(0, 10)
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)

    // 1. 납기 도래/지연 주문
    const ef = entityFilter(c, 'o')
    const { results: dueOrders } = await db.prepare(`
      SELECT o.order_number, o.delivery_date, c.client_name
      FROM orders o LEFT JOIN clients c ON o.client_id = c.id
      WHERE o.status IN ('CONFIRMED','PRINTING','PRINT_DONE')
        AND o.delivery_date IS NOT NULL
        AND o.delivery_date <= ?${ef.clause}
      ORDER BY o.delivery_date ASC LIMIT 10
    `).bind(tomorrow, ...ef.params).all()

    if (dueOrders && dueOrders.length > 0) {
      const overdue = dueOrders.filter((o) => (o.delivery_date as string) <= today)
      const dueSoon = dueOrders.filter((o) => (o.delivery_date as string) > today)

      if (overdue.length > 0) {
        await createIfNotExists(db, 'MANAGER',
          `납기 지연 ${overdue.length}건`,
          overdue.slice(0, 3).map((o) => `${o.order_number} (${o.client_name})`).join(', '),
          '/orders')
      }
      if (dueSoon.length > 0) {
        await createIfNotExists(db, 'MANAGER',
          `내일 납기 ${dueSoon.length}건`,
          dueSoon.slice(0, 3).map((o) => `${o.order_number} (${o.client_name})`).join(', '),
          '/orders')
      }
    }

    // 2. 발주 납기 초과
    const efPo = entityFilter(c)
    const overduePoResult = await db.prepare(`
      SELECT COUNT(*) as cnt FROM purchase_orders
      WHERE status IN ('CONFIRMED','PARTIAL_RECEIVED')
        AND expected_date IS NOT NULL AND expected_date < ?${efPo.clause}
    `).bind(today, ...efPo.params).first<{ cnt: number }>()

    if (overduePoResult?.cnt && overduePoResult.cnt > 0) {
      await createIfNotExists(db, 'MANAGER',
        `발주 납기 초과 ${overduePoResult.cnt}건`,
        '입고 대기 중인 발주서의 납기가 지났습니다.',
        '/purchase-orders')
    }

    // 3. 장비 소모품/정비 기한 도래
    const alertResult = await db.prepare(`
      SELECT COUNT(*) as cnt FROM (
        SELECT id FROM equipment_consumables
        WHERE next_due_at IS NOT NULL AND next_due_at <= ?
        UNION ALL
        SELECT id FROM maintenance_schedules
        WHERE is_active = 1 AND next_due_at IS NOT NULL AND next_due_at <= ?
      )
    `).bind(tomorrow, tomorrow).first<{ cnt: number }>()

    if (alertResult?.cnt && alertResult.cnt > 0) {
      await createIfNotExists(db, 'MANAGER',
        `장비 정비/소모품 알림 ${alertResult.cnt}건`,
        '교체 또는 정비 기한이 도래한 항목이 있습니다.',
        '/equipment')
    }

    // 4. 재고 부족 (reorder_point 설정된 품목)
    const lowStockResult = await db.prepare(`
      SELECT COUNT(*) as cnt FROM inventory
      WHERE reorder_point > 0 AND quantity <= reorder_point
    `).first<{ cnt: number }>()

    if (lowStockResult?.cnt && lowStockResult.cnt > 0) {
      await createIfNotExists(db, 'MANAGER',
        `재고 부족 ${lowStockResult.cnt}개 품목`,
        '재주문점 이하로 떨어진 재고 품목이 있습니다.',
        '/inventory')
    }

    return c.json({ success: true })
  } catch (error) {
    console.error('src/routes/notifications.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ── DELETE old notifications (30일 이상) + 포털 토큰 정리 (90일) ──
notificationsRouter.delete('/cleanup', async (c) => {
  try {
    const retentionDays = Number(c.req.query('token_retention_days')) || 90

    const [notifResult, tokenResult] = await Promise.all([
      c.env.DB.prepare(
        `DELETE FROM notifications WHERE created_at < datetime('now', '-30 days')`
      ).run(),
      c.env.DB.prepare(
        `DELETE FROM portal_access_tokens WHERE created_at < datetime('now', '-' || ? || ' days')`
      ).bind(retentionDays).run(),
    ])

    return c.json({
      success: true,
      data: {
        notifications_deleted: notifResult.meta?.changes || 0,
        tokens_deleted: tokenResult.meta?.changes || 0,
        token_retention_days: retentionDays,
      }
    })
  } catch (error) {
    console.error('src/routes/notifications.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

export default notificationsRouter
