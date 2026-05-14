import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware } from '../middleware/auth'
import { requirePagePermission } from '../middleware/permissions'
import { entityFilter, getEntityId } from '../utils/entityFilter'

/** cards 테이블용 엔티티 필터 (requesting_entity_id 컬럼 사용) */
function cardEntityFilter(c: any, tableAlias?: string): { clause: string; params: number[] } {
  const entityId = getEntityId(c)
  if (entityId === 0) return { clause: '', params: [] }
  const prefix = tableAlias ? `${tableAlias}.` : ''
  return { clause: ` AND ${prefix}requesting_entity_id = ?`, params: [entityId] }
}

const dashboardRouter = new Hono<HonoEnv>()

// Apply authentication middleware
dashboardRouter.use('/*', authMiddleware, requirePagePermission('/dashboard'))

// Get dashboard statistics
dashboardRouter.get('/stats', async (c) => {
  try {
    const ef = entityFilter(c)
    const cf = cardEntityFilter(c)
    // Build basic stats query dynamically to support entity filter on orders + cards
    const basicStats = await c.env.DB.prepare(`
      SELECT
        (SELECT COUNT(*) FROM users WHERE is_active = 1) as active_users,
        (SELECT COUNT(*) FROM clients WHERE is_active = 1) as active_clients,
        (SELECT COUNT(*) FROM orders WHERE 1=1${ef.clause}) as total_orders,
        (SELECT COUNT(*) FROM orders WHERE status = 'CONFIRMED'${ef.clause}) as confirmed_orders,
        (SELECT COUNT(*) FROM orders WHERE status IN ('PRINTING', 'PRINT_DONE')${ef.clause}) as production_orders,
        (SELECT COUNT(*) FROM orders WHERE status = 'SHIPPED'${ef.clause}) as shipped_orders,
        (SELECT COUNT(*) FROM cards WHERE 1=1${cf.clause}) as total_cards,
        (SELECT COUNT(*) FROM cards WHERE status = 'PRINTING'${cf.clause}) as pending_cards,
        (SELECT COUNT(*) FROM cards WHERE status = 'PRINTING'${cf.clause}) as printing_cards,
        (SELECT COUNT(*) FROM cards WHERE status = 'PRINT_DONE'${cf.clause}) as done_cards,
        (SELECT COUNT(*) FROM cards WHERE status = 'HOLD'${cf.clause}) as hold_cards,
        (SELECT SUM(final_amount) FROM orders WHERE 1=1${ef.clause}) as total_revenue,
        (SELECT COUNT(*) FROM orders WHERE date(created_at) = date('now') AND status != 'CANCELLED'${ef.clause}) as today_order_count,
        (SELECT SUM(final_amount) FROM orders WHERE date(created_at) = date('now') AND status != 'CANCELLED'${ef.clause}) as today_revenue,
        (SELECT COUNT(*) FROM orders WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now') AND status != 'CANCELLED'${ef.clause}) as month_order_count,
        (SELECT SUM(final_amount) FROM orders WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now') AND status != 'CANCELLED'${ef.clause}) as month_revenue,
        (SELECT SUM(final_amount) FROM orders WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', date('now', '-1 month')) AND status != 'CANCELLED'${ef.clause}) as prev_month_revenue,
        (SELECT COUNT(*) FROM orders WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', date('now', '-1 month')) AND status != 'CANCELLED'${ef.clause}) as prev_month_order_count,
        (SELECT SUM(final_amount) FROM orders WHERE date(created_at) >= date('now', '-7 days') AND status != 'CANCELLED'${ef.clause}) as week_revenue,
        (SELECT COUNT(*) FROM cards WHERE status = 'PRINT_DONE'${cf.clause}) as shipment_ready_count,
        (SELECT COUNT(*) FROM orders WHERE delivery_date = date('now') AND status NOT IN ('SHIPPED','CANCELLED')${ef.clause}) as today_shipment_due,
        (SELECT COUNT(*) FROM orders WHERE priority='URGENT' AND status NOT IN ('SHIPPED','CANCELLED')${ef.clause}) as urgent_count,
        (SELECT COALESCE(SUM(final_amount),0) FROM orders WHERE billing_status='BILLED' AND strftime('%Y-%m',billed_at)=strftime('%Y-%m','now')${ef.clause}) as month_billed,
        (SELECT COALESCE(SUM(amount),0) FROM payments WHERE strftime('%Y-%m',payment_date)=strftime('%Y-%m','now')) as month_paid,
        (SELECT ROUND(
          COUNT(CASE WHEN o2.status = 'SHIPPED' AND date(o2.updated_at) <= date(o2.delivery_date) THEN 1 END) * 100.0 /
          NULLIF(COUNT(*), 0), 1)
         FROM orders o2 WHERE o2.status IN ('SHIPPED') AND strftime('%Y-%m', o2.created_at) = strftime('%Y-%m', 'now') AND o2.delivery_date IS NOT NULL${ef.clause}
        ) as on_time_rate
    `).bind(...[
      ...ef.params, // total_orders
      ...ef.params, // confirmed_orders
      ...ef.params, // production_orders
      ...ef.params, // shipped_orders
      ...cf.params, // total_cards
      ...cf.params, // pending_cards
      ...cf.params, // printing_cards
      ...cf.params, // done_cards
      ...cf.params, // hold_cards
      ...ef.params, // total_revenue
      ...ef.params, // today_order_count
      ...ef.params, // today_revenue
      ...ef.params, // month_order_count
      ...ef.params, // month_revenue
      ...ef.params, // prev_month_revenue
      ...ef.params, // prev_month_order_count
      ...ef.params, // week_revenue
      ...cf.params, // shipment_ready_count
      ...ef.params, // today_shipment_due
      ...ef.params, // urgent_count
      ...ef.params, // month_billed
      ...ef.params, // on_time_rate
    ]).first()

    // 후가공 통계: 활성 카드의 post_processing JSON을 TypeScript에서 파싱
    const { results: ppCards } = await c.env.DB.prepare(`
      SELECT post_processing FROM cards
      WHERE status IN ('PRINTING', 'PRINT_DONE')
      AND post_processing IS NOT NULL AND post_processing != '' AND post_processing != '[]'${cf.clause}
    `).bind(...cf.params).all<{ post_processing: string }>()

    const ppCounts: Record<string, number> = {}
    for (const row of (ppCards || [])) {
      try {
        const ppArr = JSON.parse(row.post_processing)
        if (Array.isArray(ppArr)) {
          for (const pp of ppArr) {
            const name = pp.name || pp.code || String(pp)
            ppCounts[name] = (ppCounts[name] || 0) + 1
          }
        }
      } catch (e) {
        console.error('post_processing JSON 파싱 실패:', String(e))
      }
    }

    // 대시보드 통계는 5분간 캐시 (빈번 새로고침 시 D1 부하 절감)
    c.header('Cache-Control', 'private, max-age=300')
    return c.json({
      success: true,
      data: {
        ...basicStats,
        pp_stats: ppCounts
      }
    })
  } catch (error) {
    console.error('Dashboard error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// Get daily statistics (last 7 days)
dashboardRouter.get('/stats/daily', async (c) => {
  try {
    const ef = entityFilter(c)
    const { results } = await c.env.DB.prepare(`
      SELECT
        date(created_at) as date,
        COUNT(*) as order_count,
        SUM(final_amount) as revenue
      FROM orders
      WHERE date(created_at) >= date('now', '-7 days')${ef.clause}
      GROUP BY date(created_at)
      ORDER BY date(created_at) DESC
    `).bind(...ef.params).all()

    return c.json({
      success: true,
      data: results
    })
  } catch (error) {
    console.error('Dashboard stats/daily error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// Get weekly statistics (last 4 weeks)
dashboardRouter.get('/stats/weekly', async (c) => {
  try {
    const ef = entityFilter(c)
    const { results } = await c.env.DB.prepare(`
      SELECT
        strftime('%Y-W%W', created_at) as week,
        COUNT(*) as order_count,
        SUM(final_amount) as revenue
      FROM orders
      WHERE date(created_at) >= date('now', '-28 days')${ef.clause}
      GROUP BY strftime('%Y-W%W', created_at)
      ORDER BY week DESC
    `).bind(...ef.params).all()

    return c.json({
      success: true,
      data: results
    })
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// Get monthly statistics (last 6 months)
dashboardRouter.get('/stats/monthly', async (c) => {
  try {
    const ef = entityFilter(c)
    const { results } = await c.env.DB.prepare(`
      SELECT
        strftime('%Y-%m', created_at) as month,
        COUNT(*) as order_count,
        SUM(final_amount) as revenue
      FROM orders
      WHERE date(created_at) >= date('now', '-180 days')${ef.clause}
      GROUP BY strftime('%Y-%m', created_at)
      ORDER BY month DESC
    `).bind(...ef.params).all()

    return c.json({
      success: true,
      data: results
    })
  } catch (error) {
    console.error('src/routes/dashboard.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// Get client-wise order summary
dashboardRouter.get('/stats/clients', async (c) => {
  try {
    const ef = entityFilter(c, 'o')
    const { results } = await c.env.DB.prepare(`
      SELECT
        c.id,
        c.client_code,
        c.client_name,
        COUNT(o.id) as order_count,
        SUM(o.final_amount) as total_revenue,
        MAX(o.created_at) as last_order_date
      FROM clients c
      LEFT JOIN orders o ON c.id = o.client_id
      WHERE c.is_active = 1${ef.clause}
      GROUP BY c.id
      HAVING order_count > 0
      ORDER BY total_revenue DESC
      LIMIT 10
    `).bind(...ef.params).all()

    return c.json({
      success: true,
      data: results
    })
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// Get status distribution
dashboardRouter.get('/stats/status-distribution', async (c) => {
  try {
    const ef = entityFilter(c)
    const cf = cardEntityFilter(c)
    const orderStatus = await c.env.DB.prepare(`
      SELECT
        status,
        COUNT(*) as count
      FROM orders
      WHERE 1=1${ef.clause}
      GROUP BY status
    `).bind(...ef.params).all()

    const cardStatus = await c.env.DB.prepare(`
      SELECT
        status,
        COUNT(*) as count
      FROM cards
      WHERE 1=1${cf.clause}
      GROUP BY status
    `).bind(...cf.params).all()

    return c.json({
      success: true,
      data: {
        orders: orderStatus.results,
        cards: cardStatus.results
      }
    })
  } catch (error) {
    console.error('src/routes/dashboard.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// Get card progress (delivery date based)
dashboardRouter.get('/stats/card-progress', async (c) => {
  try {
    const cf = cardEntityFilter(c)
    const { results } = await c.env.DB.prepare(`
      SELECT
        CASE
          WHEN julianday(delivery_date) - julianday('now') <= 2 THEN 'urgent'
          WHEN julianday(delivery_date) - julianday('now') <= 7 THEN 'soon'
          ELSE 'normal'
        END as urgency,
        status,
        COUNT(*) as count
      FROM cards
      WHERE delivery_date IS NOT NULL${cf.clause}
      GROUP BY urgency, status
      ORDER BY urgency, status
    `).bind(...cf.params).all()

    return c.json({
      success: true,
      data: results
    })
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// Receivables dashboard (미수금 현황)
dashboardRouter.get('/stats/receivables', async (c) => {
  try {
    const ef = entityFilter(c, 'o')
    const efP = entityFilter(c, 'p')

    // TOP 10 clients by balance
    const { results: topClients } = await c.env.DB.prepare(`
      SELECT
        c.id, c.client_code, c.client_name, c.balance,
        (SELECT MAX(p.payment_date) FROM payments p WHERE p.client_id = c.id${efP.clause}) as last_payment_date,
        (SELECT COUNT(*) FROM orders o WHERE o.client_id = c.id AND o.billing_status = 'BILLED'${ef.clause}) as billed_order_count
      FROM clients c
      WHERE c.is_active = 1 AND c.balance > 0
      ORDER BY c.balance DESC
      LIMIT 10
    `).bind(...efP.params, ...ef.params).all()

    // Aging buckets (연체 구간)
    const aging = await c.env.DB.prepare(`
      SELECT
        SUM(CASE WHEN julianday('now') - julianday(o.billed_at) <= 30 THEN o.billed_amount ELSE 0 END) as current_amount,
        SUM(CASE WHEN julianday('now') - julianday(o.billed_at) > 30 AND julianday('now') - julianday(o.billed_at) <= 60 THEN o.billed_amount ELSE 0 END) as over_30,
        SUM(CASE WHEN julianday('now') - julianday(o.billed_at) > 60 AND julianday('now') - julianday(o.billed_at) <= 90 THEN o.billed_amount ELSE 0 END) as over_60,
        SUM(CASE WHEN julianday('now') - julianday(o.billed_at) > 90 THEN o.billed_amount ELSE 0 END) as over_90,
        COUNT(CASE WHEN julianday('now') - julianday(o.billed_at) > 30 THEN 1 END) as overdue_count
      FROM orders o
      WHERE o.billing_status = 'BILLED'${ef.clause}
        AND NOT EXISTS (
          SELECT 1 FROM payments p
          WHERE p.client_id = o.client_id
          AND p.amount >= o.billed_amount
          AND p.payment_date >= o.billed_at
        )
    `).bind(...ef.params).first()

    // Total receivables
    const totals = await c.env.DB.prepare(`
      SELECT
        COALESCE(SUM(balance), 0) as total_receivables,
        COUNT(CASE WHEN balance > 0 THEN 1 END) as clients_with_balance
      FROM clients
      WHERE is_active = 1
    `).first()

    return c.json({
      success: true,
      data: {
        top_clients: topClients,
        aging: {
          current: aging?.current_amount || 0,
          over_30: aging?.over_30 || 0,
          over_60: aging?.over_60 || 0,
          over_90: aging?.over_90 || 0,
          overdue_count: aging?.overdue_count || 0
        },
        total_receivables: (totals as Record<string, unknown>)?.total_receivables || 0,
        clients_with_balance: (totals as Record<string, unknown>)?.clients_with_balance || 0
      }
    })
  } catch (error) {
    console.error('Get receivables stats error:', error)
    console.error('src/routes/dashboard.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// 납기 지연 발주서 목록 (미입고 경고)
dashboardRouter.get('/overdue-pos', async (c) => {
  try {
    const ef = entityFilter(c, 'po')
    const { results } = await c.env.DB.prepare(`
      SELECT
        po.id, po.po_number, po.expected_date, po.status, po.final_amount,
        c.client_name as supplier_name,
        CAST(julianday('now') - julianday(po.expected_date) AS INTEGER) as overdue_days
      FROM purchase_orders po
      LEFT JOIN clients c ON po.supplier_id = c.id
      WHERE po.status IN ('CONFIRMED', 'PARTIAL_RECEIVED')
        AND po.expected_date IS NOT NULL
        AND po.expected_date < date('now')${ef.clause}
      ORDER BY po.expected_date ASC
      LIMIT 20
    `).bind(...ef.params).all()

    return c.json({ success: true, data: results })
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// 재고 부족 품목 목록 (안전재고 이하)
dashboardRouter.get('/low-stock', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT
        i.id, i.item_name, i.category, i.unit,
        COALESCE(inv.quantity, 0) as current_stock,
        COALESCE(inv.safe_stock, 0) as safety_stock,
        COALESCE(inv.reorder_point, 0) as reorder_point,
        ROUND(COALESCE(inv.safe_stock, 0) - COALESCE(inv.quantity, 0), 1) as shortage
      FROM items i
      JOIN inventory inv ON i.id = inv.item_id
      WHERE i.is_purchase_item = 1 AND i.is_active = 1
        AND inv.quantity <= inv.safe_stock AND inv.safe_stock > 0
      ORDER BY (inv.safe_stock - inv.quantity) DESC
      LIMIT 10
    `).all()

    return c.json({ success: true, data: results })
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// 금일 납기 주문 (출고 안 된 것)
dashboardRouter.get('/stats/today-due', async (c) => {
  try {
    const ef = entityFilter(c, 'o')
    const { results } = await c.env.DB.prepare(`
      SELECT o.id, o.order_number, o.delivery_date, o.final_amount, o.status, o.priority,
        c.client_name
      FROM orders o
      LEFT JOIN clients c ON o.client_id = c.id
      WHERE o.delivery_date <= date('now')
        AND o.status NOT IN ('SHIPPED', 'CANCELLED', 'QUOTATION')${ef.clause}
      ORDER BY o.delivery_date ASC, o.priority DESC
      LIMIT 20
    `).bind(...ef.params).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('src/routes/dashboard.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// 최근 7일 주문 추이
dashboardRouter.get('/stats/weekly-trend', async (c) => {
  try {
    const ef = entityFilter(c)
    const { results } = await c.env.DB.prepare(`
      SELECT
        date(created_at) as date,
        COUNT(*) as order_count,
        COALESCE(SUM(final_amount), 0) as revenue
      FROM orders
      WHERE date(created_at) >= date('now', '-6 days')
        AND status != 'CANCELLED'${ef.clause}
      GROUP BY date(created_at)
      ORDER BY date ASC
    `).bind(...ef.params).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('src/routes/dashboard.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// 카드 상태 분포
dashboardRouter.get('/stats/card-distribution', async (c) => {
  try {
    const cf = cardEntityFilter(c)
    const { results } = await c.env.DB.prepare(`
      SELECT status, COUNT(*) as count
      FROM cards
      WHERE status NOT IN ('CANCELLED')${cf.clause}
      GROUP BY status
    `).bind(...cf.params).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('src/routes/dashboard.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// 장비별 부하 현황 (대시보드 위젯)
dashboardRouter.get('/equipment-load', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT e.id, e.name, e.equipment_status, COALESCE(e.daily_capacity, 0) as daily_capacity,
        (SELECT COUNT(*) FROM cards c WHERE c.equipment_id = e.id AND c.status = 'PRINTING') as queue_count,
        ah.last_seen_at,
        CASE
          WHEN ah.last_seen_at IS NULL THEN 'OFFLINE'
          WHEN (julianday('now') - julianday(ah.last_seen_at)) * 86400 > 120 THEN 'OFFLINE'
          ELSE 'ONLINE'
        END as agent_status
      FROM equipment e
      LEFT JOIN agent_heartbeats ah ON ah.equipment_id = e.id
      WHERE e.status = 'ACTIVE'
      ORDER BY e.name
    `).all()

    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('src/routes/dashboard.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// 금일 생산 실적 (print_events 기반)
dashboardRouter.get('/stats/production-today', async (c) => {
  try {
    const summary = await c.env.DB.prepare(`
      SELECT
        COUNT(*) as total_prints,
        SUM(CASE WHEN pe.print_status = 'OK' THEN 1 ELSE 0 END) as ok_count,
        SUM(CASE WHEN pe.print_status = 'CANCEL' THEN 1 ELSE 0 END) as cancel_count,
        SUM(CASE WHEN pe.print_status = 'ERROR' THEN 1 ELSE 0 END) as error_count
      FROM print_events pe
      WHERE date(pe.created_at) = date('now')
    `).first()

    const { results: byEquipment } = await c.env.DB.prepare(`
      SELECT pe.equipment_id, e.name as equipment_name,
        COUNT(*) as total,
        SUM(CASE WHEN pe.print_status = 'OK' THEN 1 ELSE 0 END) as ok_count
      FROM print_events pe
      LEFT JOIN equipment e ON pe.equipment_id = e.id
      WHERE date(pe.created_at) = date('now')
      GROUP BY pe.equipment_id
      ORDER BY total DESC
    `).all()

    return c.json({
      success: true,
      data: {
        total_prints: (summary as Record<string, unknown>)?.total_prints || 0,
        ok_count: (summary as Record<string, unknown>)?.ok_count || 0,
        cancel_count: (summary as Record<string, unknown>)?.cancel_count || 0,
        error_count: (summary as Record<string, unknown>)?.error_count || 0,
        by_equipment: byEquipment
      }
    })
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// 최근 7일 장비별 가동률 (print_events 기반)
dashboardRouter.get('/stats/uptime-weekly', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT pe.equipment_id, e.name as equipment_name,
        COUNT(DISTINCT date(pe.created_at)) as active_days,
        COUNT(*) as total_events,
        SUM(CASE WHEN pe.print_status = 'OK' THEN 1 ELSE 0 END) as ok_events
      FROM print_events pe
      LEFT JOIN equipment e ON pe.equipment_id = e.id
      WHERE date(pe.created_at) >= date('now', '-6 days')
      GROUP BY pe.equipment_id
      ORDER BY total_events DESC
    `).all()

    interface UptimeRow { equipment_id: number; equipment_name: string; active_days: number; total_events: number; ok_events: number }
    const data = (results as unknown as UptimeRow[]).map((row) => ({
      equipment_id: row.equipment_id,
      equipment_name: row.equipment_name,
      active_days: row.active_days,
      total_events: row.total_events,
      ok_events: row.ok_events,
      uptime_ratio: Number((row.active_days / 7).toFixed(4))
    }))

    return c.json({ success: true, data })
  } catch (error) {
    console.error('src/routes/dashboard.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// 최근 활동: 최근 주문 5건 + 최근 출고 5건
dashboardRouter.get('/stats/recent-activity', async (c) => {
  try {
    const ef = entityFilter(c, 'o')
    const { results: recentOrders } = await c.env.DB.prepare(`
      SELECT o.id, o.order_number, o.final_amount, o.status, o.created_at,
        c.client_name
      FROM orders o
      LEFT JOIN clients c ON o.client_id = c.id
      WHERE o.status != 'CANCELLED'${ef.clause}
      ORDER BY o.created_at DESC
      LIMIT 5
    `).bind(...ef.params).all()

    const { results: recentShipments } = await c.env.DB.prepare(`
      SELECT s.id, s.shipment_number, s.shipped_at, s.status,
        o.order_number, o.final_amount,
        c.client_name
      FROM shipments s
      LEFT JOIN orders o ON s.order_id = o.id
      LEFT JOIN clients c ON o.client_id = c.id
      WHERE s.status != 'CANCELLED'${ef.clause}
      ORDER BY s.shipped_at DESC
      LIMIT 5
    `).bind(...ef.params).all()

    return c.json({
      success: true,
      data: {
        recent_orders: recentOrders,
        recent_shipments: recentShipments
      }
    })
  } catch (error) {
    console.error('src/routes/dashboard.ts recent-activity error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

export default dashboardRouter