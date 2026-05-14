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
import { getEntityCompanyInfo } from '../../utils/entitySettings'

// card_group 결정 함수: 품목의 카드 그룹(생산 라인)을 결정
function getCardGroup(item: any): string | null {
  // 1. print_method_id가 있으면 → print_methods.card_group 사용
  if (item.print_method_card_group) return item.print_method_card_group
  // 2. category 기반 판단 (기존 품목 호환)
  const cat = (item.category_name || item.category || '').toLowerCase()
  if (['전사', '깃발', '윈드배너', '가로등배너', '민방위기', '태극기', '새마을기'].some(k => cat.includes(k))) return 'TRANSFER_FLAG'
  if (cat.includes('간판')) return 'SIGN'
  // 3. 출력 관련 카테고리 (기존 데이터 호환)
  if (['현수막', '배너', '스티커', '현판', 'uv', '솔벤', '수성', '평판'].some(k => cat.includes(k))) return 'OUTPUT'
  // 4. 상품/부자재 등 → 카드 미생성
  const itemType = (item.item_type || '').toUpperCase()
  if (['GOODS', 'MATERIAL'].includes(itemType)) return null
  // 5. 기본값: OUTPUT (기존 호환)
  return 'OUTPUT'
}

// ── 카드 생성 공통 함수 (POST/PUT 중복 제거) ──
interface GenerateCardsParams {
  db: D1Database
  orderId: number
  orderNumber: string
  clientId: number
  deliveryDate: string | null
  priority: string
  notes?: string | null
  entityId?: number | null
}

async function generateCardsForOrder(params: GenerateCardsParams): Promise<number> {
  const { db, orderId, orderNumber, clientId, deliveryDate, priority, notes, entityId } = params
  const cardPriority = priority === 'URGENT' ? 1 : 0

  const client = await db.prepare(`
    SELECT client_name FROM clients WHERE id = ?
  `).bind(clientId).first<{ client_name: string }>()

  const { results: orderItems } = await db.prepare(`
    SELECT oi.*, i.category, i.sub_category, i.print_method_id, i.print_media_id,
           i.item_type, pm.card_group as print_method_card_group
    FROM order_items oi
    LEFT JOIN items i ON oi.item_id = i.id
    LEFT JOIN print_methods pm ON i.print_method_id = pm.id
    WHERE oi.order_id = ?
    ORDER BY oi.sort_order ASC
  `).bind(orderId).all()

  const { results: finMethods } = await db.prepare(
    `SELECT name, margin_cm FROM finishing_methods WHERE is_active = 1`
  ).all()
  const finMarginMap = new Map<string, number>(
    (finMethods || []).map((m): [string, number] => [m.name as string, (m.margin_cm as number) || 0])
  )

  const orderNumberParts = orderNumber.split('-')
  const orderSeq = orderNumberParts[1]
  const orderDate = orderNumberParts[0]

  // orderItems rows from JOIN query — typed as Record<string, unknown>
  type OIRow = Record<string, unknown>

  const parentIds = new Set<number>(
    (orderItems as OIRow[])
      .filter((i) => i.parent_item_id !== null && i.parent_item_id !== undefined)
      .map((i) => i.parent_item_id as number)
  )
  const parentMap = new Map<number, OIRow>(
    (orderItems as OIRow[]).map((i) => [i.id as number, i])
  )

  const regularItems = (orderItems as OIRow[]).filter(
    (i) => !i.parent_item_id && !parentIds.has(i.id as number)
  )
  const childItems = (orderItems as OIRow[]).filter(
    (i) => i.parent_item_id !== null && i.parent_item_id !== undefined
  )

  const itemsByCardGroup = new Map<string, Array<{ item: OIRow; ppJson: string | null; qty: number }>>()

  for (const item of regularItems) {
    const cg = getCardGroup(item)
    if (!cg) continue
    if (!itemsByCardGroup.has(cg)) itemsByCardGroup.set(cg, [])
    itemsByCardGroup.get(cg)!.push({ item, ppJson: (item.post_processing as string) || null, qty: (item.quantity as number) || 0 })
  }

  for (const child of childItems) {
    const parent = parentMap.get(child.parent_item_id as number)
    if (!parent) continue
    const cg = getCardGroup(parent)
    if (!cg) continue
    if (!itemsByCardGroup.has(cg)) itemsByCardGroup.set(cg, [])
    itemsByCardGroup.get(cg)!.push({ item: child, ppJson: (parent.post_processing as string) || null, qty: 1 })
  }

  // shipment_ready: 카드 미생성 품목은 바로 출고 준비 완료
  const cardGroupItems = new Set<number>()
  for (const entries of itemsByCardGroup.values()) {
    for (const entry of entries) cardGroupItems.add(entry.item.id as number)
  }
  const noCardItems = (orderItems as OIRow[]).filter((i) => !cardGroupItems.has(i.id as number))
  if (noCardItems.length > 0) {
    const ids = noCardItems.map((i) => i.id as number)
    await db.prepare(
      `UPDATE order_items SET shipment_ready = 1 WHERE id IN (${ids.map(() => '?').join(',')})`
    ).bind(...ids).run()
  }

  // D1 batch로 원자적 카드 생성
  const cardStatements: D1PreparedStatement[] = []
  const cardGroupEntries: Array<{ cardNumber: string; entries: Array<{ item: OIRow; ppJson: string | null; qty: number }> }> = []

  let cardIndex = 0
  for (const [cardGroup, entries] of itemsByCardGroup) {
    const category = cardGroup === 'OUTPUT' ? '출력'
      : cardGroup === 'TRANSFER_FLAG' ? '전사/태극기'
      : cardGroup === 'SIGN' ? '간판' : cardGroup
    cardIndex++
    const cardNumber = `${orderDate}-${orderSeq}-${String(cardIndex).padStart(2, '0')}`

    // PP 합집합 (code 기준 중복 제거)
    const mergedPPMap = new Map<string, any>()
    for (const entry of entries) {
      if (entry.ppJson) {
        try {
          const procs = JSON.parse(entry.ppJson)
          if (Array.isArray(procs)) {
            for (const proc of procs) {
              if (proc && proc.code) mergedPPMap.set(proc.code, proc)
              else if (typeof proc === 'string' && proc) mergedPPMap.set(proc, { code: proc, name: proc })
            }
          }
        } catch (_) {
          if (entry.ppJson.trim()) mergedPPMap.set(entry.ppJson, { code: entry.ppJson, name: entry.ppJson })
        }
      }
    }
    const uniquePP = [...mergedPPMap.values()]

    // 후가공 마진
    let mL = 0, mR = 0, mT = 0, mB = 0
    for (const pp of uniquePP) {
      mL = Math.max(mL, Number(pp.margin_left) || 0)
      mR = Math.max(mR, Number(pp.margin_right) || 0)
      mT = Math.max(mT, Number(pp.margin_top) || 0)
      mB = Math.max(mB, Number(pp.margin_bottom) || 0)
    }
    const ppNames = uniquePP.map((p: any) => p.name || p.code).filter(Boolean)
    const postProcStr = ppNames.length > 0 ? `[${ppNames.join('+')}]` : ''

    // 마감 여백
    let finL = 0, finR = 0, finT = 0, finB = 0
    let cardFinishing: any = null
    let cardFinishingMarginSum = 0
    for (const entry of entries) {
      if (entry.item.finishing) {
        try {
          const fin = typeof entry.item.finishing === 'string'
            ? JSON.parse(entry.item.finishing) : entry.item.finishing
          const fT = fin.top_cm !== undefined ? Number(fin.top_cm) : (finMarginMap.get(fin.top) || 0)
          const fB = fin.bottom_cm !== undefined ? Number(fin.bottom_cm) : (finMarginMap.get(fin.bottom) || 0)
          const fL = fin.left_cm !== undefined ? Number(fin.left_cm) : (finMarginMap.get(fin.left) || 0)
          const fR = fin.right_cm !== undefined ? Number(fin.right_cm) : (finMarginMap.get(fin.right) || 0)
          finT = Math.max(finT, fT)
          finB = Math.max(finB, fB)
          finL = Math.max(finL, fL)
          finR = Math.max(finR, fR)
          const marginSum = fT + fB + fL + fR
          if ((fin.top || fin.bottom || fin.left || fin.right) && marginSum >= cardFinishingMarginSum) {
            cardFinishing = fin
            cardFinishingMarginSum = marginSum
          }
        } catch (_) { /* invalid JSON, skip */ }
      }
    }

    const firstItem = entries[0].item
    const cardWidth = (firstItem.width as number) || 0
    const cardHeight = (firstItem.height as number) || 0
    const totalQty = entries.reduce((s: number, e) => s + e.qty, 0)
    const ripFilename = `${cardNumber}-${client?.client_name || 'Unknown'}-${category}(${entries.length}건)${postProcStr}`

    const totalML = mL + finL, totalMR = mR + finR
    const totalMT = mT + finT, totalMB = mB + finB

    cardGroupEntries.push({ cardNumber, entries })
    cardStatements.push(
      db.prepare(`
        INSERT INTO cards (
          card_number, order_id, order_item_id, status,
          client_name, item_name, category_name,
          width, height, quantity, unit,
          rip_filename, post_processing,
          final_width, final_height,
          delivery_date, priority, finishing, notes,
          requesting_entity_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        cardNumber, orderId, null, 'PRINTING',
        client?.client_name || 'Unknown', category, category,
        cardWidth, cardHeight, totalQty, (firstItem.unit as string) || 'EA',
        ripFilename, JSON.stringify(uniquePP),
        cardWidth > 0 ? cardWidth + totalML + totalMR : 0,
        cardHeight > 0 ? cardHeight + totalMT + totalMB : 0,
        deliveryDate || null, cardPriority,
        cardFinishing ? JSON.stringify(cardFinishing) : null,
        notes || null,
        entityId ?? null
      )
    )
  }

  // 카드가 없으면 바로 리턴
  if (cardStatements.length === 0) return 0

  // D1 batch: 카드 INSERT 원자적 실행
  const batchResults = await db.batch(cardStatements)

  // card_items INSERT (카드 ID 기반)
  const itemStatements: D1PreparedStatement[] = []
  for (let i = 0; i < batchResults.length; i++) {
    const cardId = batchResults[i].meta.last_row_id
    for (const entry of cardGroupEntries[i].entries) {
      itemStatements.push(
        db.prepare(`INSERT INTO card_items (card_id, order_item_id, quantity) VALUES (?, ?, ?)`)
          .bind(cardId, entry.item.id as number, entry.qty)
      )
    }
  }
  if (itemStatements.length > 0) {
    await db.batch(itemStatements)
  }

  return cardStatements.length
}

const ordersCoreRouter = new Hono<HonoEnv>()
ordersCoreRouter.use('/*', authMiddleware, requireAnyPagePermission('/orders', '/cards'))

ordersCoreRouter.get('/', async (c) => {
  try {
    const { page = '1', limit = '50', status = '', search = '', sort = 'created_at_desc', date_from = '', date_to = '', exclude_status = '', priority = '', amount_min = '', amount_max = '', delivery_method = '', billing_status = '' } = c.req.query()
    const safeLimit = Math.min(parseInt(limit) || 50, 200)
    const offset = (parseInt(page) - 1) * safeLimit

    let query = `
      SELECT
        o.*,
        c.client_name,
        c.mobile as client_mobile,
        c.phone as client_phone,
        c.email as client_email,
        c.fax as client_fax,
        u.name as created_by_name,
        (SELECT COUNT(*) FROM cards WHERE order_id = o.id) as total_cards,
        (SELECT COUNT(*) FROM cards WHERE order_id = o.id AND shipped_at IS NOT NULL) as shipped_cards
      FROM orders o
      LEFT JOIN clients c ON o.client_id = c.id
      LEFT JOIN users u ON o.created_by = u.id
    `
    const params: any[] = []
    const whereClauses: string[] = []

    // Entity filter (멀티사업자)
    const ef = entityFilter(c, 'o')
    if (ef.params.length > 0) {
      whereClauses.push(ef.clause.replace(' AND ', ''))
      params.push(...ef.params)
    }

    // Status filter
    if (status) {
      whereClauses.push('o.status = ?')
      params.push(status)
    }

    // Search filter (order number or client name)
    if (search) {
      whereClauses.push('(o.order_number LIKE ? OR c.client_name LIKE ?)')
      const searchPattern = `%${search}%`
      params.push(searchPattern, searchPattern)
    }

    // Date range filter
    if (date_from) {
      whereClauses.push('o.order_date >= ?')
      params.push(date_from)
    }
    if (date_to) {
      whereClauses.push('o.order_date <= ?')
      params.push(date_to)
    }

    if (exclude_status) {
      const excludes = exclude_status.split(',').map(s => s.trim()).filter(Boolean)
      if (excludes.length === 1) {
        whereClauses.push('o.status != ?')
        params.push(excludes[0])
      } else if (excludes.length > 1) {
        whereClauses.push(`o.status NOT IN (${excludes.map(() => '?').join(',')})`)
        params.push(...excludes)
      }
    }

    // Priority filter
    if (priority) {
      whereClauses.push('o.priority = ?')
      params.push(priority)
    }

    // Amount range filter
    if (amount_min) {
      const min = parseFloat(amount_min)
      if (!isNaN(min)) { whereClauses.push('o.final_amount >= ?'); params.push(min) }
    }
    if (amount_max) {
      const max = parseFloat(amount_max)
      if (!isNaN(max)) { whereClauses.push('o.final_amount <= ?'); params.push(max) }
    }

    // Delivery method filter
    if (delivery_method) {
      whereClauses.push('o.delivery_method = ?')
      params.push(delivery_method)
    }

    // Billing status filter
    if (billing_status) {
      if (billing_status === 'NONE') {
        whereClauses.push("(o.billing_status IS NULL OR o.billing_status = '')")
      } else {
        whereClauses.push('o.billing_status = ?')
        params.push(billing_status)
      }
    }

    if (whereClauses.length > 0) {
      query += ' WHERE ' + whereClauses.join(' AND ')
    }

    // Sorting
    const sortOptions: Record<string, string> = {
      'created_at_desc': 'o.created_at DESC',
      'created_at_asc': 'o.created_at ASC',
      'delivery_date_asc': 'o.delivery_date ASC NULLS LAST',
      'delivery_date_desc': 'o.delivery_date DESC NULLS LAST',
      'final_amount_desc': 'o.final_amount DESC',
      'priority_desc': "CASE WHEN o.priority = 'URGENT' THEN 0 ELSE 1 END, o.delivery_date ASC"
    }
    const orderBy = sortOptions[sort] || 'o.created_at DESC'
    
    query += ` ORDER BY ${orderBy} LIMIT ? OFFSET ?`
    params.push(safeLimit, offset)

    const { results } = await c.env.DB.prepare(query).bind(...params).all()

    // Get total count
    let countQuery = 'SELECT COUNT(*) as count FROM orders o LEFT JOIN clients c ON o.client_id = c.id'
    const countParams: any[] = []
    const countWhereClauses: string[] = []

    // Entity filter (멀티사업자)
    const efCount = entityFilter(c, 'o')
    if (efCount.params.length > 0) {
      countWhereClauses.push(efCount.clause.replace(' AND ', ''))
      countParams.push(...efCount.params)
    }

    if (status) {
      countWhereClauses.push('o.status = ?')
      countParams.push(status)
    }

    if (search) {
      countWhereClauses.push('(o.order_number LIKE ? OR c.client_name LIKE ?)')
      const searchPattern = `%${search}%`
      countParams.push(searchPattern, searchPattern)
    }

    // Date range filter (count query)
    if (date_from) {
      countWhereClauses.push('o.order_date >= ?')
      countParams.push(date_from)
    }
    if (date_to) {
      countWhereClauses.push('o.order_date <= ?')
      countParams.push(date_to)
    }

    if (exclude_status) {
      const excludes = exclude_status.split(',').map(s => s.trim()).filter(Boolean)
      if (excludes.length === 1) {
        countWhereClauses.push('o.status != ?')
        countParams.push(excludes[0])
      } else if (excludes.length > 1) {
        countWhereClauses.push(`o.status NOT IN (${excludes.map(() => '?').join(',')})`)
        countParams.push(...excludes)
      }
    }

    if (priority) {
      countWhereClauses.push('o.priority = ?')
      countParams.push(priority)
    }
    if (amount_min) {
      countWhereClauses.push('o.final_amount >= ?')
      countParams.push(parseFloat(amount_min))
    }
    if (amount_max) {
      countWhereClauses.push('o.final_amount <= ?')
      countParams.push(parseFloat(amount_max))
    }
    if (delivery_method) {
      countWhereClauses.push('o.delivery_method = ?')
      countParams.push(delivery_method)
    }
    if (billing_status) {
      if (billing_status === 'NONE') {
        countWhereClauses.push("(o.billing_status IS NULL OR o.billing_status = '')")
      } else {
        countWhereClauses.push('o.billing_status = ?')
        countParams.push(billing_status)
      }
    }

    if (countWhereClauses.length > 0) {
      countQuery += ' WHERE ' + countWhereClauses.join(' AND ')
    }

    const countRow = await c.env.DB.prepare(countQuery).bind(...countParams).first<{ count: number }>()
    const count = countRow?.count || 0

    const response: PaginatedResponse<Order> = {
      success: true,
      data: results as unknown as Order[],
      pagination: {
        page: parseInt(page),
        limit: safeLimit,
        total: count,
        total_pages: Math.ceil(count / safeLimit)
      }
    }

    return c.json(response)
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// GET /api/orders/quotations/expired - 유효기한 지난 견적 목록
ordersCoreRouter.patch('/:id/bill', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')
    const user = c.get('user')
    const body = await c.req.json().catch(() => ({})) as { billed_amount?: number }

    const order = await c.env.DB.prepare(
      'SELECT id, status, client_id, final_amount, billing_status FROM orders WHERE id = ?'
    ).bind(id).first<{ id: number; status: string; client_id: number; final_amount: number; billing_status: string | null }>()

    if (!order) {
      return c.json({ success: false, error: 'Order not found' }, 404)
    }

    if (order.status !== 'SHIPPED') {
      return c.json({
        success: false,
        error: '출고(SHIPPED) 상태인 주문만 회계반영할 수 있습니다'
      }, 400)
    }

    if (order.billing_status === 'BILLED') {
      return c.json({ success: false, error: '이미 회계반영된 주문입니다' }, 400)
    }

    const maxAmount = parseFloat(String(order.final_amount)) || 0
    const billedAmount = body.billed_amount !== undefined
      ? Math.min(Math.max(0, parseFloat(String(body.billed_amount)) || 0), maxAmount * 1.5)
      : maxAmount

    await c.env.DB.prepare(`
      UPDATE orders
      SET billing_status = 'BILLED',
          billed_at = CURRENT_TIMESTAMP,
          billed_by = ?,
          billed_amount = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(user?.id || null, billedAmount, id).run()

    // 미수금 증가 (매출 확정)
    await c.env.DB.prepare(
      'UPDATE clients SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(billedAmount, order.client_id).run()

    return c.json({
      success: true,
      data: { billing_status: 'BILLED', billed_amount: billedAmount }
    })
  } catch (error) {
    console.error('Bill order error:', error)
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// Update billing status (회계반영/수금완료/취소)
ordersCoreRouter.patch('/:id/billing-status', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')
    const user = c.get('user')
    const { billing_status: newStatus } = await c.req.json() as { billing_status: string }

    const order = await c.env.DB.prepare(
      'SELECT id, status, client_id, final_amount, billing_status, billed_amount FROM orders WHERE id = ?'
    ).bind(id).first<{ id: number; status: string; client_id: number; final_amount: number; billing_status: string | null; billed_amount: number | null }>()

    if (!order) {
      return c.json({ success: false, error: 'Order not found' }, 404)
    }

    const oldStatus = order.billing_status || ''

    if (newStatus === 'BILLED') {
      // 회계반영: SHIPPED 상태만 가능
      if (order.status !== 'SHIPPED') {
        return c.json({ success: false, error: '출고완료 상태인 주문만 회계반영 가능합니다' }, 400)
      }
      const billedAmount = Number(order.final_amount) || 0
      await c.env.DB.prepare(`
        UPDATE orders SET billing_status = 'BILLED', billed_at = CURRENT_TIMESTAMP, billed_by = ?, billed_amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).bind(user?.id || null, billedAmount, id).run()
      // 미수금 증가
      if (oldStatus !== 'BILLED' && oldStatus !== 'PAID') {
        await c.env.DB.prepare(
          'UPDATE clients SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        ).bind(billedAmount, order.client_id).run()
      }
    } else if (newStatus === 'PAID') {
      // 수금완료
      if (oldStatus !== 'BILLED') {
        return c.json({ success: false, error: '회계반영된 주문만 수금완료 처리할 수 있습니다' }, 400)
      }
      const billedAmount = order.billed_amount || Number(order.final_amount) || 0
      await c.env.DB.prepare(`
        UPDATE orders SET billing_status = 'PAID', updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).bind(id).run()
      // 미수금 차감 (수금 완료)
      await c.env.DB.prepare(
        'UPDATE clients SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).bind(billedAmount, order.client_id).run()
    } else {
      // 회계반영 취소 (빈 문자열)
      if (oldStatus === 'BILLED') {
        const billedAmount = order.billed_amount || Number(order.final_amount) || 0
        await c.env.DB.prepare(
          'UPDATE clients SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        ).bind(billedAmount, order.client_id).run()
      } else if (oldStatus === 'PAID') {
        // PAID에서 되돌리기는 허용하지 않음
        return c.json({ success: false, error: '수금완료 상태에서는 직접 미확인으로 변경할 수 없습니다' }, 400)
      }
      await c.env.DB.prepare(`
        UPDATE orders SET billing_status = NULL, billed_at = NULL, billed_by = NULL, billed_amount = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).bind(id).run()
    }

    return c.json({ success: true, data: { billing_status: newStatus || null } })
  } catch (error) {
    console.error('Update billing status error:', error)
    console.error('src/routes/orders.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// PATCH output_folder (C#에서 파일 저장 완료 후 호출)
ordersCoreRouter.patch('/:id/output-folder', async (c) => {
  try {
    const id = c.req.param('id')
    const { output_folder } = await c.req.json()
    if (!output_folder) return c.json({ success: false, error: 'output_folder required' }, 400)
    await c.env.DB.prepare('UPDATE orders SET output_folder = ? WHERE id = ?').bind(output_folder, id).run()
    return c.json({ success: true })
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500)
  }
})

// Get order timeline (status history)
ordersCoreRouter.get('/:id/timeline', async (c) => {
  try {
    const id = c.req.param('id')
    const { results } = await c.env.DB.prepare(`
      SELECT osh.*, u.name as changed_by_name
      FROM order_status_history osh
      LEFT JOIN users u ON osh.changed_by = u.id
      WHERE osh.order_id = ?
      ORDER BY osh.created_at ASC
    `).bind(id).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('src/routes/orders.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// Get invoice data for an order (must be before /:id to avoid route conflict)
ordersCoreRouter.get('/:id/invoice', async (c) => {
  try {
    const id = c.req.param('id')

    // Get order with client_name
    const order = await c.env.DB.prepare(`
      SELECT
        o.*,
        c.client_name,
        u.name as created_by_name
      FROM orders o
      LEFT JOIN clients c ON o.client_id = c.id
      LEFT JOIN users u ON o.created_by = u.id
      WHERE o.id = ?
    `).bind(id).first()

    if (!order) {
      return c.json({
        success: false,
        error: 'Order not found'
      }, 404)
    }

    // Cast order to a typed shape for property access
    const o = order as Record<string, unknown>

    // Get full client info
    const client = o.client_id
      ? await c.env.DB.prepare(
          `SELECT id, client_code, client_name, representative, business_registration_number,
                  business_type, business_item, phone, mobile, fax, email, address, postal_code,
                  transfer_info, is_active, balance, client_type, delivery_method, auto_billing,
                  price_policy_id, notes, invoice_method, created_at, updated_at
           FROM clients WHERE id = ?`
        ).bind(o.client_id as number).first() as Record<string, unknown> | null
      : null

    // Get order items (부모행/단독행만 반환 - 자식행 제외)
    const { results: items } = await c.env.DB.prepare(`
      SELECT oi.*, ar.file_path AS ai_file_path
      FROM order_items oi
      LEFT JOIN ai_analysis_requests ar ON ar.id = oi.ai_analysis_id
      WHERE oi.order_id = ? AND oi.parent_item_id IS NULL
      ORDER BY oi.sort_order ASC
    `).bind(id).all()

    // Get company settings (entity 우선, 폴백 settings)
    const entityId = (o.entity_id as number) || getEntityId(c)
    const company = await getEntityCompanyInfo(c.env.DB, entityId)

    return c.json({
      success: true,
      data: {
        order, client, items, company,
        // 전미수금/현미수금: BILLED면 balance에 이미 포함, 아니면 미포함
        previous_balance: o.billing_status === 'BILLED'
          ? ((client?.balance as number) || 0) - ((o.billed_amount as number) || (o.final_amount as number) || 0)
          : ((client?.balance as number) || 0),
        current_balance: o.billing_status === 'BILLED'
          ? ((client?.balance as number) || 0)
          : ((client?.balance as number) || 0) + ((o.final_amount as number) || 0)
      }
    })
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// GET /in-transit - 배송 중 주문 목록 (출고 처리됨, 아직 SHIPPED 아님)
// ※ /:id 보다 먼저 등록해야 "in-transit"가 :id로 매칭되지 않음
ordersCoreRouter.get('/in-transit', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const ef = entityFilter(c, 'o')
    const { results } = await c.env.DB.prepare(`
      SELECT o.id, o.order_number, o.delivery_method, o.delivery_date,
             o.auto_complete_date, o.updated_at,
             c.client_name
      FROM orders o
      JOIN clients c ON o.client_id = c.id
      WHERE o.status = 'PRINT_DONE'
        AND o.auto_complete_date IS NOT NULL
        ${ef.clause}
      ORDER BY o.auto_complete_date ASC
    `).bind(...ef.params).all()

    return c.json({ success: true, data: results })
  } catch (error) {
    return c.json({ success: false, error: '조회 실패' }, 500)
  }
})

// Get order by ID
ordersCoreRouter.get('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    
    // Get order (Phase 3.2: quotation_number도 함께 — 견적서 연결 표시용)
    const order = await c.env.DB.prepare(`
      SELECT
        o.*,
        c.client_name,
        u.name as created_by_name,
        q.quotation_number as quotation_number
      FROM orders o
      LEFT JOIN clients c ON o.client_id = c.id
      LEFT JOIN users u ON o.created_by = u.id
      LEFT JOIN quotations q ON o.quotation_id = q.id
      WHERE o.id = ?
    `).bind(id).first()

    if (!order) {
      return c.json({
        success: false,
        error: 'Order not found'
      }, 404)
    }

    // Get order items (ai_analysis_id → file_path JOIN으로 품목별 소스 파일 경로 포함, pricing_method 포함)
    // card_items → cards JOIN으로 품목별 card_id, card_number 포함 (IA file-map 등록용)
    const { results: items } = await c.env.DB.prepare(`
      SELECT oi.*, ar.file_path AS ai_file_path,
             ar.groups_json AS ai_groups_json,
             i.pricing_method AS pricing_method,
             ci.card_id AS card_id,
             ca.card_number AS card_number
      FROM order_items oi
      LEFT JOIN ai_analysis_requests ar ON ar.id = oi.ai_analysis_id
      LEFT JOIN items i ON i.id = oi.item_id
      LEFT JOIN card_items ci ON ci.order_item_id = oi.id
      LEFT JOIN cards ca ON ca.id = ci.card_id
      WHERE oi.order_id = ?
      ORDER BY oi.sort_order ASC
    `).bind(id).all()

    const response: ApiResponse<any> = {
      success: true,
      data: {
        ...order,
        items
      }
    }

    return c.json(response)
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// Create new order
ordersCoreRouter.post('/', async (c) => {
  try {
    const user = c.get('user')
    const orderData = await c.req.json()

    // Validate required fields
    if (!orderData.client_id || !orderData.items || orderData.items.length === 0) {
      return c.json({
        success: false,
        error: '거래처와 품목은 필수입니다.'
      }, 400)
    }
    if (!orderData.delivery_date) {
      return c.json({ success: false, error: '납품일은 필수입니다.' }, 400)
    }

    // AI 파일 관련 필드
    const aiFilePath: string | null = orderData.ai_file_path || null
    const aiAnalysisId: number | null = orderData.ai_analysis_id || null
    const layoutId: number | null = orderData.layout_id || null

    // Generate order number (without ORD- prefix)
    const today = new Date()
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '')

    // MAX 기반: 삭제된 주문이 있어도 시퀀스가 겹치지 않음
    const seqRow = await c.env.DB.prepare(`
      SELECT COALESCE(MAX(CAST(SUBSTR(order_number, 10) AS INTEGER)), 0) as max_seq
      FROM orders WHERE order_number LIKE ?
    `).bind(`${dateStr}-%`).first<{ max_seq: number }>()
    const max_seq = seqRow?.max_seq || 0

    const orderNumber = `${dateStr}-${String((max_seq || 0) + 1).padStart(3, '0')}`

    // pricing_method batch 조회 (AREA 계산 분기용)
    const itemIdsForPricing = [...new Set(
      orderData.items.map((it: any) => it.item_id).filter((id: any) => id != null)
    )] as number[]
    const pricingMethodMap = new Map<number, string>()
    if (itemIdsForPricing.length > 0) {
      const placeholders = itemIdsForPricing.map(() => '?').join(',')
      const { results: pricingRows } = await c.env.DB.prepare(
        `SELECT id, pricing_method FROM items WHERE id IN (${placeholders})`
      ).bind(...itemIdsForPricing).all()
      for (const row of pricingRows) {
        pricingMethodMap.set(row.id as number, (row.pricing_method as string) || 'FIXED')
      }
    }

    // VAT rate from settings
    const vatSettingPost = await c.env.DB.prepare(
      `SELECT setting_value FROM settings WHERE setting_key = 'vat_rate'`
    ).first<{ setting_value: string }>()
    const vatRatePost = vatSettingPost ? parseFloat(vatSettingPost.setting_value) : 0.10

    // Calculate totals
    let totalAmount = 0
    let vatAmount = 0

    for (const item of orderData.items) {
      const pricingMethod = item.item_id ? (pricingMethodMap.get(item.item_id) || 'FIXED') : 'FIXED'
      const w = item.width_mm || item.width || 0
      const h = item.height_mm || item.height || 0
      let itemAmount: number
      if (pricingMethod === 'AREA' && w > 0 && h > 0) {
        // 10cm 올림 후 면적 계산 (프론트엔드와 동일)
        const wRound = Math.ceil(w / 10) * 10
        const hRound = Math.ceil(h / 10) * 10
        itemAmount = (item.unit_price || 0) * (wRound / 100) * (hRound / 100) * (item.quantity || 1)
      } else {
        itemAmount = (item.unit_price || 0) * (item.quantity || 1)
      }
      // 100원 단위 반올림
      itemAmount = Math.round(itemAmount / 100) * 100
      totalAmount += itemAmount
      if (item.vat_included) {
        vatAmount += itemAmount * vatRatePost
      }
    }

    const finalAmount = totalAmount + vatAmount - (orderData.discount_amount || 0)

    // QUOTATION 상태가 명시적으로 전달되면 견적서로 생성, 그 외 기본값 CONFIRMED
    const requestedStatus = orderData.status
    const initialStatus = requestedStatus === 'QUOTATION'
      ? 'QUOTATION'
      : 'CONFIRMED'

    // 견적서인 경우 valid_until 자동 설정 (30일 후), 명시적 값 우선
    let validUntil: string | null = null
    if (initialStatus === 'QUOTATION') {
      if (orderData.valid_until) {
        validUntil = orderData.valid_until
      } else {
        const validUntilDate = new Date(today)
        validUntilDate.setDate(validUntilDate.getDate() + 30)
        validUntil = validUntilDate.toISOString().split('T')[0]
      }
    }

    // Insert order
    const orderType = orderData.order_type === 'DISTRIBUTION' ? 'DISTRIBUTION' : 'PRODUCTION'
    // Phase 3.2: source_quotation_id 받으면 orders.quotation_id에 저장 (견적서 → 주문 prefill 흐름)
    const sourceQuotationId = orderData.source_quotation_id || orderData.quotation_id || null
    const orderResult = await c.env.DB.prepare(`
      INSERT INTO orders (
        order_number, client_id, status, order_year, order_month,
        reception_location, delivery_info, delivery_date, order_date,
        total_amount, vat_amount, discount_amount, final_amount,
        notes, internal_notes, created_by,
        ai_file_path, ai_analysis_id, layout_id, priority, delivery_method, delivery_time,
        contact_phone, contact_mobile, shipping_payment, valid_until, entity_id,
        sheet_layout_params, order_type, quotation_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      orderNumber,
      orderData.client_id,
      initialStatus,
      orderData.order_year || today.getFullYear(),
      orderData.order_month || today.getMonth() + 1,
      orderData.reception_location || null,
      orderData.delivery_info || null,
      orderData.delivery_date || null,
      orderData.order_date || today.toISOString().split('T')[0],
      totalAmount,
      vatAmount,
      orderData.discount_amount || 0,
      finalAmount,
      orderData.notes || null,
      orderData.internal_notes || null,
      user?.id || 1,
      aiFilePath,
      aiAnalysisId,
      layoutId,
      orderData.priority || 'NORMAL',
      orderData.delivery_method || '배송',
      orderData.delivery_time || null,
      orderData.contact_phone || null,
      orderData.contact_mobile || null,
      orderData.shipping_payment || null,
      validUntil,
      getEntityId(c),
      (() => {
        const slItem = orderData.items.find((it: any) => it.sheet_layout_params && !it.parent_client_id)
        return slItem?.sheet_layout_params || null
      })(),
      orderType,
      sourceQuotationId
    ).run()

    // Phase 3.2: 견적서로부터 생성된 주문이면 quotations 카운트 갱신
    if (sourceQuotationId && initialStatus !== 'QUOTATION') {
      await c.env.DB.prepare(`
        UPDATE quotations
        SET converted_count = converted_count + 1,
            first_converted_at = COALESCE(first_converted_at, CURRENT_TIMESTAMP),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(sourceQuotationId).run().catch(() => {})
    }

    const orderId = orderResult.meta.last_row_id

    // Insert order items — two-pass for parent_item_id support
    // Pass 1: parent/regular rows (no parent_client_id) → collect DB IDs
    const clientIdMap = new Map<string, number>() // client_group_id → db id

    for (let i = 0; i < orderData.items.length; i++) {
      const item = orderData.items[i]
      if (item.parent_client_id) continue  // 자식 행은 2단계에서 처리

      const itemPricingMethod = item.item_id ? (pricingMethodMap.get(item.item_id) || 'FIXED') : 'FIXED'
      const itemW = item.width_mm || item.width || 0
      const itemH = item.height_mm || item.height || 0
      let itemAmount: number
      if (itemPricingMethod === 'AREA' && itemW > 0 && itemH > 0) {
        const iwRound = Math.ceil(itemW / 10) * 10
        const ihRound = Math.ceil(itemH / 10) * 10
        itemAmount = (item.unit_price || 0) * (iwRound / 100) * (ihRound / 100) * (item.quantity || 1)
      } else {
        itemAmount = (item.unit_price || 0) * (item.quantity || 1)
      }
      itemAmount = Math.round(itemAmount / 100) * 100
      let itemName = item.item_name || null
      let categoryName = item.category_name || null
      let unit = item.unit || 'EA'

      if (item.item_id && !itemName) {
        const itemDetail = await c.env.DB.prepare(`
          SELECT item_name, category, unit FROM items WHERE id = ?
        `).bind(item.item_id).first<{ item_name: string; category: string; unit: string }>()

        if (itemDetail) {
          itemName = itemDetail.item_name
          categoryName = itemDetail.category
          unit = itemDetail.unit
        }
      }

      const insertResult = await c.env.DB.prepare(`
        INSERT INTO order_items (
          order_id, item_id, item_name, category_name,
          width, height, quantity, unit,
          unit_price, amount, vat_included,
          post_processing, content, sort_order,
          ai_group_index, scale_factor, ai_analysis_id, parent_item_id, finishing
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
      `).bind(
        orderId,
        item.item_id || null,
        itemName || 'Unknown',
        categoryName || null,
        item.width_mm || item.width || null,
        item.height_mm || item.height || null,
        item.quantity || 1,
        unit,
        item.unit_price || 0,
        itemAmount,
        item.vat_included !== undefined ? (item.vat_included ? 1 : 0) : 1,
        item.post_processing || item.paper || null,
        item.content || item.print || null,
        i,
        item.ai_group_index !== undefined ? item.ai_group_index : null,
        item.scale_factor || 1,
        item.ai_analysis_id || null,
        item.finishing || null
      ).run()

      if (item.client_group_id) {
        clientIdMap.set(item.client_group_id, insertResult.meta.last_row_id as number)
      }
    }

    // Pass 2: child rows (has parent_client_id) → resolve parent DB ID
    const parentOnlyCount = orderData.items.filter((i: any) => !i.parent_client_id).length
    for (let i = 0; i < orderData.items.length; i++) {
      const item = orderData.items[i]
      if (!item.parent_client_id) continue

      const parentDbId = clientIdMap.get(item.parent_client_id) ?? null

      await c.env.DB.prepare(`
        INSERT INTO order_items (
          order_id, item_id, item_name, category_name,
          width, height, quantity, unit,
          unit_price, amount, vat_included,
          post_processing, content, sort_order,
          ai_group_index, scale_factor, ai_analysis_id, parent_item_id
        ) VALUES (?, NULL, ?, NULL, ?, ?, ?, ?, 0, 0, 1, NULL, ?, ?, ?, ?, ?, ?)
      `).bind(
        orderId,
        item.item_name || '',
        item.width_mm || item.width || null,
        item.height_mm || item.height || null,
        item.quantity || 1,
        item.unit || 'EA',
        item.content || null,
        parentOnlyCount + i,
        item.ai_group_index !== undefined ? item.ai_group_index : null,
        item.scale_factor || 1,
        item.ai_analysis_id || null,
        parentDbId
      ).run()
    }

    // Insert status history
    await c.env.DB.prepare(`
      INSERT INTO order_status_history (order_id, to_status, changed_by, change_reason)
      VALUES (?, ?, ?, ?)
    `).bind(orderId, initialStatus, user?.id || null, initialStatus === 'QUOTATION' ? 'Quotation created' : 'Order created').run()

    // Step 4 — enqueue an AI_PROCESS task for IllustratorAutomat.
    // One task per order covers the entire file: JSX processing + EPS output +
    // NAS upload to Z:\orders\{category}\{year}\{month}\{order_number}\.
    // The agent claims this via POST /api/tasks/claim?type=AI_PROCESS.
    if (aiFilePath) {
      try {
        await c.env.DB.prepare(`
          INSERT INTO tasks (type, status, order_id, input_payload, created_by)
          VALUES ('AI_PROCESS', 'PENDING', ?, ?, ?)
        `).bind(
          orderId,
          JSON.stringify({
            order_number: orderNumber,
            ai_file_path: aiFilePath,
            ai_analysis_id: orderData.ai_analysis_id ?? null
          }),
          user?.id || null
        ).run()
      } catch (taskErr) {
        // Non-fatal — IllustratorAutomat still polls /api/orders?status=CONFIRMED
        // as a legacy fallback, so the order will be picked up either way.
        console.error('Failed to enqueue AI_PROCESS task:', taskErr)
      }
    }

    // balance는 경리 확인(BILLED) 시점에만 반영 — 주문 생성 시 미반영

    // Auto-generate cards immediately after order creation
    // QUOTATION 상태 주문은 카드 생성 건너뜀 (확정 전 견적)
    if (initialStatus === 'QUOTATION') {
      return c.json({
        success: true,
        data: { id: orderId, order_number: orderNumber },
        message: `견적서가 생성되었습니다. 유효기한: ${validUntil}`
      })
    }

    // 유통 주문: 카드 미생성, 전 품목 shipment_ready=1 (바로 출고 가능)
    let cardsGenerated = 0
    if (orderType === 'DISTRIBUTION') {
      await c.env.DB.prepare(
        `UPDATE order_items SET shipment_ready = 1 WHERE order_id = ?`
      ).bind(orderId).run()
    } else {
      cardsGenerated = await generateCardsForOrder({
        db: c.env.DB,
        orderId,
        orderNumber,
        clientId: orderData.client_id,
        deliveryDate: orderData.delivery_date || null,
        priority: orderData.priority || 'NORMAL',
        notes: orderData.notes || null,
        entityId: getEntityId(c)
      })
    }

    // ── C. Thumbnail extraction: for each created card, look up AI group thumbnail ──
    // Only attempt if the order has an ai_analysis_id or any item has one
    try {
      const { results: cardsForThumb } = await c.env.DB.prepare(`
        SELECT c.id as card_id, oi.ai_analysis_id, oi.ai_group_index
        FROM cards c
        JOIN card_items ci ON ci.card_id = c.id
        JOIN order_items oi ON oi.id = ci.order_item_id
        WHERE c.order_id = ?
          AND oi.ai_analysis_id IS NOT NULL
          AND oi.ai_group_index IS NOT NULL
          AND c.thumbnail_url IS NULL
        GROUP BY c.id
      `).bind(orderId).all()

      // Cache analysis results to avoid redundant DB lookups
      const analysisCache = new Map<number, Record<string, unknown>[]>()

      for (const row of cardsForThumb) {
        const analysisId = row.ai_analysis_id as number
        const groupIndex = row.ai_group_index as number

        if (!analysisCache.has(analysisId)) {
          const analysis = await c.env.DB.prepare(
            'SELECT groups_json FROM ai_analysis_requests WHERE id = ?'
          ).bind(analysisId).first<{ groups_json: string | null }>()
          if (analysis?.groups_json) {
            try {
              analysisCache.set(analysisId, JSON.parse(analysis.groups_json))
            } catch (_) {
              analysisCache.set(analysisId, [])
            }
          } else {
            analysisCache.set(analysisId, [])
          }
        }

        const groups = analysisCache.get(analysisId) || []
        // ai_group_index === -1 means "whole file" → use first group's thumbnail
        const matchedGroup = groupIndex === -1
          ? groups[0]
          : groups.find((g) => g.index === groupIndex)

        if (matchedGroup?.thumbnail_base64) {
          const thumbnailUrl = `data:image/png;base64,${matchedGroup.thumbnail_base64 as string}`
          await c.env.DB.prepare(
            'UPDATE cards SET thumbnail_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
          ).bind(thumbnailUrl, row.card_id).run()
        }
      }
    } catch (_thumbErr) {
      // Thumbnail extraction failure must not break order creation
    }

    // ── D. 자동가공: ai_analysis_id가 있으면 auto_process_jobs 자동 생성 ──
    let autoProcessStarted = false
    if (aiAnalysisId) {
      try {
        const analysis = await c.env.DB.prepare(
          `SELECT id, file_path, groups_json FROM ai_analysis_requests WHERE id = ?`
        ).bind(aiAnalysisId).first<{ id: number; file_path: string; groups_json: string | null }>()
        if (analysis?.groups_json) {
          const groups = JSON.parse(analysis.groups_json || '[]')
          const { results: postOrderItems } = await c.env.DB.prepare(
            `SELECT id, order_id, item_id, item_name, category_name,
                    width, height, quantity, unit, unit_price, amount, vat_included,
                    post_processing, content, sort_order, parent_item_id,
                    scale_factor, finishing, finishing2, finishing3,
                    ai_group_index, ai_analysis_id
             FROM order_items WHERE order_id = ? AND ai_analysis_id IS NOT NULL ORDER BY sort_order ASC`
          ).bind(orderId).all()
          const aiItems = postOrderItems

          // sheet_layout 주문은 orders.sheet_layout_params에 저장됨
          // → C#의 ProcessOrderAsync에서 처리 (auto_process_jobs 불필요)
          // 여기서는 개별 자동가공 job만 생성 (기존 로직)
          {
          const SCALE_RULES: Record<string, number> = {
            '현수막': 5, '게시대': 5, '게릴라': 5, '솔벤현수막': 5,
            '패트': 1, '솔벤시트': 1, '합성지': 1, '포맥스': 1,
            'UV': 1, '클리어필름': 1, '간판': 1,
          }
          const MARGIN_RULES: Record<string, { w: number; h: number }> = {
            '미싱': { w: 83, h: 0 }, '사방접어미싱': { w: 61, h: 61 },
            '접어미싱': { w: 34, h: 0 }, '봉미싱': { w: 0, h: 55 },
            '밴드미싱': { w: 2, h: 0 }, '사방미싱': { w: 2, h: 0 },
            '열재단': { w: 14, h: 0 }, '재단만': { w: 0, h: 0 },
          }
          function _getScale(product: string, widthCm: number): number {
            const base = SCALE_RULES[product] ?? 5
            if (['현수막', '게시대', '솔벤현수막', '게릴라'].includes(product)) {
              if (widthCm > 300) return 5
              if (widthCm > 150) return 2
            }
            return base
          }
          function _getMargins(finishing: string): { w: number; h: number } {
            if (!finishing) return { w: 0, h: 0 }
            if (MARGIN_RULES[finishing]) return MARGIN_RULES[finishing]
            for (const k of Object.keys(MARGIN_RULES).sort((a, b) => b.length - a.length)) {
              if (finishing.includes(k)) return MARGIN_RULES[k]
            }
            return { w: 0, h: 0 }
          }

          for (const oi of aiItems) {
            const gIdx = (oi.ai_group_index as number) ?? 0
            const group = groups[gIdx]
            if (!group) continue

            const finishing = [oi.finishing, oi.finishing2, oi.finishing3].filter(Boolean).join('+')
            const itemInfo = await c.env.DB.prepare('SELECT name FROM items WHERE id = ?').bind(oi.item_id).first<{ name: string }>()
            const productName = itemInfo?.name || ''
            const scale = (oi.scale_factor as number) || _getScale(productName, (oi.width as number) || 0)
            const margins = _getMargins(finishing)
            const mL = margins.w / 10.0 / scale, mR = margins.w / 10.0 / scale
            const mT = margins.h > 0 ? margins.h / 10.0 / scale : 0
            const mB = margins.h > 0 ? margins.h / 10.0 / scale : 0
            const clipBounds = group.bounds_mm || null
            const ts = Date.now()
            const outputDir = 'Z:\\Designs\\IllustratorAutomat\\_auto_output'
            const srcBase = (analysis.file_path || 'output').split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') || 'output'

            const iaParams = {
              mode: 'process', source: analysis.file_path, output: outputDir,
              epsOutput: `${outputDir}\\${srcBase}_g${gIdx}_${ts}.eps`,
              pngOutput: `${outputDir}\\${srcBase}_g${gIdx}_${ts}.png`,
              marginL: mL, marginR: mR, marginT: mT, marginB: mB,
              thumbSize: 300, scaleFactor: scale, clipBounds,
            }

            await c.env.DB.prepare(
              `INSERT INTO auto_process_jobs
               (order_id, order_item_id, ai_analysis_id, ai_group_index,
                source_path, product, width_cm, height_cm, finishing,
                scale_factor, clip_bounds, margins, status, ia_params)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
            ).bind(
              orderId, oi.id as number, aiAnalysisId, gIdx,
              analysis.file_path, productName, (oi.width as number) || 0, (oi.height as number) || 0, finishing,
              scale, JSON.stringify(clipBounds),
              JSON.stringify({ L: mL, R: mR, T: mT, B: mB }),
              JSON.stringify(iaParams)
            ).run()
          }
          if (aiItems.length > 0) autoProcessStarted = true
          }
        }
      } catch (_autoErr) {
        // 자동가공 실패가 주문 생성을 방해하면 안 됨
        console.error('Auto-process job creation error:', _autoErr)
      }
    }

    await logActivity({
      db: c.env.DB, userId: user?.id, userName: user?.username,
      action: 'CREATE', entityType: 'ORDER', entityId: orderId,
      entityLabel: orderNumber, details: null
    })

    return c.json({
      success: true,
      data: {
        id: orderId,
        order_number: orderNumber
      },
      message: `Order created successfully. ${cardsGenerated} card(s) generated.${autoProcessStarted ? ' 자동가공이 시작되었습니다.' : ''}`
    })
  } catch (error) {
    console.error('Order creation error:', error)
    console.error('src/routes/orders.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// Update order status (MANAGER+ only)
ordersCoreRouter.patch('/:id/status', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')
    const { status, reason, confirmed_card_ids, cancelled_card_ids } = await c.req.json()
    const user = c.get('user')

    // Validate status
    const validStatuses = ['CONFIRMED', 'PRINTING', 'PRINT_DONE', 'SHIPPED']
    if (!validStatuses.includes(status)) {
      return c.json({
        success: false,
        error: 'Invalid status'
      }, 400)
    }

    // 상태 전이 유효성 검사
    // 취소(CANCELLED)는 별도 cancel 엔드포인트, 견적→주문은 convert-to-order에서 처리
    const validTransitions: Record<string, string[]> = {
      'CONFIRMED':  ['PRINTING', 'PRINT_DONE'],
      'PRINTING':   ['PRINT_DONE', 'CONFIRMED'],
      'PRINT_DONE': ['SHIPPED', 'PRINTING', 'CONFIRMED'],
      'SHIPPED':    [],
    }

    // Get current status
    const order = await c.env.DB.prepare('SELECT status, client_id, final_amount, order_number FROM orders WHERE id = ?').bind(id).first<{ status: string; client_id: number; final_amount: number; order_number: string }>()

    if (!order) {
      return c.json({
        success: false,
        error: 'Order not found'
      }, 404)
    }

    const allowed = validTransitions[order.status] ?? []
    if (!allowed.includes(status)) {
      return c.json({
        success: false,
        error: `상태 전이 불가: ${order.status} → ${status}`
      }, 400)
    }

    // SHIPPED 전환 시 미완료 카드 체크
    if (status === 'SHIPPED') {
      const { results: pendingCards } = await c.env.DB.prepare(`
        SELECT id, card_number, status, shipped_at FROM cards
        WHERE order_id = ? AND (status != 'PRINT_DONE' OR shipped_at IS NULL)
      `).bind(id).all()

      const unfinishedCards = (pendingCards || []).filter((cd) => cd.status !== 'PRINT_DONE')

      // 미완료 카드가 있고 확인 응답이 아닌 경우 → 확인 요청 반환
      if (unfinishedCards.length > 0 && !confirmed_card_ids && !cancelled_card_ids) {
        return c.json({
          success: false,
          requires_confirmation: true,
          pending_cards: unfinishedCards.map((cd) => ({
            id: cd.id,
            card_number: cd.card_number,
            status: cd.status,
          })),
          message: `인쇄 미완료 카드 ${unfinishedCards.length}건이 있습니다. 확인 후 진행해주세요.`
        })
      }

      // 확인 응답 처리: 확정된 카드 → PRINT_DONE + shipped_at
      if (confirmed_card_ids && confirmed_card_ids.length > 0) {
        for (const cardId of confirmed_card_ids) {
          await c.env.DB.prepare(`
            UPDATE cards SET status = 'PRINT_DONE', shipped_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND order_id = ?
          `).bind(cardId, id).run()
        }
      }

      // 취소된 카드 → HOLD 처리
      if (cancelled_card_ids && cancelled_card_ids.length > 0) {
        for (const cardId of cancelled_card_ids) {
          await c.env.DB.prepare(`
            UPDATE cards SET status = 'HOLD', updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND order_id = ?
          `).bind(cardId, id).run()
        }
      }

      // PRINT_DONE 카드 중 shipped_at 없는 것도 일괄 출고 처리
      await c.env.DB.prepare(`
        UPDATE cards SET shipped_at = CURRENT_TIMESTAMP
        WHERE order_id = ? AND status = 'PRINT_DONE' AND shipped_at IS NULL
      `).bind(id).run()
    }

    // #48: 주문 → 카드 상태 하향 동기화
    // PRINT_DONE 전환 시: 아직 PRINTING인 카드를 PRINT_DONE으로 일괄 전환
    if (status === 'PRINT_DONE') {
      const printingCards = await c.env.DB.prepare(`
        SELECT id FROM cards WHERE order_id = ? AND status = 'PRINTING'
      `).bind(id).all<{ id: number }>()

      if (printingCards.results && printingCards.results.length > 0) {
        const batchStmts: D1PreparedStatement[] = []
        for (const card of printingCards.results) {
          batchStmts.push(
            c.env.DB.prepare(`
              UPDATE cards SET status = 'PRINT_DONE', updated_at = CURRENT_TIMESTAMP WHERE id = ?
            `).bind(card.id)
          )
          batchStmts.push(
            c.env.DB.prepare(`
              INSERT INTO card_status_history (card_id, from_status, to_status, changed_by, change_reason)
              VALUES (?, 'PRINTING', 'PRINT_DONE', ?, '주문 상태 PRINT_DONE 동기화')
            `).bind(card.id, user?.id || null)
          )
        }
        for (let i = 0; i < batchStmts.length; i += 80) {
          const chunk = batchStmts.slice(i, i + 80)
          if (chunk.length > 0) await c.env.DB.batch(chunk)
        }
      }
    }

    // Update order status
    await c.env.DB.prepare(`
      UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP,
        confirmed_at = CASE WHEN ? = 'CONFIRMED' THEN CURRENT_TIMESTAMP ELSE confirmed_at END
      WHERE id = ?
    `).bind(status, status, id).run()

    // balance는 경리 확인(BILLED) 시점에만 반영 — QUOTATION→CONFIRMED 전환 시 미반영

    // Insert status history
    await c.env.DB.prepare(`
      INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, change_reason)
      VALUES (?, ?, ?, ?, ?)
    `).bind(id, order.status, status, user?.id || null, reason || null).run()

    await logActivity({
      db: c.env.DB, userId: user?.id, userName: user?.username,
      action: 'STATUS_CHANGE', entityType: 'ORDER', entityId: parseInt(id),
      entityLabel: order.order_number,
      details: JSON.stringify({ from: order.status, to: status })
    })

    if (status === 'CONFIRMED') {
      await notifyRoles(c.env.DB, ['OPERATOR'], '주문 확정', `${order.order_number} 주문이 확정되었습니다.`, '/orders')

      // 원가 자동계산
      try {
        await recalculateOrderCosts(c.env.DB, parseInt(id))
      } catch (costErr) {
        console.error('Cost calculation failed (non-blocking):', costErr)
      }
    } else if (status === 'SHIPPED') {
      await notifyRoles(c.env.DB, ['ADMIN', 'MANAGER'], '출고 완료', `${order.order_number} 출고 처리되었습니다.`, '/orders')
      // 연체 거래처 경고: balance > 0이고 30일 이상 미입금 주문이 있으면 경리에게 알림
      try {
        const clientCheck = await c.env.DB.prepare(`
          SELECT c.client_name, c.balance,
            (SELECT MIN(o2.billed_at) FROM orders o2 WHERE o2.client_id = c.id AND o2.billing_status = 'BILLED') as oldest_billed
          FROM clients c WHERE c.id = ? AND c.balance > 0
        `).bind(order.client_id).first<{ client_name: string; balance: number; oldest_billed: string | null }>()
        if (clientCheck && clientCheck.oldest_billed) {
          const daysSince = Math.floor((Date.now() - new Date(clientCheck.oldest_billed).getTime()) / 86400000)
          if (daysSince > 30) {
            await notifyRoles(c.env.DB, ['ADMIN', 'MANAGER'], '연체 거래처 출고',
              `${clientCheck.client_name} 미수금 ${(clientCheck.balance || 0).toLocaleString()}원 (${daysSince}일 연체)`,
              '/receivables')
          }
        }
      } catch (_) { /* 알림 실패해도 출고는 진행 */ }
    }

    return c.json({
      success: true,
      message: 'Order status updated successfully'
    })
  } catch (error) {
    console.error('src/routes/orders.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// Delete order (ADMIN 하드 삭제 / MANAGER 소프트 삭제 가능)
ordersCoreRouter.delete('/:id', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')
    const user = c.get('user')

    // Check if order exists (status, client_id, final_amount 포함)
    const order = await c.env.DB.prepare(`
      SELECT id, order_number, status, client_id, final_amount, billing_status, billed_amount FROM orders WHERE id = ?
    `).bind(id).first<{ id: number; order_number: string; status: string; client_id: number; final_amount: number; billing_status: string | null; billed_amount: number | null }>()

    if (!order) {
      return c.json({
        success: false,
        error: 'Order not found'
      }, 404)
    }

    // 이미 취소된 주문은 이중 차감 방지
    if (order.status === 'CANCELLED') {
      return c.json({ success: false, error: '이미 취소된 주문입니다.' }, 400)
    }

    // 세금계산서 발행 여부 확인
    const taxInvoiceCheck = await c.env.DB.prepare(`
      SELECT COUNT(*) as cnt FROM tax_invoices WHERE order_id = ? AND status != 'CANCELLED'
    `).bind(id).first<{ cnt: number }>()
    if (taxInvoiceCheck && taxInvoiceCheck.cnt > 0) {
      return c.json({
        success: false,
        error: '세금계산서가 발행된 주문은 삭제할 수 없습니다. 먼저 세금계산서를 취소해주세요.'
      }, 400)
    }

    // tax_invoice_orders 다대다 관계도 확인
    const taxInvoiceOrderCheck = await c.env.DB.prepare(`
      SELECT COUNT(*) as cnt FROM tax_invoice_orders tio
      JOIN tax_invoices ti ON tio.tax_invoice_id = ti.id
      WHERE tio.order_id = ? AND ti.status != 'CANCELLED'
    `).bind(id).first<{ cnt: number }>()
    if (taxInvoiceOrderCheck && taxInvoiceOrderCheck.cnt > 0) {
      return c.json({
        success: false,
        error: '세금계산서에 포함된 주문은 삭제할 수 없습니다. 먼저 세금계산서를 수정해주세요.'
      }, 400)
    }

    const CONFIRMED_AND_AFTER = ['CONFIRMED', 'PRINTING', 'PRINT_DONE', 'SHIPPED']

    // CONFIRMED 이후 상태 → 소프트 삭제(CANCELLED)
    const needsSoftDelete = CONFIRMED_AND_AFTER.includes(order.status)

    if (needsSoftDelete) {
      // 소프트 삭제: 상태를 CANCELLED로 변경
      await c.env.DB.prepare(`
        UPDATE orders
        SET status = 'CANCELLED',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(id).run()

      // 상태 변경 이력 기록
      await c.env.DB.prepare(`
        INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, change_reason)
        VALUES (?, ?, 'CANCELLED', ?, ?)
      `).bind(id, order.status, user.id, '주문 삭제 요청으로 인한 취소').run()

      // 카드 상태를 HOLD로 변경 (출고 완료 카드 제외)
      await c.env.DB.prepare(`
        UPDATE cards
        SET status = 'HOLD',
            hold_reason = '주문 삭제/취소',
            hold_at = CURRENT_TIMESTAMP,
            hold_by = ?
        WHERE order_id = ? AND status != 'HOLD'
          AND shipped_at IS NULL
      `).bind(user.id, id).run()

      // BILLED 주문만 balance 차감 (미확정 주문은 balance에 미반영 상태)
      if (order.billing_status === 'BILLED' && order.final_amount && order.final_amount !== 0) {
        await c.env.DB.prepare(`
          UPDATE clients
          SET balance = balance - ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(order.billed_amount || order.final_amount, order.client_id).run()
      }

      return c.json({
        success: true,
        message: '주문이 취소되었습니다',
        soft_delete: true
      })
    }

    // 하드 삭제 (CANCELLED 상태) — ADMIN만 허용
    if (user.role !== 'ADMIN') {
      return c.json({
        success: false,
        error: '해당 상태의 주문을 삭제하려면 ADMIN 권한이 필요합니다'
      }, 403)
    }

    // 하드 삭제 전 balance 역산
    // CANCELLED+BILLED: 소프트삭제 시 이미 차감됨 → 이중 차감 방지
    // 미BILLED: balance에 미반영 상태 → 역산 불필요
    // BILLED이면서 CANCELLED 아닌 경우만 차감 (직접 하드삭제하는 극히 드문 케이스)
    if (order.status !== 'CANCELLED' && order.billing_status === 'BILLED' && order.final_amount && order.final_amount !== 0) {
      await c.env.DB.prepare(`
        UPDATE clients
        SET balance = balance - ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(order.billed_amount || order.final_amount, order.client_id).run()
    }

    // Delete related shipments & shipment_items (서브쿼리로 N+1 제거)
    await c.env.DB.prepare(`
      DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE order_id = ?)
    `).bind(id).run()
    await c.env.DB.prepare('DELETE FROM shipments WHERE order_id = ?').bind(id).run()

    // Delete related cards (CASCADE will handle card_items)
    await c.env.DB.prepare(`
      DELETE FROM cards WHERE order_id = ?
    `).bind(id).run()

    // Delete order items
    await c.env.DB.prepare(`
      DELETE FROM order_items WHERE order_id = ?
    `).bind(id).run()

    // Delete order status history
    await c.env.DB.prepare(`
      DELETE FROM order_status_history WHERE order_id = ?
    `).bind(id).run()

    // Delete order
    await c.env.DB.prepare(`
      DELETE FROM orders WHERE id = ?
    `).bind(id).run()

    return c.json({
      success: true,
      message: `Order ${order.order_number} deleted successfully`
    })
  } catch (error) {
    console.error('Order deletion error:', error)
    console.error('src/routes/orders.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// Update order (MANAGER+ only)
ordersCoreRouter.put('/:id', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')
    const user = c.get('user')
    const orderData = await c.req.json()

    // Check if order exists (client_id, final_amount 포함하여 balance 차액 계산에 활용)
    const existingOrder = await c.env.DB.prepare(`
      SELECT id, status, client_id, final_amount, order_number, billing_status FROM orders WHERE id = ?
    `).bind(id).first<{ id: number; status: string; client_id: number; final_amount: number; order_number: string; billing_status: string | null }>()

    if (!existingOrder) {
      return c.json({
        success: false,
        error: 'Order not found'
      }, 404)
    }

    // 회계반영된 주문은 ADMIN/MANAGER만 수정 가능
    if (existingOrder.billing_status === 'BILLED') {
      if (!user || !['ADMIN', 'MANAGER'].includes(user.role)) {
        return c.json({
          success: false,
          error: '회계반영된 주문은 매니저 이상만 수정할 수 있습니다'
        }, 403)
      }
    }

    // pricing_method batch 조회 (AREA 계산 분기용)
    const putItemIdsForPricing = [...new Set(
      orderData.items.map((it: any) => it.item_id).filter((pid: any) => pid != null)
    )] as number[]
    const putPricingMethodMap = new Map<number, string>()
    if (putItemIdsForPricing.length > 0) {
      const putPlaceholders = putItemIdsForPricing.map(() => '?').join(',')
      const { results: putPricingRows } = await c.env.DB.prepare(
        `SELECT id, pricing_method FROM items WHERE id IN (${putPlaceholders})`
      ).bind(...putItemIdsForPricing).all()
      for (const row of putPricingRows) {
        putPricingMethodMap.set(row.id as number, (row.pricing_method as string) || 'FIXED')
      }
    }

    // VAT rate from settings
    const vatSettingPut = await c.env.DB.prepare(
      `SELECT setting_value FROM settings WHERE setting_key = 'vat_rate'`
    ).first<{ setting_value: string }>()
    const vatRatePut = vatSettingPut ? parseFloat(vatSettingPut.setting_value) : 0.10

    // Calculate totals
    let totalAmount = 0
    let vatAmount = 0

    for (const item of orderData.items) {
      const pricingMethod = item.item_id ? (putPricingMethodMap.get(item.item_id) || 'FIXED') : 'FIXED'
      const w = item.width_mm || item.width || 0
      const h = item.height_mm || item.height || 0
      let putItemAmt: number
      if (pricingMethod === 'AREA' && w > 0 && h > 0) {
        const wR = Math.ceil(w / 10) * 10
        const hR = Math.ceil(h / 10) * 10
        putItemAmt = (item.unit_price || 0) * (wR / 100) * (hR / 100) * (item.quantity || 1)
      } else {
        putItemAmt = (item.unit_price || 0) * (item.quantity || 1)
      }
      putItemAmt = Math.round(putItemAmt / 100) * 100
      totalAmount += putItemAmt
      if (item.vat_included) {
        vatAmount += putItemAmt * vatRatePut
      }
    }

    const finalAmount = totalAmount + vatAmount - (orderData.discount_amount || 0)

    // Update order
    await c.env.DB.prepare(`
      UPDATE orders SET
        client_id = ?,
        delivery_date = ?,
        reception_location = ?,
        delivery_info = ?,
        total_amount = ?,
        vat_amount = ?,
        discount_amount = ?,
        final_amount = ?,
        notes = ?,
        internal_notes = ?,
        priority = ?,
        delivery_method = ?,
        delivery_time = ?,
        contact_phone = ?,
        contact_mobile = ?,
        shipping_payment = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      orderData.client_id,
      orderData.delivery_date || null,
      orderData.reception_location || null,
      orderData.delivery_info || null,
      totalAmount,
      vatAmount,
      orderData.discount_amount || 0,
      finalAmount,
      orderData.notes || null,
      orderData.internal_notes || null,
      orderData.priority || 'NORMAL',
      orderData.delivery_method || '배송',
      orderData.delivery_time || null,
      orderData.contact_phone || null,
      orderData.contact_mobile || null,
      orderData.shipping_payment || null,
      id
    ).run()

    // BILLED 주문만 balance 반영 (회계반영 전 주문은 balance에 미반영)
    if (existingOrder.billing_status === 'BILLED') {
      const oldClientId = existingOrder.client_id
      const oldFinalAmount = existingOrder.final_amount || 0
      const newClientId = orderData.client_id

      if (oldClientId === newClientId) {
        const diff = finalAmount - oldFinalAmount
        if (diff !== 0) {
          await c.env.DB.prepare(`
            UPDATE clients
            SET balance = balance + ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).bind(diff, newClientId).run()
        }
      } else {
        if (oldFinalAmount !== 0) {
          await c.env.DB.prepare(`
            UPDATE clients
            SET balance = balance - ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).bind(oldFinalAmount, oldClientId).run()
        }
        if (finalAmount !== 0) {
          await c.env.DB.prepare(`
            UPDATE clients
            SET balance = balance + ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).bind(finalAmount, newClientId).run()
        }
      }

      // billed_amount도 동기화
      if (finalAmount !== oldFinalAmount) {
        await c.env.DB.prepare(
          'UPDATE orders SET billed_amount = ? WHERE id = ?'
        ).bind(finalAmount, id).run()
      }
    }

    // ── 카드 보존 판단을 order_items 삭제 전에 수행 ──
    // CONFIRMED 상태에서만 카드 삭제+재생성
    // 단, 카드가 생산에 진입했으면 보존
    let canRegenerateCards = existingOrder.status === 'CONFIRMED'
    if (canRegenerateCards && existingOrder.status === 'CONFIRMED') {
      const activeCards = await c.env.DB.prepare(`
        SELECT COUNT(*) as cnt FROM cards
        WHERE order_id = ? AND (
          status IN ('PRINT_DONE', 'HOLD')
          OR rip_status IN ('QUEUED', 'SENT')
          OR id IN (SELECT DISTINCT card_id FROM print_events WHERE card_id IS NOT NULL)
        )
      `).bind(id).first<{ cnt: number }>()
      if (activeCards && activeCards.cnt > 0) {
        canRegenerateCards = false
      }
    }

    let cardsPreserved = false

    if (!canRegenerateCards) {
      // 생산 중 카드 보존 — order_item_id FK를 NULL로 해제하여 CASCADE 삭제 방지
      await c.env.DB.prepare(`
        UPDATE cards SET order_item_id = NULL WHERE order_id = ?
      `).bind(id).run()
      // 카드 메타데이터 동기화 (재생성 없이도 납기/우선순위/비고 반영)
      await c.env.DB.prepare(`
        UPDATE cards SET
          delivery_date = ?,
          priority = ?,
          notes = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE order_id = ?
      `).bind(
        orderData.delivery_date || null,
        orderData.priority === 'URGENT' ? 1 : 0,
        orderData.notes || null,
        id
      ).run()
      cardsPreserved = true
    } else {
      // 카드를 재생성할 것이므로 먼저 카드 삭제 (order_items CASCADE보다 먼저)
      await c.env.DB.prepare(`
        DELETE FROM cards WHERE order_id = ?
      `).bind(id).run()
    }

    // 이제 안전하게 order_items 삭제 (카드는 이미 보존/삭제 처리됨)
    await c.env.DB.prepare(`
      DELETE FROM order_items WHERE order_id = ?
    `).bind(id).run()

    // Insert updated order items — two-pass for parent_item_id support
    // Pass 1: parent/regular rows (no parent_client_id) → collect DB IDs
    const putClientIdMap = new Map<string, number>()

    for (let i = 0; i < orderData.items.length; i++) {
      const item = orderData.items[i]
      if (item.parent_client_id) continue  // 자식 행은 2단계에서 처리

      const putItemPricingMethod = item.item_id ? (putPricingMethodMap.get(item.item_id) || 'FIXED') : 'FIXED'
      const putItemW = item.width_mm || item.width || 0
      const putItemH = item.height_mm || item.height || 0
      let itemAmount: number
      if (putItemPricingMethod === 'AREA' && putItemW > 0 && putItemH > 0) {
        const piWR = Math.ceil(putItemW / 10) * 10
        const piHR = Math.ceil(putItemH / 10) * 10
        itemAmount = (item.unit_price || 0) * (piWR / 100) * (piHR / 100) * (item.quantity || 1)
      } else {
        itemAmount = (item.unit_price || 0) * (item.quantity || 1)
      }
      itemAmount = Math.round(itemAmount / 100) * 100
      let itemName = item.item_name || null
      let categoryName = item.category_name || null
      let unit = item.unit || 'EA'

      if (item.item_id && !itemName) {
        const itemDetail = await c.env.DB.prepare(`
          SELECT item_name, category, unit FROM items WHERE id = ?
        `).bind(item.item_id).first<{ item_name: string; category: string; unit: string }>()

        if (itemDetail) {
          itemName = itemDetail.item_name
          categoryName = itemDetail.category
          unit = itemDetail.unit
        }
      }

      const putInsertResult = await c.env.DB.prepare(`
        INSERT INTO order_items (
          order_id, item_id, item_name, category_name,
          width, height, quantity, unit,
          unit_price, amount, vat_included,
          post_processing, content, sort_order,
          ai_group_index, scale_factor, ai_analysis_id, parent_item_id, finishing
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
      `).bind(
        id,
        item.item_id || null,
        itemName || 'Unknown',
        categoryName || null,
        item.width_mm || item.width || null,
        item.height_mm || item.height || null,
        item.quantity || 1,
        unit,
        item.unit_price || 0,
        itemAmount,
        item.vat_included !== undefined ? (item.vat_included ? 1 : 0) : 1,
        item.post_processing || item.paper || null,
        item.content || item.print || null,
        i,
        item.ai_group_index !== undefined ? item.ai_group_index : null,
        item.scale_factor || 1,
        item.ai_analysis_id || null,
        item.finishing || null
      ).run()

      if (item.client_group_id) {
        putClientIdMap.set(item.client_group_id, putInsertResult.meta.last_row_id as number)
      }
    }

    // Pass 2: child rows (has parent_client_id) → resolve parent DB ID
    const putParentOnlyCount = orderData.items.filter((i: any) => !i.parent_client_id).length
    for (let i = 0; i < orderData.items.length; i++) {
      const item = orderData.items[i]
      if (!item.parent_client_id) continue

      const parentDbId = putClientIdMap.get(item.parent_client_id) ?? null

      await c.env.DB.prepare(`
        INSERT INTO order_items (
          order_id, item_id, item_name, category_name,
          width, height, quantity, unit,
          unit_price, amount, vat_included,
          post_processing, content, sort_order,
          ai_group_index, scale_factor, ai_analysis_id, parent_item_id
        ) VALUES (?, NULL, ?, NULL, ?, ?, ?, ?, 0, 0, 1, NULL, ?, ?, ?, ?, ?, ?)
      `).bind(
        id,
        item.item_name || '',
        item.width_mm || item.width || null,
        item.height_mm || item.height || null,
        item.quantity || 1,
        item.unit || 'EA',
        item.content || null,
        putParentOnlyCount + i,
        item.ai_group_index !== undefined ? item.ai_group_index : null,
        item.scale_factor || 1,
        item.ai_analysis_id || null,
        parentDbId
      ).run()
    }

    // 카드 보존/삭제 로직은 order_items 삭제 전에 이미 처리됨
    let cardsGenerated = 0

    if (canRegenerateCards) {
      cardsGenerated = await generateCardsForOrder({
        db: c.env.DB,
        orderId: parseInt(id),
        orderNumber: existingOrder.order_number,
        clientId: orderData.client_id,
        deliveryDate: orderData.delivery_date || null,
        priority: orderData.priority || 'NORMAL',
        notes: orderData.notes || null,
        entityId: getEntityId(c)
      })
    } // end if (canRegenerateCards)

    // 주문 수정 시 원가 자동 재계산 (CONFIRMED 이상 상태에서)
    const costStatuses = ['CONFIRMED', 'PRINTING', 'PRINT_DONE', 'SHIPPED']
    if (costStatuses.includes(existingOrder.status)) {
      try {
        await recalculateOrderCosts(c.env.DB, parseInt(id))
      } catch (costErr) {
        console.error('Cost recalculation on update failed (non-blocking):', costErr)
      }
    }

    return c.json({
      success: true,
      message: `Order updated successfully. ${cardsGenerated} card(s) regenerated.`,
      ...(cardsPreserved && {
        cards_preserved: true,
        card_warning: '생산 중인 카드가 보존되었습니다. 카드 변경이 필요하면 주문을 임시저장 상태로 되돌려주세요.'
      })
    })
  } catch (error) {
    console.error('Order update error:', error)
    console.error('src/routes/orders.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ============================================================================
// PATCH /:id/cancel - 주문 취소 (별도 버튼, 이유 필수)
// ============================================================================
ordersCoreRouter.patch('/:id/cancel', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')
    const user = c.get('user')
    const { reason, reason_detail } = await c.req.json<{ reason: string; reason_detail?: string }>()

    if (!reason) {
      return c.json({ success: false, error: '취소 이유를 선택해주세요.' }, 400)
    }

    const order = await c.env.DB.prepare(
      'SELECT id, status, order_number, client_id, billing_status, billed_amount, final_amount FROM orders WHERE id = ?'
    ).bind(id).first<{ id: number; status: string; order_number: string; client_id: number; billing_status: string | null; billed_amount: number | null; final_amount: number }>()
    if (!order) return c.json({ success: false, error: '주문을 찾을 수 없습니다.' }, 404)

    if (order.status === 'CANCELLED') {
      return c.json({ success: false, error: '이미 취소된 주문입니다.' }, 400)
    }
    if (order.status === 'SHIPPED') {
      return c.json({ success: false, error: '출고완료 주문은 취소할 수 없습니다.' }, 400)
    }

    // #55: 부분 출고 체크 — 출고된 카드가 1장이라도 있으면 취소 거부
    const shippedCardCheck = await c.env.DB.prepare(`
      SELECT COUNT(*) as cnt FROM cards WHERE order_id = ? AND shipped_at IS NOT NULL
    `).bind(id).first<{ cnt: number }>()
    if (shippedCardCheck && shippedCardCheck.cnt > 0) {
      return c.json({
        success: false,
        error: `출고된 카드가 ${shippedCardCheck.cnt}건 있어 취소할 수 없습니다. 먼저 출고를 취소해주세요.`
      }, 400)
    }

    const cancelText = reason_detail ? `${reason}: ${reason_detail}` : reason

    // 주문 취소
    await c.env.DB.prepare(`
      UPDATE orders SET status = 'CANCELLED', cancel_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(cancelText, id).run()

    // #55: 미출고 카드만 HOLD 처리 (출고 완료 카드는 건드리지 않음)
    // 향후 세금계산서 취소/수정발행 기능 추가 시에도 카드 상태를 확인해야 함:
    //   - hold_reason LIKE '주문 취소%'인 HOLD 카드는 주문 취소로 인한 보류
    //   - 세금계산서 취소 시 관련 주문의 카드 상태 재검토 필요
    const { results: cardsToHold } = await c.env.DB.prepare(`
      SELECT id, status FROM cards WHERE order_id = ? AND status NOT IN ('HOLD') AND shipped_at IS NULL
    `).bind(id).all<{ id: number; status: string }>()

    if (cardsToHold && cardsToHold.length > 0) {
      const holdStmts: D1PreparedStatement[] = []
      for (const card of cardsToHold) {
        holdStmts.push(
          c.env.DB.prepare(`
            UPDATE cards SET status = 'HOLD', hold_reason = ?, hold_at = CURRENT_TIMESTAMP, hold_by = ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).bind('주문 취소: ' + cancelText, user?.id || null, card.id)
        )
        holdStmts.push(
          c.env.DB.prepare(`
            INSERT INTO card_status_history (card_id, from_status, to_status, changed_by, change_reason)
            VALUES (?, ?, 'HOLD', ?, ?)
          `).bind(card.id, card.status, user?.id || null, '주문 취소: ' + cancelText)
        )
      }
      for (let i = 0; i < holdStmts.length; i += 80) {
        const chunk = holdStmts.slice(i, i + 80)
        if (chunk.length > 0) await c.env.DB.batch(chunk)
      }
    }

    // BILLED 상태면 balance 롤백
    if (order.billing_status === 'BILLED' && order.final_amount && order.final_amount !== 0) {
      await c.env.DB.prepare(`
        UPDATE clients SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).bind(order.billed_amount || order.final_amount, order.client_id).run()
    }

    // 이력 기록
    await c.env.DB.prepare(`
      INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, change_reason)
      VALUES (?, ?, 'CANCELLED', ?, ?)
    `).bind(id, order.status, user?.id || null, cancelText).run()

    await logActivity({
      db: c.env.DB, userId: user?.id, userName: user?.username,
      action: 'ORDER_CANCEL', entityType: 'ORDER', entityId: parseInt(id),
      entityLabel: order.order_number, details: cancelText
    })

    return c.json({ success: true, message: `주문 ${order.order_number}이(가) 취소되었습니다.` })
  } catch (error) {
    console.error('Order cancel error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// PATCH /:id/restore - 취소된 주문 복구 (→ CONFIRMED)
// ============================================================================
ordersCoreRouter.patch('/:id/restore', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')
    const user = c.get('user')

    const order = await c.env.DB.prepare(
      'SELECT id, status, order_number FROM orders WHERE id = ?'
    ).bind(id).first<{ id: number; status: string; order_number: string }>()
    if (!order) return c.json({ success: false, error: '주문을 찾을 수 없습니다.' }, 404)

    if (order.status !== 'CANCELLED') {
      return c.json({ success: false, error: '취소 상태의 주문만 복구할 수 있습니다.' }, 400)
    }

    await c.env.DB.prepare(`
      UPDATE orders SET status = 'CONFIRMED', cancel_reason = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(id).run()

    // 카드 복원: HOLD → PRINTING (주문 취소/삭제로 HOLD된 카드)
    await c.env.DB.prepare(`
      UPDATE cards SET status = 'PRINTING', hold_reason = NULL, hold_at = NULL, hold_by = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE order_id = ? AND status = 'HOLD'
        AND (hold_reason LIKE '주문 취소%' OR hold_reason LIKE '주문 삭제%')
    `).bind(id).run()

    await c.env.DB.prepare(`
      INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, change_reason)
      VALUES (?, 'CANCELLED', 'CONFIRMED', ?, '주문 복구')
    `).bind(id, user?.id || null).run()

    await logActivity({
      db: c.env.DB, userId: user?.id, userName: user?.username,
      action: 'ORDER_RESTORE', entityType: 'ORDER', entityId: parseInt(id),
      entityLabel: order.order_number, details: '취소 주문 복구 → CONFIRMED'
    })

    return c.json({ success: true, message: `주문 ${order.order_number}이(가) 복구되었습니다.` })
  } catch (error) {
    console.error('Order restore error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// POST /sync-statuses - 상태 동기화 (출고완료 지연 전이 + 회계반영 자동 전이)
// ============================================================================
ordersCoreRouter.post('/sync-statuses', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const db = c.env.DB
    const user = c.get('user')

    // Step 1: 출고완료 자동 전이 — auto_complete_date 도래 + 모든 카드 출고완료
    const ef = entityFilter(c, 'o')
    const { results: toShip } = await db.prepare(`
      SELECT o.id, o.delivery_method FROM orders o
      WHERE o.status = 'PRINT_DONE'
        AND o.auto_complete_date IS NOT NULL
        AND o.auto_complete_date <= date('now')
        AND NOT EXISTS (SELECT 1 FROM cards c WHERE c.order_id = o.id AND c.shipped_at IS NULL)
        ${ef.clause}
    `).bind(...ef.params).all()

    for (const order of toShip) {
      const method = ((order.delivery_method as string) || '').trim()
      const isQuick = method === '방문수령' || method === '직접수령' || method === '직접배송' || method === '퀵'
      const billableDays = isQuick ? 1 : 2

      await db.prepare(`
        UPDATE orders SET status = 'SHIPPED', updated_at = CURRENT_TIMESTAMP,
          billable_after = date('now', '+' || ? || ' days')
        WHERE id = ? AND status = 'PRINT_DONE'
      `).bind(billableDays, order.id).run()

      await db.prepare(`
        INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, change_reason)
        VALUES (?, 'PRINT_DONE', 'SHIPPED', ?, '동기화: 출고완료 자동 전이')
      `).bind(order.id, user?.id || null).run()
    }

    // Step 2: 회계반영 자동 전이 — auto_billing=1 거래처 + billable_after 도래
    const { results: toBill } = await db.prepare(`
      SELECT o.id, o.client_id FROM orders o
      JOIN clients c ON o.client_id = c.id
      WHERE o.status = 'SHIPPED'
        AND o.billing_status IS NULL
        AND o.billable_after IS NOT NULL
        AND o.billable_after <= date('now')
        AND o.final_amount > 0
        AND c.auto_billing = 1
        ${ef.clause}
    `).bind(...ef.params).all()

    for (const order of toBill) {
      await db.prepare(`
        UPDATE orders SET billing_status = 'BILLED', billed_at = CURRENT_TIMESTAMP,
          billed_by = ?, billed_amount = final_amount, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND billing_status IS NULL
      `).bind(user?.id || null, order.id).run()

      // balance 반영
      await db.prepare(`
        UPDATE clients SET balance = balance + (SELECT final_amount FROM orders WHERE id = ?),
          updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).bind(order.id, order.client_id).run()
    }

    // Step 3: CARD/ISSUED_BY_OTHER 거래처 — 발행 불필요, 자동 BILLED
    const { results: noInvoice } = await db.prepare(`
      SELECT o.id, o.client_id FROM orders o
      JOIN clients c ON o.client_id = c.id
      WHERE o.status = 'SHIPPED'
        AND o.billing_status IS NULL
        AND o.billable_after IS NOT NULL
        AND o.billable_after <= date('now')
        AND o.final_amount > 0
        AND c.invoice_method IN ('CARD', 'ISSUED_BY_OTHER')
        ${ef.clause}
    `).bind(...ef.params).all()

    for (const order of noInvoice) {
      await db.prepare(`
        UPDATE orders SET billing_status = 'BILLED', billed_at = CURRENT_TIMESTAMP,
          billed_by = ?, billed_amount = final_amount, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND billing_status IS NULL
      `).bind(user?.id || null, order.id).run()

      await db.prepare(`
        UPDATE clients SET balance = balance + (SELECT final_amount FROM orders WHERE id = ?),
          updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).bind(order.id, order.client_id).run()
    }

    const billedCount = toBill.length + noInvoice.length

    await logActivity({
      db,
      action: 'SYNC_STATUSES',
      entityType: 'ORDER',
      userId: user?.id,
      details: `상태 동기화 실행: 출고완료 ${toShip.length}건, 회계반영 ${billedCount}건`
    })

    return c.json({
      success: true,
      data: {
        shipped: toShip.length,
        billed: billedCount,
        shipped_ids: toShip.map((o) => o.id)
      }
    })
  } catch (error) {
    console.error('sync-statuses error:', error)
    return c.json({ success: false, error: '동기화 처리 중 오류가 발생했습니다.' }, 500)
  }
})

export default ordersCoreRouter
