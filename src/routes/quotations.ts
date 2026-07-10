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
import { authMiddleware } from '../middleware/auth'
import { requireAnyPagePermission, requireEditOrRole } from '../middleware/permissions'
import { logActivity } from '../utils/activityLog'
import { getEntityId, entityFilter } from '../utils/entityFilter'
import { getNextSeqNumber, getNextEntitySeqNumber, withSeqRetry } from '../utils/sequenceGenerator'
import { kstYmdCompact, kstYmd } from '../utils/kstDate'

const quotationsRouter = new Hono<HonoEnv>()
quotationsRouter.use('/*', authMiddleware, requireAnyPagePermission('/quotations', '/orders'))

// ===== 헬퍼 =====

// 견적번호 생성: Q-YYYYMMDD-NNN (entity별 카운터)
async function generateQuotationNumber(db: any, entityId: number): Promise<string> {
  const dateStr = kstYmdCompact()
  return getNextEntitySeqNumber(db, 'quotations', 'quotation_number', entityId, dateStr, { base: 'Q-' })
}

// 만료 견적서 자동 마킹 (read-time check)
async function markExpiredIfNeeded(db: any, quotation: any): Promise<any> {
  if (quotation.status === 'ACTIVE' && quotation.valid_until) {
    const today = kstYmd()
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
    const safeLimit = Math.min(Number(limit) || 50, 200)
    const offset = (Number(page) - 1) * safeLimit

    let query = `
      SELECT q.*, c.client_name, u.name as created_by_name,
        (SELECT COUNT(*) FROM orders o WHERE o.quotation_id = q.id) as actual_order_count,
        (SELECT item_name FROM quotation_items WHERE quotation_id = q.id AND (parent_id IS NULL OR parent_id = 0) ORDER BY sort_order, id LIMIT 1) as main_item_name,
        (SELECT width FROM quotation_items WHERE quotation_id = q.id AND (parent_id IS NULL OR parent_id = 0) ORDER BY sort_order, id LIMIT 1) as main_item_width,
        (SELECT height FROM quotation_items WHERE quotation_id = q.id AND (parent_id IS NULL OR parent_id = 0) ORDER BY sort_order, id LIMIT 1) as main_item_height,
        (SELECT COUNT(*) FROM quotation_items WHERE quotation_id = q.id AND (parent_id IS NULL OR parent_id = 0)) as item_count
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
      params.push(Number(client_id))
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

    const { results } = await c.env.DB.prepare(query).bind(...params).all<Record<string, unknown>>()

    // 만료 자동 마킹 (백그라운드)
    const today = kstYmd()
    const toExpire = results.filter(q => q.status === 'ACTIVE' && q.valid_until && q.valid_until < today).map(q => q.id)
    if (toExpire.length > 0) {
      const ph = toExpire.map(() => '?').join(',')
      await c.env.DB.prepare(`UPDATE quotations SET status='EXPIRED' WHERE id IN (${ph})`).bind(...toExpire).run().catch(() => {})
      for (const q of results) {
        if (toExpire.includes(q.id)) q.status = 'EXPIRED'
      }
    }

    // 카운트
    let countQuery = `SELECT COUNT(*) as count FROM quotations q LEFT JOIN clients c ON q.client_id = c.id WHERE 1=1`
    const countParams: any[] = []
    if (status) { countQuery += ' AND q.status = ?'; countParams.push(status) }
    if (client_id) { countQuery += ' AND q.client_id = ?'; countParams.push(Number(client_id)) }
    if (search) {
      countQuery += ' AND (q.quotation_number LIKE ? OR c.client_name LIKE ?)'
      const pat = `%${search}%`
      countParams.push(pat, pat)
    }
    const efCount = entityFilter(c, 'q')
    countQuery += efCount.clause
    countParams.push(...efCount.params)
    const { count } = await c.env.DB.prepare(countQuery).bind(...countParams).first<{ count: number }>() ?? { count: 0 }

    return c.json({
      success: true,
      data: results,
      pagination: {
        page: Number(page),
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

// ===== GET /stats — KPI 집계 (loadStats: 전체 견적 클라 limit=500 합산 대체) =====
// getQuotStatus 로직과 동일: valid=ACTIVE&미만료(partial 포함), expired=EXPIRED 또는 ACTIVE&만료.
// today는 목록 자동만료(markExpiredIfNeeded, GET /)와 동일하게 KST(kstYmd) 기준 → stats↔목록 표시 일치.
// ⚠️ '/:id'보다 먼저 등록 (id='stats' 섀도잉 방지).
quotationsRouter.get('/stats', async (c) => {
  try {
    const { search = '', client_id = '' } = c.req.query()
    const today = kstYmd()
    let query = `
      SELECT
        COUNT(*) AS total,
        COALESCE(SUM(q.final_amount), 0) AS amount,
        COALESCE(SUM(CASE WHEN q.status = 'ACTIVE' AND (q.valid_until IS NULL OR q.valid_until >= ?) THEN 1 ELSE 0 END), 0) AS valid,
        COALESCE(SUM(CASE WHEN q.status = 'EXPIRED' OR (q.status = 'ACTIVE' AND q.valid_until IS NOT NULL AND q.valid_until < ?) THEN 1 ELSE 0 END), 0) AS expired
      FROM quotations q
      LEFT JOIN clients c ON q.client_id = c.id
      WHERE 1=1
    `
    const params: any[] = [today, today]
    if (client_id) { query += ' AND q.client_id = ?'; params.push(Number(client_id)) }
    if (search) {
      query += ' AND (q.quotation_number LIKE ? OR c.client_name LIKE ?)'
      const pat = `%${search}%`
      params.push(pat, pat)
    }
    const ef = entityFilter(c, 'q')
    query += ef.clause
    params.push(...ef.params)

    const row = await c.env.DB.prepare(query).bind(...params).first<{ total: number; amount: number; valid: number; expired: number }>()
    return c.json({
      success: true,
      data: {
        total: row?.total || 0,
        valid: row?.valid || 0,
        expired: row?.expired || 0,
        amount: row?.amount || 0,
      }
    })
  } catch (error) {
    console.error('quotations.stats error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ===== GET /:id — 상세 =====
quotationsRouter.get('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const ef = entityFilter(c, 'q')  // #360: 단건 조회 법인 격리 (타법인 견적 단가·금액·거래처 노출 차단)
    const quotation = await c.env.DB.prepare(`
      SELECT q.*, c.client_name, c.business_registration_number, c.address,
        u.name as created_by_name
      FROM quotations q
      LEFT JOIN clients c ON q.client_id = c.id
      LEFT JOIN users u ON q.created_by = u.id
      WHERE q.id = ?${ef.clause}
    `).bind(id, ...ef.params).first() as any

    if (!quotation) {
      return c.json({ success: false, error: '견적서를 찾을 수 없습니다.' }, 404)
    }

    await markExpiredIfNeeded(c.env.DB, quotation)

    const { results: items } = await c.env.DB.prepare(`
      SELECT id, quotation_id, item_id, item_name, width, height, scale_factor, quantity, unit, unit_price, amount, content, post_processing, finishing, pricing_method, parent_id, sort_order, ai_group_index, assigned_entity_id, created_at FROM quotation_items WHERE quotation_id = ? ORDER BY sort_order ASC, id ASC
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
    const user = c.get('user')
    const body = await c.req.json()

    if (!body.client_id) {
      return c.json({ success: false, error: 'client_id 필수' }, 400)
    }
    if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
      return c.json({ success: false, error: '품목이 비어있습니다.' }, 400)
    }

    const quotationNumber = await generateQuotationNumber(c.env.DB, getEntityId(c) || 1)

    // VAT rate
    const vatSetting = await c.env.DB.prepare(
      `SELECT setting_value FROM settings WHERE setting_key = 'vat_rate'`
    ).first<{ setting_value: string }>()
    const vatRate = vatSetting ? Number(vatSetting.setting_value) : 0.10

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
      validUntil = kstYmd(30)
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
      body.quotation_date || kstYmd(),
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

    // 품목 삽입 (부모/자식 2-pass) — N+1 제거: db.batch 일괄 처리 (PUT 핸들러와 동일 패턴)
    const parentInsertStmts: D1PreparedStatement[] = []
    const parentClientGroupIds: (string | null)[] = []
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

      parentInsertStmts.push(c.env.DB.prepare(`
        INSERT INTO quotation_items (
          quotation_id, item_id, item_name, width, height, scale_factor,
          quantity, unit, unit_price, amount, content, post_processing,
          finishing, pricing_method, sort_order, ai_group_index,
          entity_id, assigned_entity_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        quotationId, item.item_id || null, item.item_name || 'Unknown',
        w, h, item.scale_factor || 1,
        item.quantity || 1, item.unit || 'EA',
        item.unit_price || 0, amount,
        item.content || null, item.post_processing || null,
        item.finishing || null, pricingMethod, i,
        item.ai_group_index != null ? item.ai_group_index : null,
        getEntityId(c) || 1,
        item.assigned_entity_id || null
      ))
      parentClientGroupIds.push(item.client_group_id || null)
    }

    const clientIdMap = new Map<string, number>()
    if (parentInsertStmts.length > 0) {
      const parentResults = await c.env.DB.batch(parentInsertStmts)
      for (let i = 0; i < parentClientGroupIds.length; i++) {
        const cgId = parentClientGroupIds[i]
        if (cgId) clientIdMap.set(cgId, parentResults[i].meta.last_row_id as number)
      }
    }

    const parentCount = parentInsertStmts.length
    const childStmts: D1PreparedStatement[] = []
    for (let i = 0; i < body.items.length; i++) {
      const item = body.items[i]
      if (!item.parent_client_id) continue
      const parentDbId = clientIdMap.get(item.parent_client_id) ?? null
      const w = item.width_mm || item.width || 0
      const h = item.height_mm || item.height || 0
      childStmts.push(c.env.DB.prepare(`
        INSERT INTO quotation_items (
          quotation_id, item_name, width, height, scale_factor,
          quantity, unit, unit_price, amount, content,
          parent_id, sort_order, ai_group_index, entity_id, assigned_entity_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?)
      `).bind(
        quotationId, item.item_name || '',
        w, h, item.scale_factor || 1,
        item.quantity || 1, item.unit || 'EA',
        item.content || null, parentDbId,
        parentCount + i,
        item.ai_group_index != null ? item.ai_group_index : null,
        getEntityId(c) || 1,
        item.assigned_entity_id || null
      ))
    }
    if (childStmts.length > 0) await c.env.DB.batch(childStmts)

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
    const user = c.get('user')
    const body = await c.req.json()

    const ef = entityFilter(c)  // #360: 타법인 견적서 수정 차단
    const existing = await c.env.DB.prepare(
      `SELECT id, status, client_id FROM quotations WHERE id = ?${ef.clause}`
    ).bind(id, ...ef.params).first<{ id: number; status: string; client_id: number }>()
    if (!existing) return c.json({ success: false, error: '견적서를 찾을 수 없습니다.' }, 404)
    if (existing.status !== 'ACTIVE') {
      return c.json({ success: false, error: `현재 상태(${existing.status})에서는 수정할 수 없습니다.` }, 400)
    }

    // 금액 재계산
    const vatSetting = await c.env.DB.prepare(
      `SELECT setting_value FROM settings WHERE setting_key = 'vat_rate'`
    ).first<{ setting_value: string }>()
    const vatRate = vatSetting ? Number(vatSetting.setting_value) : 0.10

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

    // items 재작성: DELETE + INSERT를 batch로 원자적 실행
    const deleteStmt = c.env.DB.prepare(`DELETE FROM quotation_items WHERE quotation_id = ?`).bind(id)

    // 부모 품목 INSERT 문 수집 (parent_client_id 없는 것)
    const parentInsertStmts: D1PreparedStatement[] = []
    const parentClientGroupIds: (string | null)[] = []
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

      parentInsertStmts.push(c.env.DB.prepare(`
        INSERT INTO quotation_items (
          quotation_id, item_id, item_name, width, height, scale_factor,
          quantity, unit, unit_price, amount, content, post_processing,
          finishing, pricing_method, sort_order, entity_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        Number(id), item.item_id || null, item.item_name || 'Unknown',
        w, h, item.scale_factor || 1,
        item.quantity || 1, item.unit || 'EA',
        item.unit_price || 0, amount,
        item.content || null, item.post_processing || null,
        item.finishing || null, pricingMethod, i,
        getEntityId(c) || 1
      ))
      parentClientGroupIds.push(item.client_group_id || null)
    }

    // 부모 품목 batch 실행 (DELETE 포함)
    const parentResults = await c.env.DB.batch([deleteStmt, ...parentInsertStmts])

    // 부모 ID 매핑 (batch 결과에서 last_row_id 추출, index 0은 DELETE)
    const clientIdMap = new Map<string, number>()
    for (let i = 0; i < parentClientGroupIds.length; i++) {
      const cgId = parentClientGroupIds[i]
      if (cgId) clientIdMap.set(cgId, parentResults[i + 1].meta.last_row_id as number)
    }

    // 자식 품목 INSERT (parent_id 참조 필요 → 부모 batch 이후 실행)
    const parentCount = parentInsertStmts.length
    const childStmts: D1PreparedStatement[] = []
    for (let i = 0; i < (body.items || []).length; i++) {
      const item = body.items[i]
      if (!item.parent_client_id) continue
      const parentDbId = clientIdMap.get(item.parent_client_id) ?? null
      childStmts.push(c.env.DB.prepare(`
        INSERT INTO quotation_items (
          quotation_id, item_name, width, height, scale_factor,
          quantity, unit, unit_price, amount, content,
          parent_id, sort_order, entity_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?)
      `).bind(
        Number(id), item.item_name || '',
        item.width_mm || item.width || 0, item.height_mm || item.height || 0,
        item.scale_factor || 1, item.quantity || 1, item.unit || 'EA',
        item.content || null, parentDbId, parentCount + i,
        getEntityId(c) || 1
      ))
    }
    if (childStmts.length > 0) await c.env.DB.batch(childStmts)

    await logActivity({
      db: c.env.DB, userId: user?.id, userName: user?.username,
      action: 'UPDATE', entityType: 'QUOTATION',
      entityId: Number(id), entityLabel: String(id)
    })

    return c.json({ success: true, data: { id: Number(id) } })
  } catch (error) {
    console.error('quotations.update error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ===== DELETE /:id — 취소 (soft delete) =====
quotationsRouter.delete('/:id', requireEditOrRole('/quotations', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')
    const user = c.get('user')
    const ef = entityFilter(c)  // #360: 타법인 견적서 취소 차단
    const quotation = await c.env.DB.prepare(
      `SELECT id, quotation_number, status FROM quotations WHERE id = ?${ef.clause}`
    ).bind(id, ...ef.params).first<{ id: number; quotation_number: string; status: string }>()
    if (!quotation) return c.json({ success: false, error: '견적서를 찾을 수 없습니다.' }, 404)

    await c.env.DB.prepare(
      `UPDATE quotations SET status = 'CANCELLED', updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(user?.id || null, id).run()

    await logActivity({
      db: c.env.DB, userId: user?.id, userName: user?.username,
      action: 'CANCEL', entityType: 'QUOTATION',
      entityId: Number(id), entityLabel: quotation.quotation_number
    })

    return c.json({ success: true, message: '견적서 취소 완료' })
  } catch (error) {
    console.error('quotations.cancel error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ===== POST /:id/convert-to-order — 견적서 → 주문 (immutable snapshot 복사) =====
quotationsRouter.post('/:id/convert-to-order', requireEditOrRole('/quotations', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')
    const user = c.get('user')
    const body = await c.req.json().catch(() => ({}))
    const force = body.force === true

    const ef = entityFilter(c)  // #360: 타법인 견적서 주문전환 차단
    const quotation = await markExpiredIfNeeded(
      c.env.DB,
      await c.env.DB.prepare(`SELECT id, quotation_number, client_id, entity_id, status, quotation_date, delivery_date, valid_until, total_amount, vat_amount, discount_amount, final_amount, delivery_method, delivery_time, delivery_info, contact_phone, contact_mobile, shipping_payment, notes, internal_notes, first_converted_at, converted_count, created_by, updated_by, created_at, updated_at FROM quotations WHERE id = ?${ef.clause}`).bind(id, ...ef.params).first() as any
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

    // #161: 이미 주문 전환된 견적서 중복 전환 방지
    if (quotation.converted_count > 0 && !force) {
      return c.json({
        success: false,
        error: `이미 ${quotation.converted_count}건 주문 전환된 견적서입니다. 분할 주문 등 강제 전환하려면 force=true를 전달하세요.`,
        meta: { already_converted: true, converted_count: quotation.converted_count }
      }, 409)
    }

    const { results: qItems } = await c.env.DB.prepare(
      `SELECT id, quotation_id, item_id, item_name, width, height, scale_factor, quantity, unit, unit_price, amount, content, post_processing, finishing, pricing_method, parent_id, sort_order, ai_group_index, assigned_entity_id, created_at FROM quotation_items WHERE quotation_id = ? ORDER BY sort_order, id`
    ).bind(id).all<Record<string, unknown>>()
    if (!qItems || qItems.length === 0) {
      return c.json({ success: false, error: '견적서에 품목이 없습니다.' }, 400)
    }

    // #134: 납품일 없는 견적서 → 주문 전환 방지
    if (!quotation.delivery_date) {
      return c.json({ success: false, error: '납품일이 설정된 견적서만 주문으로 전환할 수 있습니다.' }, 400)
    }

    // #209: 낙관적 잠금 — 변환 직전 updated_at 스냅샷 저장
    const originalUpdatedAt = quotation.updated_at

    // 주문번호 생성
    const today = new Date()
    const dateStr = kstYmdCompact()
    const orderNumber = await getNextEntitySeqNumber(c.env.DB, 'orders', 'order_number', quotation.entity_id || 1, dateStr)

    // #209: 낙관적 잠금 — 변환 중 견적서 수정 여부 확인
    const current = await c.env.DB.prepare(
      'SELECT updated_at FROM quotations WHERE id = ?'
    ).bind(id).first<{ updated_at: string }>()
    if (current && current.updated_at !== originalUpdatedAt) {
      return c.json({
        success: false,
        error: '견적서가 다른 사용자에 의해 수정되었습니다. 페이지를 새로고침 후 다시 시도해주세요.'
      }, 409)
    }

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

    // 품목 복사 (parent_id 매핑) — N+1 제거: 부모/자식 db.batch 일괄 처리
    const qParentToOrderId = new Map<number, number>()
    const parentStmts: D1PreparedStatement[] = []
    const parentQIds: number[] = []
    for (const qi of qItems) {
      if (qi.parent_id != null) continue
      parentStmts.push(c.env.DB.prepare(`
        INSERT INTO order_items (
          order_id, item_id, item_name, category_name,
          width, height, quantity, unit, unit_price, amount, vat_included,
          post_processing, content, sort_order,
          ai_group_index, scale_factor, parent_item_id, finishing,
          assigned_entity_id, assignment_status
        ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, NULL, ?, ?, NULL)
      `).bind(
        orderId, qi.item_id, qi.item_name,
        qi.width, qi.height, qi.quantity, qi.unit,
        qi.unit_price, qi.amount,
        qi.post_processing, qi.content, qi.sort_order,
        qi.ai_group_index, qi.scale_factor, qi.finishing,
        qi.assigned_entity_id ?? null
      ))
      parentQIds.push(qi.id as number)
    }
    if (parentStmts.length > 0) {
      const parentResults = await c.env.DB.batch(parentStmts)
      for (let i = 0; i < parentQIds.length; i++) {
        qParentToOrderId.set(parentQIds[i], parentResults[i].meta.last_row_id as number)
      }
    }

    const convChildStmts: D1PreparedStatement[] = []
    for (const qi of qItems) {
      if (qi.parent_id == null) continue
      const parentOrderItemId = qParentToOrderId.get(qi.parent_id as number) ?? null
      convChildStmts.push(c.env.DB.prepare(`
        INSERT INTO order_items (
          order_id, item_name, width, height, quantity, unit,
          unit_price, amount, vat_included, content, sort_order,
          ai_group_index, scale_factor, parent_item_id,
          assigned_entity_id, assignment_status
        ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 1, ?, ?, ?, ?, ?, ?, NULL)
      `).bind(
        orderId, qi.item_name, qi.width, qi.height, qi.quantity, qi.unit,
        qi.content, qi.sort_order, qi.ai_group_index, qi.scale_factor,
        parentOrderItemId,
        qi.assigned_entity_id ?? null
      ))
    }
    if (convChildStmts.length > 0) await c.env.DB.batch(convChildStmts)

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
      entityId: Number(id), entityLabel: quotation.quotation_number,
      details: JSON.stringify({ created_order_id: orderId, order_number: orderNumber })
    })

    return c.json({
      success: true,
      data: { order_id: orderId, order_number: orderNumber, quotation_id: Number(id) },
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
