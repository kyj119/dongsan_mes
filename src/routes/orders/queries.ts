import { Hono } from 'hono'
import type { HonoEnv } from '../../types/env'
import type { Order, OrderItem, ApiResponse, PaginatedResponse } from '../../types/models'
import { authMiddleware, requireRole } from '../../middleware/auth'
import { requireAnyPagePermission } from '../../middleware/permissions'
import { logActivity } from '../../utils/activityLog'
import { notifyRoles } from '../../utils/notify'
import { recalculateOrderCosts } from '../../utils/costCalculator'
import { sendEmail } from '../../services/emailProvider'
import { getEntityId, entityFilter } from '../../utils/entityFilter'

const ordersQueriesRouter = new Hono<HonoEnv>()
ordersQueriesRouter.use('/*', authMiddleware, requireAnyPagePermission('/orders', '/cards'))

ordersQueriesRouter.get('/quotations/expired', async (c) => {
  try {
    const today = new Date().toISOString().split('T')[0]
    const { results } = await c.env.DB.prepare(`
      SELECT
        o.*,
        c.client_name,
        u.name as created_by_name,
        1 as is_expired
      FROM orders o
      LEFT JOIN clients c ON o.client_id = c.id
      LEFT JOIN users u ON o.created_by = u.id
      WHERE o.status = 'QUOTATION'
        AND o.valid_until IS NOT NULL
        AND o.valid_until < ?${entityFilter(c, 'o').clause}
      ORDER BY o.valid_until ASC
    `).bind(today, ...entityFilter(c, 'o').params).all()

    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('src/routes/orders.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// Get order statistics (must be before /:id to avoid route conflict)
ordersQueriesRouter.get('/stats', async (c) => {
  try {
    const ef = entityFilter(c)
    const statsQuery = ef.params.length > 0
      ? `SELECT status, COUNT(*) as count FROM orders WHERE entity_id = ? GROUP BY status`
      : `SELECT status, COUNT(*) as count FROM orders GROUP BY status`
    const { results } = ef.params.length > 0
      ? await c.env.DB.prepare(statsQuery).bind(...ef.params).all()
      : await c.env.DB.prepare(statsQuery).all()

    const stats: Record<string, number> = { total: 0 }
    for (const row of results as any[]) {
      stats[(row as any).status] = (row as any).count
      stats.total += (row as any).count
    }

    return c.json({ success: true, data: stats })
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// Get post-processing options (must be before /:id to avoid route conflict)
ordersQueriesRouter.get('/options/post-processing', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT * FROM post_processing_options WHERE is_active = 1 ORDER BY option_name ASC
    `).all()

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

// GET /api/orders/ready-to-ship - 출고 대기 주문 목록
ordersQueriesRouter.get('/ready-to-ship', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT o.id, o.order_number, o.delivery_date, o.delivery_method, o.notes, o.status,
             c.id as client_id, c.client_name,
             COUNT(cards.id) as card_count,
             GROUP_CONCAT(DISTINCT oi.item_name) as item_names,
             CAST(SUM(oi.quantity) AS INTEGER) as total_quantity
      FROM orders o
      JOIN clients c ON o.client_id = c.id
      LEFT JOIN order_items oi ON oi.order_id = o.id AND oi.parent_item_id IS NULL
      JOIN cards ON cards.order_id = o.id
      WHERE o.status NOT IN ('SHIPPED', 'CANCELLED')${entityFilter(c, 'o').clause}
      GROUP BY o.id
      HAVING COUNT(cards.id) > 0
         AND COUNT(cards.id) = SUM(CASE WHEN cards.status = 'PRINT_DONE' THEN 1 ELSE 0 END)
      ORDER BY o.delivery_date ASC
    `).bind(...entityFilter(c, 'o').params).all()

    return c.json({ success: true, data: results })
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// PATCH /api/orders/bulk-bill - 일괄 경리 확인 (MANAGER+)
// Phase 1.1: receipt_type 추가 (TAX_INVOICE | CASH_RECEIPT | CARD | SIMPLE)
ordersQueriesRouter.patch('/bulk-bill', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const user = c.get('user')
    // 클라가 카멜케이스(orderIds/receiptType) 또는 스네이크(order_ids/receipt_type) 둘 다 보낼 수 있음
    const body = await c.req.json<any>()
    const order_ids: number[] = body.order_ids || body.orderIds || []
    const receipt_type: string | undefined = body.receipt_type || body.receiptType

    if (!order_ids || order_ids.length === 0) {
      return c.json({ success: false, error: 'order_ids is required' }, 400)
    }

    // 증빙 유형 검증 (선택 입력이지만 들어오면 화이트리스트만 허용)
    const validReceiptTypes = ['TAX_INVOICE', 'CASH_RECEIPT', 'CARD', 'SIMPLE']
    if (receipt_type && !validReceiptTypes.includes(receipt_type)) {
      return c.json({ success: false, error: '잘못된 증빙 유형입니다.' }, 400)
    }
    const normalizedReceiptType = receipt_type || null

    let billedCount = 0

    for (const orderId of order_ids) {
      const order = await c.env.DB.prepare(
        'SELECT id, status, client_id, final_amount, billing_status FROM orders WHERE id = ?'
      ).bind(orderId).first() as any

      if (!order || order.status !== 'SHIPPED') continue
      if (order.billing_status === 'BILLED') continue

      const billedAmount = parseFloat(order.final_amount) || 0

      // D1 batch: 주문 BILLED + 거래처 balance 원자적 업데이트
      // 하나라도 실패하면 둘 다 롤백됨
      await c.env.DB.batch([
        c.env.DB.prepare(`
          UPDATE orders
          SET billing_status = 'BILLED',
              billed_at = CURRENT_TIMESTAMP,
              billed_by = ?,
              billed_amount = ?,
              receipt_type = COALESCE(?, receipt_type),
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND billing_status != 'BILLED'
        `).bind(user?.id || null, billedAmount, normalizedReceiptType, orderId),
        c.env.DB.prepare(
          'UPDATE clients SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        ).bind(billedAmount, order.client_id)
      ])

      billedCount++
    }

    return c.json({ success: true, data: { billed: billedCount } })
  } catch (error) {
    console.error('Bulk bill error:', error)
    console.error('src/routes/orders.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// PATCH /api/orders/bulk-ship - 일괄 출고완료 처리
ordersQueriesRouter.patch('/bulk-ship', async (c) => {
  try {
    const { order_ids } = await c.req.json<{ order_ids: number[] }>()
    if (!order_ids || order_ids.length === 0) {
      return c.json({ success: false, error: 'order_ids is required' }, 400)
    }

    const results: { id: number; success: boolean; error?: string; shipped_cards?: number; order_shipped?: boolean; remaining?: number }[] = []

    for (const orderId of order_ids) {
      // 해당 주문의 카드 현황 조회
      const check = await c.env.DB.prepare(`
        SELECT COUNT(*) as total,
               SUM(CASE WHEN status = 'PRINT_DONE' THEN 1 ELSE 0 END) as done,
               SUM(CASE WHEN shipped_at IS NOT NULL THEN 1 ELSE 0 END) as shipped
        FROM cards WHERE order_id = ?
      `).bind(orderId).first<{ total: number; done: number; shipped: number }>()

      if (!check || check.total === 0) {
        results.push({ id: orderId, success: false, error: '카드가 없습니다' })
        continue
      }

      // 카드 출고 + 주문 상태 전환을 batch로 원자적 처리
      // Step 1: 카드 출고 처리
      const updateResult = await c.env.DB.prepare(`
        UPDATE cards SET shipped_at = CURRENT_TIMESTAMP
        WHERE order_id = ? AND status = 'PRINT_DONE' AND shipped_at IS NULL
      `).bind(orderId).run()
      const shippedCards = updateResult.meta.changes ?? 0

      // Step 2: 출고 후 전체 카드 확인 → 모두 출고면 auto_complete_date 설정 (동기화 시 SHIPPED 전이)
      const orderInfo = await c.env.DB.prepare(
        `SELECT delivery_method, order_type FROM orders WHERE id = ?`
      ).bind(orderId).first() as any
      const method = (orderInfo?.delivery_method || '').trim()

      // 모든 카드 출고 완료 확인
      const afterCheck = await c.env.DB.prepare(`
        SELECT COUNT(*) as remaining FROM cards WHERE order_id = ? AND shipped_at IS NULL
      `).bind(orderId).first<{ remaining: number }>()
      const allShipped = (afterCheck?.remaining || 0) === 0

      if (allShipped) {
        // 유통 주문 출고 시 재고 차감
        if (orderInfo?.order_type === 'DISTRIBUTION') {
          const { results: orderItems } = await c.env.DB.prepare(
            `SELECT item_id, quantity FROM order_items WHERE order_id = ? AND item_id IS NOT NULL`
          ).bind(orderId).all() as any
          for (const oi of (orderItems || [])) {
            if (!oi.item_id || !oi.quantity) continue
            await c.env.DB.prepare(
              `UPDATE inventory SET quantity = MAX(0, quantity - ?), last_updated = CURRENT_TIMESTAMP WHERE item_id = ?`
            ).bind(oi.quantity, oi.item_id).run()
            await c.env.DB.prepare(
              `INSERT INTO inventory_transactions (item_id, transaction_type, quantity, reference_type, reference_id, notes, transaction_date, entity_id)
               VALUES (?, 'OUT', ?, 'ORDER', ?, '유통 출고 차감', date('now'), ?)`
            ).bind(oi.item_id, oi.quantity, orderId, getEntityId(c) || 1).run()
          }
        }
        // auto_complete_date 설정: 직접수령/방문수령/퀵은 +1일, 배송은 +2일
        const isQuick = method === '방문수령' || method === '직접수령' || method === '직접배송' || method === '퀵' || method.toUpperCase() === 'PICKUP'
        const delayDays = isQuick ? 1 : 2
        await c.env.DB.prepare(
          `UPDATE orders SET auto_complete_date = date('now', '+' || ? || ' days'), updated_at = datetime('now') WHERE id = ? AND auto_complete_date IS NULL`
        ).bind(delayDays, orderId).run()
        results.push({ id: orderId, success: true, shipped_cards: shippedCards, order_shipped: true })
      } else {
        results.push({ id: orderId, success: true, shipped_cards: shippedCards, order_shipped: false,
          remaining: afterCheck?.remaining || 0 })
      }
    }

    return c.json({ success: true, data: results })
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// GET /api/orders/export/csv - CSV 다운로드
ordersQueriesRouter.get('/export/csv', async (c) => {
  try {
    const { status = '', search = '', sort = 'created_at_desc', date_from = '', date_to = '', exclude_status = '', priority = '' } = c.req.query()

    let query = `
      SELECT o.order_number, c.client_name, o.order_date, o.delivery_date,
        o.delivery_method, o.delivery_time, o.final_amount, o.status,
        o.billing_status, o.priority, o.contact_phone, o.notes,
        u.name as created_by_name, o.created_at
      FROM orders o
      LEFT JOIN clients c ON o.client_id = c.id
      LEFT JOIN users u ON o.created_by = u.id
    `
    const params: any[] = []
    const whereClauses: string[] = []

    if (status) { whereClauses.push('o.status = ?'); params.push(status) }
    if (search) {
      whereClauses.push('(o.order_number LIKE ? OR c.client_name LIKE ?)')
      params.push(`%${search}%`, `%${search}%`)
    }
    if (date_from) { whereClauses.push('o.order_date >= ?'); params.push(date_from) }
    if (date_to) { whereClauses.push('o.order_date <= ?'); params.push(date_to) }
    if (exclude_status) {
      const excludes = exclude_status.split(',').map(s => s.trim()).filter(Boolean)
      if (excludes.length === 1) { whereClauses.push('o.status != ?'); params.push(excludes[0]) }
      else if (excludes.length > 1) { whereClauses.push(`o.status NOT IN (${excludes.map(() => '?').join(',')})`); params.push(...excludes) }
    }
    if (priority) { whereClauses.push('o.priority = ?'); params.push(priority) }

    if (whereClauses.length > 0) query += ' WHERE ' + whereClauses.join(' AND ')

    const sortOptions: Record<string, string> = {
      'created_at_desc': 'o.created_at DESC',
      'created_at_asc': 'o.created_at ASC',
      'delivery_date_asc': 'o.delivery_date ASC NULLS LAST',
      'final_amount_desc': 'o.final_amount DESC',
    }
    // LIMIT: 최대 5000, 기본 3000 — 메모리/타임아웃 방지
    const maxRows = Math.min(parseInt(c.req.query('limit') || '3000') || 3000, 5000)
    const orderBy = sortOptions[sort] || 'o.created_at DESC'
    query += ` ORDER BY ${orderBy} LIMIT ?`
    params.push(maxRows)

    const { results } = await c.env.DB.prepare(query).bind(...params).all() as any

    const statusLabels: Record<string, string> = { CONFIRMED: '확정', PRINTING: '출력중', PRINT_DONE: '출력완료', SHIPPED: '출고완료', HOLD: '보류', CANCELLED: '취소' }
    const billingLabels: Record<string, string> = { BILLED: '회계반영', PAID: '수금완료' }

    const headers = ['주문번호', '거래처', '주문일', '납기일', '배송', '금액', '상태', '회계반영', '우선순위', '연락처', '비고', '작성자', '등록일']
    const rows = (results || []).map((o: any) => [
      o.order_number, o.client_name, o.order_date, o.delivery_date,
      (o.delivery_method || '') + (o.delivery_time ? ' ' + o.delivery_time : ''),
      o.final_amount, statusLabels[o.status] || o.status,
      billingLabels[o.billing_status] || '', o.priority === 'URGENT' ? '긴급' : '일반',
      o.contact_phone, o.notes, o.created_by_name,
      o.created_at ? new Date(o.created_at).toLocaleDateString('ko-KR') : ''
    ])

    // 스트리밍 CSV 응답 — 대량 데이터 시 메모리 2배 사용 방지
    const { csvStreamResponse } = await import('../../utils/csv')
    const today = new Date().toISOString().slice(0, 10)
    return csvStreamResponse(`주문목록_${today}.csv`, headers, rows)
  } catch (error) {
    console.error('src/routes/orders.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// PATCH /api/orders/:id/bill - 경리 확인 (MANAGER+)

export default ordersQueriesRouter
