import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { requirePagePermission } from '../middleware/permissions'
import { sendEmail } from '../services/emailProvider'
import { renderTemplate } from '../services/emailTemplates'
import { entityFilter, getEntityId } from '../utils/entityFilter'

const shipmentsRouter = new Hono<HonoEnv>()
shipmentsRouter.use('/*', authMiddleware, requirePagePermission('/shipments'))

// ============================================================================
// GET / - 출고 목록
// ============================================================================
shipmentsRouter.get('/', async (c) => {
  try {
    const { page = '1', limit = '30', status = '', search = '', date_from = '', date_to = '', date = '', courier_name = '' } = c.req.query()
    const safeLimit = Math.min(parseInt(limit) || 30, 200)
    const offset = (parseInt(page) - 1) * safeLimit

    const whereClauses: string[] = []
    const params: any[] = []

    if (status) {
      whereClauses.push('s.status = ?')
      params.push(status)
    }
    if (search) {
      whereClauses.push('(s.shipment_number LIKE ? OR o.order_number LIKE ? OR cl.client_name LIKE ? OR s.tracking_number LIKE ?)')
      const p = `%${search}%`
      params.push(p, p, p, p)
    }
    if (date_from) {
      whereClauses.push('s.created_at >= ?')
      params.push(date_from + ' 00:00:00')
    }
    if (date_to) {
      whereClauses.push('s.created_at < ?')
      params.push(date_to + ' 23:59:59')
    }
    if (date) {
      whereClauses.push("s.shipped_at >= ? AND s.shipped_at < ?")
      params.push(date + ' 00:00:00', date + ' 23:59:59')
    }
    if (courier_name) {
      whereClauses.push("s.courier_name = ?")
      params.push(courier_name)
    }

    const ef = entityFilter(c, 'o')
    if (ef.clause) {
      whereClauses.push(ef.clause.replace(/^ AND /, ''))
      params.push(...ef.params)
    }

    const where = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : ''

    const { results } = await c.env.DB.prepare(`
      -- 주의: receiver_address는 shipments 테이블 컬럼(s.*)에 포함됨.
      -- 스펙 4-2 표의 'orders.receiver_address' 표기는 오기. orders 테이블에 해당 컬럼 없음.
      SELECT s.*,
             o.order_number, o.delivery_date, o.delivery_method, o.contact_phone,
             cl.id as client_id, cl.client_name, cl.delivery_address, cl.mobile,
             u.name as created_by_name,
             (SELECT GROUP_CONCAT(item_name, ' / ')
              FROM (SELECT item_name FROM order_items
                    WHERE order_id = s.order_id AND parent_item_id IS NULL
                    LIMIT 3)) as item_summary
      FROM shipments s
      JOIN orders o ON s.order_id = o.id
      LEFT JOIN clients cl ON o.client_id = cl.id
      LEFT JOIN users u ON s.created_by = u.id
      ${where}
      ORDER BY s.shipped_at DESC, s.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(...params, safeLimit, offset).all()

    const countRow = await c.env.DB.prepare(`
      SELECT COUNT(*) as count FROM shipments s
      JOIN orders o ON s.order_id = o.id
      LEFT JOIN clients cl ON o.client_id = cl.id
      ${where}
    `).bind(...params).first<{ count: number }>()

    const total = countRow?.count ?? 0
    return c.json({
      success: true,
      data: results,
      pagination: { page: parseInt(page), limit: safeLimit, total, total_pages: Math.ceil(total / safeLimit) }
    })
  } catch (error) {
    console.error('src/routes/shipments.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// GET /stats - 출고 통계
// ============================================================================
shipmentsRouter.get('/stats', async (c) => {
  try {
    const ef = entityFilter(c, 'o')
    const stats = await c.env.DB.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN s.status = 'PREPARING' THEN 1 ELSE 0 END) as preparing,
        SUM(CASE WHEN s.status = 'SHIPPED' THEN 1 ELSE 0 END) as shipped,
        SUM(CASE WHEN s.status = 'IN_TRANSIT' THEN 1 ELSE 0 END) as in_transit,
        SUM(CASE WHEN s.status = 'DELIVERED' THEN 1 ELSE 0 END) as delivered
      FROM shipments s
      JOIN orders o ON s.order_id = o.id
      WHERE s.status != 'CANCELLED'${ef.clause}
    `).bind(...ef.params).first()
    return c.json({ success: true, data: stats })
  } catch (error) {
    console.error('src/routes/shipments.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// GET /daily - 날짜별 출고 관리 (delivery_date 기준 주문 + 카드 상태)
// ============================================================================
shipmentsRouter.get('/daily', async (c) => {
  try {
    const { date } = c.req.query()
    const targetDate = date || new Date().toISOString().substring(0, 10)

    const efDaily = entityFilter(c, 'o')
    const { results } = await c.env.DB.prepare(`
      SELECT o.id, o.order_number, o.delivery_date, o.delivery_method, o.delivery_info,
             o.delivery_time, o.status, o.final_amount, o.contact_phone, o.notes,
             o.reception_location, o.shipping_payment,
             cl.id as client_id, cl.client_name, cl.phone as client_phone, cl.mobile as client_mobile,
             cl.address as client_address, cl.delivery_address,
             COUNT(c.id) as total_cards,
             SUM(CASE WHEN c.status = 'PRINT_DONE' THEN 1 ELSE 0 END) as done_cards,
             SUM(CASE WHEN c.status IN ('RIP_READY', 'PRINTING') THEN 1 ELSE 0 END) as printing_cards,
             SUM(CASE WHEN c.shipped_at IS NOT NULL THEN 1 ELSE 0 END) as shipped_cards
      FROM orders o
      JOIN clients cl ON o.client_id = cl.id
      LEFT JOIN cards c ON c.order_id = o.id
      WHERE o.delivery_date = ? AND o.status NOT IN ('CANCELLED', 'DELETED', 'DRAFT')${efDaily.clause}
      GROUP BY o.id
      ORDER BY o.delivery_time ASC NULLS LAST, o.delivery_method ASC, cl.client_name ASC
    `).bind(targetDate, ...efDaily.params).all()

    // 품목 상세
    interface DailyOrderRow { id: number; [key: string]: unknown }
    interface DailyItemRow { order_id: number; item_name: string; category_name: string | null; width: number | null; height: number | null; quantity: number; content: string | null }
    const orderIds = (results as DailyOrderRow[]).map(r => r.id)
    const ordersWithItems = results as (DailyOrderRow & { items?: DailyItemRow[]; item_summary?: string })[]

    if (orderIds.length > 0) {
      const placeholders = orderIds.map(() => '?').join(',')
      const { results: itemRows } = await c.env.DB.prepare(`
        SELECT oi.order_id, oi.item_name, oi.category_name, oi.width, oi.height,
               oi.quantity, oi.content
        FROM order_items oi
        WHERE oi.order_id IN (${placeholders}) AND oi.parent_item_id IS NULL
        ORDER BY oi.order_id, oi.id
      `).bind(...orderIds).all<DailyItemRow>()

      const itemsByOrder: Record<number, DailyItemRow[]> = {}
      for (const item of itemRows) {
        if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = []
        itemsByOrder[item.order_id].push(item)
      }

      for (const order of ordersWithItems) {
        order.items = itemsByOrder[order.id] || []
        // 품목 요약
        order.item_summary = order.items.map((i) => {
          const size = (i.width && i.height) ? `${i.width}x${i.height}` : ''
          return `${i.item_name}${size ? ' ' + size : ''} x${i.quantity}`
        }).join(', ')
      }
    }

    return c.json({ success: true, data: ordersWithItems })
  } catch (error) {
    console.error('shipments daily error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다' }, 500)
  }
})

// ============================================================================
// GET /ready-orders - 출고 가능 주문 목록 (PRINT_DONE 카드가 있는 주문)
// ============================================================================
shipmentsRouter.get('/ready-orders', async (c) => {
  try {
    const efReady = entityFilter(c, 'o')
    const { results } = await c.env.DB.prepare(`
      SELECT o.id, o.order_number, o.delivery_date, o.delivery_method, o.delivery_info,
             o.delivery_time, o.status, o.final_amount,
             cl.client_name, cl.phone as client_phone, cl.address as client_address,
             COUNT(c.id) as total_cards,
             SUM(CASE WHEN c.status = 'PRINT_DONE' AND c.shipped_at IS NULL THEN 1 ELSE 0 END) as ready_cards,
             SUM(CASE WHEN c.shipped_at IS NOT NULL THEN 1 ELSE 0 END) as shipped_cards
      FROM orders o
      JOIN clients cl ON o.client_id = cl.id
      LEFT JOIN cards c ON c.order_id = o.id
      WHERE o.status IN ('PRINT_DONE', 'CONFIRMED', 'PRINTING')${efReady.clause}
      GROUP BY o.id
      HAVING ready_cards > 0
      ORDER BY o.delivery_date ASC NULLS LAST
    `).bind(...efReady.params).all()

    // 품목 상세 일괄 조회
    interface ReadyOrderRow { id: number; [key: string]: unknown }
    interface ReadyItemRow { order_id: number; item_name: string; category_name: string | null; width: number | null; height: number | null; quantity: number; unit: string | null; card_number: string | null; card_status: string | null; card_shipped_at: string | null }
    const orderIds = (results as ReadyOrderRow[]).map(r => r.id)
    const ordersWithItems = results as (ReadyOrderRow & { items?: ReadyItemRow[] })[]

    if (orderIds.length > 0) {
      const placeholders = orderIds.map(() => '?').join(',')
      const { results: itemRows } = await c.env.DB.prepare(`
        SELECT oi.order_id, oi.item_name, oi.category_name, oi.width, oi.height,
               oi.quantity, oi.unit, c.card_number, c.status as card_status, c.shipped_at as card_shipped_at
        FROM order_items oi
        LEFT JOIN cards c ON c.order_item_id = oi.id
        WHERE oi.order_id IN (${placeholders}) AND oi.parent_item_id IS NULL
        ORDER BY oi.order_id, oi.id
      `).bind(...orderIds).all<ReadyItemRow>()

      // order_id별로 그룹핑
      const itemsByOrder: Record<number, ReadyItemRow[]> = {}
      for (const item of itemRows) {
        if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = []
        itemsByOrder[item.order_id].push(item)
      }

      for (const order of ordersWithItems) {
        order.items = itemsByOrder[order.id] || []
      }
    }

    return c.json({ success: true, data: ordersWithItems })
  } catch (error) {
    console.error('src/routes/shipments.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// GET /dashboard/counts - 출고 카운트 (사이드바 뱃지용)
// ※ /:id 보다 먼저 등록해야 "dashboard"가 :id로 매칭되지 않음
// ============================================================================
shipmentsRouter.get('/dashboard/counts', async (c) => {
  try {
    const today = new Date().toISOString().split('T')[0]
    const ef = entityFilter(c, 'o')
    const { results } = await c.env.DB.prepare(`
      SELECT o.id,
        CASE WHEN MIN(oi.shipment_ready) = 1 THEN 1 ELSE 0 END as all_ready
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id AND oi.parent_item_id IS NULL
      WHERE o.status IN ('CONFIRMED', 'PRINTING', 'PRINT_DONE')
        AND DATE(o.delivery_date) = ?
        ${ef.clause}
      GROUP BY o.id
    `).bind(today, ...ef.params).all<{ id: number; all_ready: number }>()
    const typedResults = results
    const total = typedResults.length
    const ready = typedResults.filter(r => r.all_ready === 1).length
    return c.json({ success: true, data: { total, ready, pending: total - ready } })
  } catch (err) {
    return c.json({ success: false, error: 'Failed to load counts' }, 500)
  }
})

// ============================================================================
// GET /dashboard - 출고 대시보드 (거래처별 출고 현황)
// ============================================================================
shipmentsRouter.get('/dashboard', async (c) => {
  try {
    const { date, delivery_method, status = 'all' } = c.req.query()
    const targetDate = date || new Date().toISOString().split('T')[0]
    const ef = entityFilter(c, 'o')
    const { results } = await c.env.DB.prepare(`
      SELECT
        o.id as order_id, o.order_number, o.delivery_method, o.delivery_date, o.delivery_time,
        o.status as order_status,
        c.id as client_id, c.client_name,
        oi.id as order_item_id, oi.item_name, oi.quantity, oi.width, oi.height,
        oi.amount, oi.shipment_ready,
        ci.card_id,
        cd.card_number, cd.status as card_status, cd.category_name as card_category
      FROM orders o
      JOIN clients c ON o.client_id = c.id
      JOIN order_items oi ON oi.order_id = o.id AND oi.parent_item_id IS NULL
      LEFT JOIN card_items ci ON ci.order_item_id = oi.id
      LEFT JOIN cards cd ON cd.id = ci.card_id
      WHERE o.status IN ('CONFIRMED', 'PRINTING', 'PRINT_DONE')
        AND DATE(o.delivery_date) = ?
        ${ef.clause}
      ORDER BY c.client_name ASC, o.id ASC, oi.sort_order ASC
    `).bind(targetDate, ...ef.params).all<{
      order_id: number; order_number: string; delivery_method: string | null; delivery_date: string | null; delivery_time: string | null; order_status: string;
      client_id: number; client_name: string;
      order_item_id: number; item_name: string; quantity: number; width: number | null; height: number | null; amount: number | null; shipment_ready: number | null;
      card_id: number | null; card_number: string | null; card_status: string | null; card_category: string | null;
    }>()

    interface DashboardItem { order_item_id: number; item_name: string; quantity: number; width: number | null; height: number | null; amount: number | null; shipment_ready: number | null; card_id: number | null; card_number: string | null; card_status: string | null; card_category: string | null }
    interface DashboardOrder { order_id: number; order_number: string; delivery_method: string | null; delivery_date: string | null; delivery_time: string | null; order_status: string; items: DashboardItem[] }
    interface DashboardClient { client_id: number; client_name: string; orders: Map<number, DashboardOrder> }

    const clientMap = new Map<number, DashboardClient>()
    for (const row of results) {
      if (!clientMap.has(row.client_id)) {
        clientMap.set(row.client_id, { client_id: row.client_id, client_name: row.client_name, orders: new Map() })
      }
      const client = clientMap.get(row.client_id)!
      if (!client.orders.has(row.order_id)) {
        client.orders.set(row.order_id, {
          order_id: row.order_id, order_number: row.order_number, delivery_method: row.delivery_method,
          delivery_date: row.delivery_date, delivery_time: row.delivery_time, order_status: row.order_status, items: []
        })
      }
      client.orders.get(row.order_id)!.items.push({
        order_item_id: row.order_item_id, item_name: row.item_name, quantity: row.quantity,
        width: row.width, height: row.height, amount: row.amount, shipment_ready: row.shipment_ready,
        card_id: row.card_id, card_number: row.card_number, card_status: row.card_status, card_category: row.card_category
      })
    }

    const data = Array.from(clientMap.values()).map(client => {
      const orders = Array.from(client.orders.values()).map((order) => {
        const allReady = order.items.every((i) => i.shipment_ready === 1)
        const readyCount = order.items.filter((i) => i.shipment_ready === 1).length
        return { ...order, all_ready: allReady, ready_count: readyCount, total_count: order.items.length }
      })
      return { client_id: client.client_id, client_name: client.client_name, orders }
    })

    let filtered = data
    if (delivery_method) {
      filtered = data.map(cl => ({ ...cl, orders: cl.orders.filter(o => o.delivery_method === delivery_method) })).filter(cl => cl.orders.length > 0)
    }
    if (status === 'ready') {
      filtered = filtered.map(cl => ({ ...cl, orders: cl.orders.filter(o => o.all_ready) })).filter(cl => cl.orders.length > 0)
    } else if (status === 'pending') {
      filtered = filtered.map(cl => ({ ...cl, orders: cl.orders.filter(o => !o.all_ready) })).filter(cl => cl.orders.length > 0)
    }

    return c.json({ success: true, data: filtered })
  } catch (err) {
    return c.json({ success: false, error: 'Failed to load dashboard' }, 500)
  }
})

// ============================================================================
// GET /:id - 출고 상세
// ============================================================================
shipmentsRouter.get('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const ef = entityFilter(c, 'o')
    const shipment = await c.env.DB.prepare(`
      SELECT s.*, o.order_number, o.delivery_date, o.delivery_method,
             cl.client_name, cl.phone as client_phone, cl.address as client_address,
             u.name as created_by_name
      FROM shipments s
      JOIN orders o ON s.order_id = o.id
      LEFT JOIN clients cl ON o.client_id = cl.id
      LEFT JOIN users u ON s.created_by = u.id
      WHERE s.id = ?${ef.clause}
    `).bind(id, ...ef.params).first()

    if (!shipment) return c.json({ success: false, error: '출고 정보를 찾을 수 없습니다.' }, 404)

    const { results: items } = await c.env.DB.prepare(`
      SELECT si.*, c.card_number, c.category,
             oi.item_name, oi.quantity as order_qty, oi.width, oi.height
      FROM shipment_items si
      LEFT JOIN cards c ON si.card_id = c.id
      LEFT JOIN order_items oi ON si.order_item_id = oi.id
      WHERE si.shipment_id = ?
    `).bind(id).all()

    return c.json({ success: true, data: { ...shipment, items } })
  } catch (error) {
    console.error('src/routes/shipments.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// POST / - 출고 등록
// ============================================================================
shipmentsRouter.post('/', requireRole('ADMIN', 'MANAGER', 'DESIGNER'), async (c) => {
  try {
    const user = c.get('user')
    const body = await c.req.json() as {
      order_id: number
      delivery_type?: string
      courier_name?: string
      tracking_number?: string
      receiver_name?: string
      receiver_phone?: string
      receiver_address?: string
      notes?: string
      card_ids?: number[]
    }

    if (!body.order_id) return c.json({ success: false, error: '주문을 선택하세요.' }, 400)

    // 주문 확인
    const order = await c.env.DB.prepare('SELECT id, order_number, status FROM orders WHERE id = ?').bind(body.order_id).first<{ id: number; order_number: string; status: string }>()
    if (!order) return c.json({ success: false, error: '주문을 찾을 수 없습니다.' }, 404)

    // 출고번호 생성
    const today = new Date()
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '')
    const seqRow = await c.env.DB.prepare(`
      SELECT COALESCE(MAX(CAST(SUBSTR(shipment_number, 13) AS INTEGER)), 0) as max_seq
      FROM shipments WHERE shipment_number LIKE ?
    `).bind(`SHP-${dateStr}-%`).first<{ max_seq: number | null }>()
    const shipmentNumber = `SHP-${dateStr}-${String((seqRow?.max_seq || 0) + 1).padStart(3, '0')}`

    // 출고 등록
    const result = await c.env.DB.prepare(`
      INSERT INTO shipments (
        shipment_number, order_id, status, delivery_type,
        courier_name, tracking_number, shipped_at,
        receiver_name, receiver_phone, receiver_address,
        notes, created_by, created_at, updated_at, entity_id
      ) VALUES (?, ?, 'SHIPPED', ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)
    `).bind(
      shipmentNumber, body.order_id,
      body.delivery_type || 'DELIVERY',
      body.courier_name || null, body.tracking_number || null,
      body.receiver_name || null, body.receiver_phone || null, body.receiver_address || null,
      body.notes || null, user?.id || 1, getEntityId(c) || 1
    ).run()

    const shipmentId = result.meta.last_row_id

    // 카드별 출고 처리
    if (body.card_ids && body.card_ids.length > 0) {
      const stmts = body.card_ids.flatMap((cardId: number) => [
        c.env.DB.prepare('UPDATE cards SET shipped_at = CURRENT_TIMESTAMP WHERE id = ? AND shipped_at IS NULL').bind(cardId),
        c.env.DB.prepare('INSERT OR IGNORE INTO shipment_items (shipment_id, card_id) VALUES (?, ?)').bind(shipmentId, cardId)
      ])
      await c.env.DB.batch(stmts)
    } else {
      // 카드 지정 없으면 주문의 모든 출고 가능 카드 처리
      const updateResult = await c.env.DB.prepare(`
        UPDATE cards SET shipped_at = CURRENT_TIMESTAMP
        WHERE order_id = ? AND status = 'PRINT_DONE' AND shipped_at IS NULL
      `).bind(body.order_id).run()

      // 출고된 카드들 shipment_items에 등록
      const { results: shippedCards } = await c.env.DB.prepare(`
        SELECT id FROM cards WHERE order_id = ? AND shipped_at IS NOT NULL
      `).bind(body.order_id).all()
      if (shippedCards && shippedCards.length > 0) {
        await c.env.DB.batch(
          (shippedCards as { id: number }[]).map(card =>
            c.env.DB.prepare('INSERT OR IGNORE INTO shipment_items (shipment_id, card_id) VALUES (?, ?)').bind(shipmentId, card.id)
          )
        )
      }
    }

    // 주문의 모든 카드가 출고되었는지 확인 → auto_complete_date 설정 (동기화 시 SHIPPED 전이)
    const cardCheck = await c.env.DB.prepare(`
      SELECT COUNT(*) as total,
             SUM(CASE WHEN shipped_at IS NOT NULL THEN 1 ELSE 0 END) as shipped
      FROM cards WHERE order_id = ?
    `).bind(body.order_id).first<{ total: number; shipped: number }>()

    if (cardCheck && cardCheck.total > 0 && cardCheck.total === cardCheck.shipped) {
      const orderInfo = await c.env.DB.prepare('SELECT delivery_method FROM orders WHERE id = ?').bind(body.order_id).first<{ delivery_method: string | null }>()
      const method = (orderInfo?.delivery_method || '').trim()
      const isQuick = method === '방문수령' || method === '직접수령' || method === '직접배송' || method === '퀵'
      const delayDays = isQuick ? 1 : 2
      await c.env.DB.prepare(
        `UPDATE orders SET auto_complete_date = date('now', '+' || ? || ' days'), updated_at = CURRENT_TIMESTAMP WHERE id = ? AND auto_complete_date IS NULL`
      ).bind(delayDays, body.order_id).run()
    }

    // 이메일 자동 발송 (fire-and-forget — 실패해도 출고는 성공)
    try {
      const client = await c.env.DB.prepare(
        'SELECT cl.email, cl.client_name FROM clients cl JOIN orders o ON o.client_id = cl.id WHERE o.id = ?'
      ).bind(body.order_id).first<{ email: string | null; client_name: string }>()

      if (client?.email) {
        const { results: shipItems } = await c.env.DB.prepare(`
          SELECT oi.item_name, oi.quantity, oi.width, oi.height
          FROM shipment_items si
          LEFT JOIN cards cd ON si.card_id = cd.id
          LEFT JOIN order_items oi ON cd.order_item_id = oi.id
          WHERE si.shipment_id = ?
        `).bind(shipmentId).all()

        const { subject, html } = renderTemplate('SHIPMENT_NOTICE', {
          clientName: client.client_name,
          orderNumber: order.order_number,
          shipmentNumber,
          shippedAt: new Date().toLocaleDateString('ko-KR'),
          deliveryType: body.delivery_type || 'DELIVERY',
          courierName: body.courier_name,
          trackingNumber: body.tracking_number,
          items: (shipItems as { item_name: string | null; quantity: number | null; width: number | null; height: number | null }[]).map(i => ({
            itemName: i.item_name || '품목',
            quantity: i.quantity || 1,
            width: i.width,
            height: i.height,
          })),
          notes: body.notes,
        })

        await sendEmail(c.env, c.env.DB, { to: client.email, subject, html }, {
          template: 'SHIPMENT_NOTICE',
          relatedType: 'shipment',
          relatedId: shipmentId as number,
          sentBy: user?.id,
        })
      }
    } catch (_emailErr) {
      // 이메일 실패해도 출고 등록은 성공 처리
    }

    // 알림톡 자동 발송 (fire-and-forget)
    try {
      const kakaoEnabled = await c.env.DB.prepare(
        `SELECT setting_value FROM settings WHERE setting_key = 'kakao_enabled'`
      ).first<{ setting_value: string | null }>()
      if (kakaoEnabled?.setting_value === '1') {
        // 내부 API 호출로 알림톡 발송 위임
        const internalRes = await fetch(new URL('/api/kakao/send-shipment', c.req.url).href, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': c.req.header('Authorization') || '',
          },
          body: JSON.stringify({ shipment_id: shipmentId }),
        })
        if (!internalRes.ok) {
          console.warn('알림톡 발송 실패 (출고):', await internalRes.text())
        }
      }
    } catch (_kakaoErr) {
      // 알림톡 실패해도 출고 등록은 성공 처리
      console.warn('알림톡 발송 오류 (출고):', _kakaoErr)
    }

    return c.json({
      success: true,
      data: { id: shipmentId, shipment_number: shipmentNumber },
      message: `출고 ${shipmentNumber} 등록 완료`
    }, 201)
  } catch (error) {
    console.error('src/routes/shipments.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// PATCH /:id - 라벨 수량 / 송장번호 업데이트
// ============================================================================
shipmentsRouter.patch('/:id', requireRole('ADMIN', 'MANAGER', 'OPERATOR'), async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json<{ label_count?: number; box_count?: number; tracking_number?: string }>()

    // 1차: shipment ID로 조회
    let shipment = await c.env.DB.prepare('SELECT id FROM shipments WHERE id = ?').bind(id).first()

    // 2차: 없으면 order_id로 조회 (프론트엔드가 주문 ID를 보내는 경우)
    if (!shipment) {
      shipment = await c.env.DB.prepare('SELECT id FROM shipments WHERE order_id = ?').bind(id).first()
    }

    // 3차: 그래도 없으면 해당 주문에 대한 shipment 자동 생성
    if (!shipment) {
      const order = await c.env.DB.prepare('SELECT id, order_number, delivery_method FROM orders WHERE id = ?').bind(id).first<{ id: number; order_number: string; delivery_method: string | null }>()
      if (!order) {
        return c.json({ success: false, error: '주문 또는 출고 정보를 찾을 수 없습니다.' }, 404)
      }

      const shipmentNumber = `SHP-${new Date().toISOString().substring(0, 10).replace(/-/g, '')}-${String(order.id).padStart(3, '0')}`
      const deliveryType = order.delivery_method === '대신화물' ? 'FREIGHT'
        : order.delivery_method === '대신택배' ? 'DELIVERY'
        : order.delivery_method === '한진택배' ? 'DELIVERY'
        : order.delivery_method === '퀵' ? 'QUICK'
        : 'DELIVERY'

      await c.env.DB.prepare(
        `INSERT INTO shipments (shipment_number, order_id, delivery_type, entity_id) VALUES (?, ?, ?, ?)`
      ).bind(shipmentNumber, order.id, deliveryType, getEntityId(c) || 1).run()

      shipment = await c.env.DB.prepare('SELECT id FROM shipments WHERE order_id = ?').bind(id).first()
    }

    if (!shipment) {
      return c.json({ success: false, error: '출고 정보를 생성할 수 없습니다.' }, 500)
    }

    const updates: string[] = []
    const params: any[] = []

    if (body.label_count !== undefined) {
      updates.push('label_count = ?')
      params.push(body.label_count)
    }
    if (body.box_count !== undefined) {
      updates.push('box_count = ?')
      params.push(body.box_count)
    }
    if (body.tracking_number !== undefined) {
      updates.push('tracking_number = ?')
      params.push(body.tracking_number)
    }

    if (updates.length === 0) {
      return c.json({ success: false, error: '수정할 항목이 없습니다.' }, 400)
    }

    updates.push('updated_at = CURRENT_TIMESTAMP')
    params.push((shipment as { id: number }).id)

    await c.env.DB.prepare(
      `UPDATE shipments SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...params).run()

    return c.json({ success: true })
  } catch (error) {
    console.error('src/routes/shipments.ts PATCH /:id error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// PATCH /:id/status - 출고 상태 변경
// ============================================================================
shipmentsRouter.patch('/:id/status', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')
    const { status } = await c.req.json<{ status: string }>()

    if (!status) {
      return c.json({ success: false, error: '상태를 입력해주세요.' }, 400)
    }

    const validStatuses = ['PENDING', 'SHIPPED', 'DELIVERED', 'CANCELLED']
    if (!validStatuses.includes(status)) {
      return c.json({ success: false, error: '유효하지 않은 상태입니다.' }, 400)
    }

    const shipment = await c.env.DB.prepare('SELECT id, status FROM shipments WHERE id = ?').bind(id).first<{ id: number; status: string }>()
    if (!shipment) {
      return c.json({ success: false, error: '출고 정보를 찾을 수 없습니다.' }, 404)
    }

    await c.env.DB.prepare(
      'UPDATE shipments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(status, id).run()

    // #51: 출고 취소 시 카드 shipped_at 롤백 + 주문 상태 복원 + auto_complete_date 리셋
    if (status === 'CANCELLED') {
      // 이 출고건의 카드 shipped_at 리셋 (HOLD 카드는 건드리지 않음)
      await c.env.DB.prepare(`
        UPDATE cards SET shipped_at = NULL
        WHERE id IN (SELECT card_id FROM shipment_items WHERE shipment_id = ?)
          AND status != 'HOLD'
      `).bind(id).run()

      // 주문 상태 복원: SHIPPED → PRINT_DONE (출고 취소로 미출고 카드 발생)
      const orderRow = await c.env.DB.prepare(
        'SELECT order_id FROM shipments WHERE id = ?'
      ).bind(id).first<{ order_id: number }>()
      if (orderRow?.order_id) {
        const orderInfo = await c.env.DB.prepare(
          'SELECT status FROM orders WHERE id = ?'
        ).bind(orderRow.order_id).first<{ status: string }>()

        if (orderInfo?.status === 'SHIPPED') {
          const user = c.get('user')
          await c.env.DB.prepare(
            `UPDATE orders SET status = 'PRINT_DONE', auto_complete_date = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
          ).bind(orderRow.order_id).run()

          await c.env.DB.prepare(`
            INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, change_reason)
            VALUES (?, 'SHIPPED', 'PRINT_DONE', ?, '출고 취소로 주문 상태 복원')
          `).bind(orderRow.order_id, user?.id || 1).run()
        } else {
          // SHIPPED가 아닌 경우에도 auto_complete_date는 리셋
          await c.env.DB.prepare(
            'UPDATE orders SET auto_complete_date = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
          ).bind(orderRow.order_id).run()
        }
      }
    }

    return c.json({ success: true, message: '출고 상태가 변경되었습니다.' })
  } catch (error) {
    console.error('src/routes/shipments.ts status error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// (dashboard/counts + dashboard 라우트는 /:id 위로 이동 완료 — 라인 240~)
// 아래는 PATCH /:orderId/ship만 유지

// ============================================================================
// PATCH /:orderId/ship - 출고 대시보드에서 출고 처리

// ============================================================================
// PATCH /:orderId/ship - 출고 대시보드에서 출고 처리
// ============================================================================
shipmentsRouter.patch('/:orderId/ship', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const orderId = c.req.param('orderId')
    const user = c.get('user')

    // 주문 확인
    const order = await c.env.DB.prepare(
      'SELECT id, order_number, status, client_id, delivery_method FROM orders WHERE id = ?'
    ).bind(orderId).first<{ id: number; order_number: string; status: string; client_id: number; delivery_method: string | null }>()
    if (!order) return c.json({ success: false, error: '주문을 찾을 수 없습니다.' }, 404)

    // 모든 order_items.shipment_ready 확인
    const { results: items } = await c.env.DB.prepare(
      'SELECT id, shipment_ready FROM order_items WHERE order_id = ? AND parent_item_id IS NULL'
    ).bind(orderId).all<{ id: number; shipment_ready: number | null }>()
    const notReady = items.filter(i => !i.shipment_ready)
    if (notReady.length > 0) {
      return c.json({ success: false, error: `미완료 품목이 ${notReady.length}건 있습니다.` }, 400)
    }

    // 관련 카드 출고 처리
    await c.env.DB.prepare(
      `UPDATE cards SET shipped_at = CURRENT_TIMESTAMP, shipped_by = ?
       WHERE order_id = ? AND status = 'PRINT_DONE' AND shipped_at IS NULL`
    ).bind(user?.id || null, orderId).run()

    // auto_complete_date 설정 (동기화 시 SHIPPED 전이)
    const method = (order.delivery_method || '').trim()
    const isQuick = method === '방문수령' || method === '직접수령' || method === '직접배송' || method === '퀵'
    const delayDays = isQuick ? 1 : 2
    await c.env.DB.prepare(
      `UPDATE orders SET auto_complete_date = date('now', '+' || ? || ' days'), updated_at = CURRENT_TIMESTAMP WHERE id = ? AND auto_complete_date IS NULL`
    ).bind(delayDays, orderId).run()

    return c.json({ success: true, message: '출고 처리되었습니다. 동기화 후 출고완료 상태로 전이됩니다.' })
  } catch (err) {
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

export default shipmentsRouter