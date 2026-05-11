/**
 * quotations.ts — 견적서 라우터 (Phase 3.2)
 *
 * 견적서는 orders와 별도 테이블 (quotations + quotation_items)에 저장.
 * 1견적서 → N주문 가능 (orders.quotation_id FK).
 * 변환 시 immutable snapshot 복사 (견적서 원본 보존).
 *
 * Endpoints:
 *   GET    /                         리스트 (검색, 필터, 페이지)
 *   GET    /:id                      상세 (items + 연결된 주문 목록 포함)
 *   POST   /                         신규 작성 (quotations + quotation_items)
 *   PUT    /:id                      수정 (ACTIVE 상태일 때만)
 *   DELETE /:id                      취소 (status='CANCELLED' soft delete)
 *   POST   /:id/convert-to-order     주문 생성 (새 orders 레코드 + items 복사)
 *   GET    /:id/orders               이 견적서로 만든 주문 목록
 */
import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { requireAnyPagePermission } from '../middleware/permissions'
import { logActivity } from '../utils/activityLog'
import { getEntityId, entityFilter } from '../utils/entityFilter'

const quotationsRouter = new Hono<HonoEnv>()
quotationsRouter.use('/*', authMiddleware, requireAnyPagePermission('/quotations', '/orders'))

// ===== 헬퍼 =====

// 견적번호 생성: Q-YYYYMMDD-NNN
async function generateQuotationNumber(db: any): Promise<string> {
  const today = new Date()
  const dateStr = today.toISOString().split('T')[0].replace(/-/g, '')
  const prefix = `Q-${dateStr}-`
  const { max_seq } = await db.prepare(`
    SELECT COALESCE(MAX(CAST(SUBSTR(quotation_number, 12) AS INTEGER)), 0) as max_seq
    FROM quotations WHERE quotation_number LIKE ?
  `).bind(`${prefix}%`).first() as any
  return `${prefix}${String((max_seq || 0) + 1).padStart(3, '0')}`
}

// 만료 견적서 자동 마킹 (read-time check)
async function markExpiredIfNeeded(db: any, quotation: any): Promise<any> {
  if (quotation.status === 'ACTIVE' && quotation.valid_until) {
    const today = new Date().toISOString().split('T')[0]
    if (quotation.valid_until < today) {
      await db.prepare(`UPDATE quotations SET status = 'EXPIRED' WHERE id = ?`).bind(quotation.id).run()
      quotation.status = 'EXPIRED'
    }
  }
  return quotation
}

// ===== GET / — 리스트 =====
quotationsRouter.get('/', async (c) => {
  try {
    const {
      page = '1',
      limit = '50',
      status = '',
      search = '',
      sort = 'created_desc',
      client_id = '',
    } = c.req.query()
    const safeLimit = Math.min(parseInt(limit) || 50, 200)
    const offset = (parseInt(page) - 1) * safeLimit

    let query = `
      SELECT q.*, c.client_name, u.name as created_by_name,
        (SELECT COUNT(*) FROM orders o WHERE o.quotation_id = q.id) as actual_order_count
      FROM quotations q
      LEFT JOIN clients c ON q.client_id = c.id
      LEFT JOIN users u ON q.created_by = u.id
      WHERE 1=1
    `
    const params: any[] = []

    if (status) {
      query += ' AND q.status = ?'
      params.push(status)
    }
    if (client_id) {
      query += ' AND q.client_id = ?'
      params.push(parseInt(client_id))
    }
    if (search) {
      query += ' AND (q.quotation_number LIKE ? OR c.client_name LIKE ?)'
      const pat = `%${search}%`
      params.push(pat, pat)
    }

    const ef = entityFilter(c, 'q')
    query += ef.clause
    params.push(...ef.params)

    const sortOptions: Record<string, string> = {
      'created_desc': 'q.created_at DESC',
      'created_asc': 'q.created_at ASC',
      'valid_asc': 'q.valid_until ASC',
      'amount_desc': 'q.final_amount DESC',
    }
    const orderBy = sortOptions[sort] || sortOptions['created_desc']
    query += ` ORDER BY ${orderBy} LIMIT ? OFFSET ?`
    params.push(safeLimit, offset)

    const { results } = await c.env.DB.prepare(query).bind(...params).all() as any

    // 만료 자동 마킹 (백그라운드)
    const today = new Date().toISOString().split('T')[0]
    const toExpire = (results as any[]).filter(q => q.status === 'ACTIVE' && q.valid_until && q.valid_until < today).map(q => q.id)
    if (toExpire.length > 0) {
      const ph = toExpire.map(() => '?').join(',')
      await c.env.DB.prepare(`UPDATE quotations SET status='EXPIRED' WHERE id IN (${ph})`).bind(...toExpire).run().catch(() => {})
      for (const q of results as any[]) {
        if (toExpire.includes(q.id)) q.status = 'EXPIRED'
      }
    }

    // 카운트
    let countQuery = `SELECT COUNT(*) as count FROM quotations q LEFT JOIN clients c ON q.client_id = c.id WHERE 1=1`
    const countParams: any[] = []
    if (status) { countQuery += ' AND q.status = ?'; countParams.push(status) }
    if (client_id) { countQuery += ' AND q.client_id = ?'; countParams.push(parseInt(client_id)) }
    if (search) {
      countQuery += ' AND (q.quotation_number LIKE ? OR c.client_name LIKE ?)'
      const pat = `%${search}%`
      countParams.push(pat, pat)
    }
    const efCount = entityFilter(c, 'q')
    countQuery += efCount.clause
    countParams.push(...efCount.params)
    const { count } = await c.env.DB.prepare(countQuery).bind(...countParams).first() as any

    return c.json({
      success: true,
      data: results,
      pagination: {
        page: parseInt(page),
        limit: safeLimit,
        total: count,
        total_pages: Math.ceil(count / safeLimit)
      }
    })
  } catch (error) {
    console.error('quotations.list error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ===== GET /:id — 상세 =====
quotationsRouter.get('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const quotation = await c.env.DB.prepare(`
      SELECT q.*, c.client_name, c.business_registration_number, c.address,
        u.name as created_by_name
      FROM quotations q
      LEFT JOIN clients c ON q.client_id = c.id
      LEFT JOIN users u ON q.created_by = u.id
      WHERE q.id = ?
    `).bind(id).first() as any

    if (!quotation) {
      return c.json({ success: false, error: '견적서를 찾을 수 없습니다.' }, 404)
    }

    await markExpiredIfNeeded(c.env.DB, quotation)

    const { results: items } = await c.env.DB.prepare(`
      SELECT * FROM quotation_items WHERE quotation_id = ? ORDER BY sort_order ASC, id ASC
    `).bind(id).all()

    const { results: convertedOrders } = await c.env.DB.prepare(`
      SELECT id, order_number, status, final_amount, created_at
      FROM orders WHERE quotation_id = ? ORDER BY created_at DESC
    `).bind(id).all()

    return c.json({
      success: true,
      data: { ...quotation, items, converted_orders: convertedOrders }
    })
  } catch (error) {
    console.error('quotations.detail error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ===== POST / — 신규 작성 =====
quotationsRouter.post('/', async (c) => {
  try {
    const user = c.get('user') as any
    const body = await c.req.json()

    if (!body.client_id) {
      return c.json({ success: false, error: 'client_id 필수' }, 400)
    }
    if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
      return c.json({ success: false, error: '품목이 비어있습니다.' }, 400)
    }

    const quotationNumber = await generateQuotationNumber(c.env.DB)
    const today = new Date()

    // VAT rate
    const vatSetting = await c.env.DB.prepare(
      `SELECT setting_value FROM settings WHERE setting_key = 'vat_rate'`
    ).first<{ setting_value: string }>()
    const vatRate = vatSetting ? parseFloat(vatSetting.setting_value) : 0.10

    // 금액 계산
    let totalAmount = 0
    let vatAmount = 0
    for (const item of body.items) {
      const w = item.width_mm || item.width || 0
      const h = item.height_mm || item.height || 0
      const pricingMethod = item.pricing_method || 'FIXED'
      let itemAmount: number
      if (pricingMethod === 'AREA' && w > 0 && h > 0) {
        const wRound = Math.ceil(w / 10) * 10
        const hRound = Math.ceil(h / 10) * 10
        itemAmount = (item.unit_price || 0) * (wRound / 100) * (hRound / 100) * (item.quantity || 1)
      } else {
        itemAmount = (item.unit_price || 0) * (item.quantity || 1)
      }
      itemAmount = Math.round(itemAmount / 100) * 100
      totalAmount += itemAmount
      if (item.vat_included !== false) {
        vatAmount += itemAmount * vatRate
      }
    }
    const finalAmount = totalAmount + vatAmount - (body.discount_amount || 0)

    // valid_until 기본 30일
    let validUntil = body.valid_until
    if (!validUntil) {
      const d = new Date(today)
      d.setDate(d.getDate() + 30)
      validUntil = d.toISOString().split('T')[0]
    }

    const result = await c.env.DB.prepare(`
      INSERT INTO quotations (
        quotation_number, client_id, entity_id, status,
        quotation_date, delivery_date, valid_until,
        total_amount, vat_amount, discount_amount, final_amount,
        delivery_method, delivery_time, delivery_info,
        contact_phone, contact_mobile, shipping_payment,
        notes, internal_notes, created_by
      ) VALUES (?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      quotationNumber,
      body.client_id,
      getEntityId(c) || 1,
      body.quotation_date || today.toISOString().split('T')[0],
      body.delivery_date || null,
      validUntil,
      totalAmount, vatAmount, body.discount_amount || 0, finalAmount,
      body.delivery_method || '배송',
      body.delivery_time || null,
      body.delivery_info || null,
      body.contact_phone || null,
      body.contact_mobile || null,
      body.shipping_payment || null,
      body.notes || null,
      body.internal_notes || null,
      user?.id || 1
    ).run()

    const quotationId = result.meta.last_row_id as number

    // 품목 삽입 (부모/자식 2-pass)
    const clientIdMap = new Map<string, number>()
    for (let i = 0; i < body.items.length; i++) {
      const item = body.items[i]
      if (item.parent_client_id) continue

      const w = item.width_mm || item.width || 0
      const h = item.height_mm || item.height || 0
      const pricingMethod = item.pricing_method || 'FIXED'
      let amount: number
      if (pricingMethod === 'AREA' && w > 0 && h > 0) {
        amount = (item.unit_price || 0) * (Math.ceil(w / 10) * 10 / 100) * (Math.ceil(h / 10) * 10 / 100) * (item.quantity || 1)
      } else {
        amount = (item.unit_price || 0) * (item.quantity || 1)
      }
      amount = Math.round(amount / 100) * 100

      const ins = await c.env.DB.prepare(`
        INSERT INTO quotation_items (
          quotation_id, item_id, item_name, width, height, scale_factor,
          quantity, unit, unit_price, amount, content, post_processing,
          finishing, pricing_method, sort_order, ai_group_index,
          media_subcategory_name, print_method_id, print_method_name,
          print_media_id, print_media_name
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        quotationId, item.item_id || null, item.item_name || 'Unknown',
        w, h, item.scale_factor || 1,
        item.quantity || 1, item.unit || 'EA',
        item.unit_price || 0, amount,
        item.content || null, item.post_processing || null,
        item.finishing || null, pricingMethod, i,
        item.ai_group_index != null ? item.ai_group_index : null,
        item.media_subcategory_name || null,
        item.print_method_id || null, item.print_method_name || null,
        item.print_media_id || null, item.print_media_name || null
      ).run()

      if (item.client_group_id) {
        clientIdMap.set(item.client_group_id, ins.meta.last_row_id as number)
      }
    }
    const parentCount = body.items.filter((i: any) => !i.parent_client_id).length
    for (let i = 0; i < body.items.length; i++) {
      const item = body.items[i]
      if (!item.parent_client_id) continue
      const parentDbId = clientIdMap.get(item.parent_client_id) ?? null
      const w = item.width_mm || item.width || 0
      const h = item.height_mm || item.height || 0
      await c.env.DB.prepare(`
        INSERT INTO quotation_items (
          quotation_id, item_name, width, height, scale_factor,
          quantity, unit, unit_price, amount, content,
          parent_id, sort_order, ai_group_index
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?)
      `).bind(
        quotationId, item.item_name || '',
        w, h, item.scale_factor || 1,
        item.quantity || 1, item.unit || 'EA',
        item.content || null, parentDbId,
        parentCount + i,
        item.ai_group_index != null ? item.ai_group_index : null
      ).run()
    }

    await logActivity({
      db: c.env.DB, userId: user?.id, userName: user?.username,
      action: 'CREATE', entityType: 'QUOTATION',
      entityId: quotationId, entityLabel: quotationNumber
    })

    return c.json({
      success: true,
      data: { id: quotationId, quotation_number: quotationNumber }
    })
  } catch (error) {
    console.error('quotations.create error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ===== PUT /:id — 수정 (ACTIVE 상태만) =====
quotationsRouter.put('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const user = c.get('user') as any
    const body = await c.req.json()

    const existing = await c.env.DB.prepare(
      `SELECT id, status FROM quotations WHERE id = ?`
    ).bind(id).first() as any
    if (!existing) return c.json({ success: false, error: '견적서를 찾을 수 없습니다.' }, 404)
    if (existing.status !== 'ACTIVE') {
      return c.json({ success: false, error: `현재 상태(${existing.status})에서는 수정할 수 없습니다.` }, 400)
    }

    // 금액 재계산
    const vatSetting = await c.env.DB.prepare(
      `SELECT setting_value FROM settings WHERE setting_key = 'vat_rate'`
    ).first<{ setting_value: string }>()
    const vatRate = vatSetting ? parseFloat(vatSetting.setting_value) : 0.10

    let totalAmount = 0
    let vatAmount = 0
    for (const item of body.items || []) {
      const w = item.width_mm || item.width || 0
      const h = item.height_mm || item.height || 0
      const pricingMethod = item.pricing_method || 'FIXED'
      let amt: number
      if (pricingMethod === 'AREA' && w > 0 && h > 0) {
        amt = (item.unit_price || 0) * (Math.ceil(w / 10) * 10 / 100) * (Math.ceil(h / 10) * 10 / 100) * (item.quantity || 1)
      } else {
        amt = (item.unit_price || 0) * (item.quantity || 1)
      }
      amt = Math.round(amt / 100) * 100
      totalAmount += amt
      if (item.vat_included !== false) vatAmount += amt * vatRate
    }
    const finalAmount = totalAmount + vatAmount - (body.discount_amount || 0)

    await c.env.DB.prepare(`
      UPDATE quotations SET
        client_id = ?, delivery_date = ?, valid_until = ?,
        total_amount = ?, vat_amount = ?, discount_amount = ?, final_amount = ?,
        delivery_method = ?, delivery_time = ?, delivery_info = ?,
        contact_phone = ?, contact_mobile = ?, shipping_payment = ?,
        notes = ?, internal_notes = ?,
        updated_by = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      body.client_id || existing.client_id,
      body.delivery_date || null, body.valid_until || null,
      totalAmount, vatAmount, body.discount_amount || 0, finalAmount,
      body.delivery_method || '배송',
      body.delivery_time || null, body.delivery_info || null,
      body.contact_phone || null, body.contact_mobile || null, body.shipping_payment || null,
      body.notes || null, body.internal_notes || null,
      user?.id || null, id
    ).run()

    // items 재작성: 기존 삭제 후 신규 삽입 (단순화)
    await c.env.DB.prepare(`DELETE FROM quotation_items WHERE quotation_id = ?`).bind(id).run()

    const clientIdMap = new Map<string, number>()
    for (let i = 0; i < (body.items || []).length; i++) {
      const item = body.items[i]
      if (item.parent_client_id) continue
      const w = item.width_mm || item.width || 0
      const h = item.height_mm || item.height || 0
      const pricingMethod = item.pricing_method || 'FIXED'
      let amount: number
      if (pricingMethod === 'AREA' && w > 0 && h > 0) {
        amount = (item.unit_price || 0) * (Math.ceil(w / 10) * 10 / 100) * (Math.ceil(h / 10) * 10 / 100) * (item.quantity || 1)
      } else {
        amount = (item.unit_price || 0) * (item.quantity || 1)
      }
      amount = Math.round(amount / 100) * 100

      const ins = await c.env.DB.prepare(`
        INSERT INTO quotation_items (
          quotation_id, item_id, item_name, width, height, scale_factor,
          quantity, unit, unit_price, amount, content, post_processing,
          finishing, pricing_method, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        parseInt(id), item.item_id || null, item.item_name || 'Unknown',
        w, h, item.scale_factor || 1,
        item.quantity || 1, item.unit || 'EA',
        item.unit_price || 0, amount,
        item.content || null, item.post_processing || null,
        item.finishing || null, pricingMethod, i
      ).run()
      if (item.client_group_id) clientIdMap.set(item.client_group_id, ins.meta.last_row_id as number)
    }
    const parentCount = (body.items || []).filter((i: any) => !i.parent_client_id).length
    for (let i = 0; i < (body.items || []).length; i++) {
      const item = body.items[i]
      if (!item.parent_client_id) continue
      const parentDbId = clientIdMap.get(item.parent_client_id) ?? null
      await c.env.DB.prepare(`
        INSERT INTO quotation_items (
          quotation_id, item_name, width, height, scale_factor,
          quantity, unit, unit_price, amount, content,
          parent_id, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?)
      `).bind(
        parseInt(id), item.item_name || '',
        item.width_mm || item.width || 0, item.height_mm || item.height || 0,
        item.scale_factor || 1, item.quantity || 1, item.unit || 'EA',
        item.content || null, parentDbId, parentCount + i
      ).run()
    }

    await logActivity({
      db: c.env.DB, userId: user?.id, userName: user?.username,
      action: 'UPDATE', entityType: 'QUOTATION',
      entityId: parseInt(id), entityLabel: String(id)
    })

    return c.json({ success: true, data: { id: parseInt(id) } })
  } catch (error) {
    console.error('quotations.update error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ===== DELETE /:id — 취소 (soft delete) =====
quotationsRouter.delete('/:id', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')
    const user = c.get('user') as any
    const quotation = await c.env.DB.prepare(
      `SELECT id, quotation_number, status FROM quotations WHERE id = ?`
    ).bind(id).first() as any
    if (!quotation) return c.json({ success: false, error: '견적서를 찾을 수 없습니다.' }, 404)

    await c.env.DB.prepare(
      `UPDATE quotations SET status = 'CANCELLED', updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(user?.id || null, id).run()

    await logActivity({
      db: c.env.DB, userId: user?.id, userName: user?.username,
      action: 'CANCEL', entityType: 'QUOTATION',
      entityId: parseInt(id), entityLabel: quotation.quotation_number
    })

    return c.json({ success: true, message: '견적서 취소 완료' })
  } catch (error) {
    console.error('quotations.cancel error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ===== POST /:id/convert-to-order — 견적서 → 주문 (immutable snapshot 복사) =====
quotationsRouter.post('/:id/convert-to-order', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')
    const user = c.get('user') as any
    const body = await c.req.json().catch(() => ({}))
    const force = body.force === true

    const quotation = await markExpiredIfNeeded(
      c.env.DB,
      await c.env.DB.prepare(`SELECT * FROM quotations WHERE id = ?`).bind(id).first() as any
    )
    if (!quotation) return c.json({ success: false, error: '견적서를 찾을 수 없습니다.' }, 404)
    if (quotation.status === 'CANCELLED') {
      return c.json({ success: false, error: '취소된 견적서는 주문으로 전환할 수 없습니다.' }, 400)
    }
    if (quotation.status === 'EXPIRED' && !force) {
      return c.json({
        success: false,
        error: `견적 유효기한이 만료되었습니다 (${quotation.valid_until}). force=true 로 강제 전환하세요.`,
        meta: { expired: true, valid_until: quotation.valid_until }
      }, 400)
    }

    const { results: qItems } = await c.env.DB.prepare(
      `SELECT * FROM quotation_items WHERE quotation_id = ? ORDER BY sort_order, id`
    ).bind(id).all() as any
    if (!qItems || qItems.length === 0) {
      return c.json({ success: false, error: '견적서에 품목이 없습니다.' }, 400)
    }

    // 주문번호 생성
    const today = new Date()
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '')
    const { max_seq } = await c.env.DB.prepare(`
      SELECT COALESCE(MAX(CAST(SUBSTR(order_number, 10) AS INTEGER)), 0) as max_seq
      FROM orders WHERE order_number LIKE ?
    `).bind(`${dateStr}-%`).first() as any
    const orderNumber = `${dateStr}-${String((max_seq || 0) + 1).padStart(3, '0')}`

    // 주문 생성 — quotation의 모든 필드 snapshot
    const orderResult = await c.env.DB.prepare(`
      INSERT INTO orders (
        order_number, client_id, status, order_year, order_month,
        delivery_info, delivery_date, order_date,
        total_amount, vat_amount, discount_amount, final_amount,
        notes, internal_notes, created_by,
        priority, delivery_method, delivery_time,
        contact_phone, contact_mobile, shipping_payment,
        entity_id, order_type, quotation_id
      ) VALUES (?, ?, 'CONFIRMED', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      orderNumber, quotation.client_id,
      today.getFullYear(), today.getMonth() + 1,
      quotation.delivery_info,
      quotation.delivery_date,
      today.toISOString().split('T')[0],
      quotation.total_amount, quotation.vat_amount,
      quotation.discount_amount, quotation.final_amount,
      quotation.notes, quotation.internal_notes,
      user?.id || 1,
      'NORMAL',
      quotation.delivery_method || '배송',
      quotation.delivery_time,
      quotation.contact_phone, quotation.contact_mobile, quotation.shipping_payment,
      quotation.entity_id || 1, 'PRODUCTION',
      quotation.id
    ).run()

    const orderId = orderResult.meta.last_row_id as number

    // 품목 복사 (parent_id 매핑)
    const qParentToOrderId = new Map<number, number>()
    for (const qi of qItems as any[]) {
      if (qi.parent_id != null) continue
      const ins = await c.env.DB.prepare(`
        INSERT INTO order_items (
          order_id, item_id, item_name, category_name,
          width, height, quantity, unit, unit_price, amount, vat_included,
          post_processing, content, sort_order,
          ai_group_index, scale_factor, parent_item_id, finishing
        ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, NULL, ?)
      `).bind(
        orderId, qi.item_id, qi.item_name,
        qi.width, qi.height, qi.quantity, qi.unit,
        qi.unit_price, qi.amount,
        qi.post_processing, qi.content, qi.sort_order,
        qi.ai_group_index, qi.scale_factor, qi.finishing
      ).run()
      qParentToOrderId.set(qi.id, ins.meta.last_row_id as number)
    }
    for (const qi of qItems as any[]) {
      if (qi.parent_id == null) continue
      const parentOrderItemId = qParentToOrderId.get(qi.parent_id) ?? null
      await c.env.DB.prepare(`
        INSERT INTO order_items (
          order_id, item_name, width, height, quantity, unit,
          unit_price, amount, vat_included, content, sort_order,
          ai_group_index, scale_factor, parent_item_id
        ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 1, ?, ?, ?, ?, ?)
      `).bind(
        orderId, qi.item_name, qi.width, qi.height, qi.quantity, qi.unit,
        qi.content, qi.sort_order, qi.ai_group_index, qi.scale_factor,
        parentOrderItemId
      ).run()
    }

    // 주문 상태 이력
    await c.env.DB.prepare(`
      INSERT INTO order_status_history (order_id, to_status, changed_by, change_reason)
      VALUES (?, 'CONFIRMED', ?, ?)
    `).bind(orderId, user?.id || null,
      force && quotation.status === 'EXPIRED' ? '만료 견적 강제 전환' : `견적서 ${quotation.quotation_number} → 주문`
    ).run()

    // 견적서의 변환 추적 업데이트
    await c.env.DB.prepare(`
      UPDATE quotations
      SET converted_count = converted_count + 1,
          first_converted_at = COALESCE(first_converted_at, CURRENT_TIMESTAMP),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(id).run()

    await logActivity({
      db: c.env.DB, userId: user?.id, userName: user?.username,
      action: 'CONVERT', entityType: 'QUOTATION',
      entityId: parseInt(id), entityLabel: quotation.quotation_number,
      details: JSON.stringify({ created_order_id: orderId, order_number: orderNumber })
    })

    return c.json({
      success: true,
      data: { order_id: orderId, order_number: orderNumber, quotation_id: parseInt(id) },
      message: `견적서 ${quotation.quotation_number} → 주문 ${orderNumber} 생성됨`
    })
  } catch (error) {
    console.error('quotations.convert error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ===== GET /:id/orders — 이 견적서로 만든 주문 목록 =====
quotationsRouter.get('/:id/orders', async (c) => {
  try {
    const id = c.req.param('id')
    const { results } = await c.env.DB.prepare(`
      SELECT id, order_number, status, final_amount, created_at, delivery_date
      FROM orders WHERE quotation_id = ?
      ORDER BY created_at DESC
    `).bind(id).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

export default quotationsRouter
