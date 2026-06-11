import { Hono } from 'hono'
import type { HonoEnv } from '../../types/env'
import type { Order, OrderItem, ApiResponse, PaginatedResponse } from '../../types/models'
import { authMiddleware, requireRole } from '../../middleware/auth'
import { requireAnyPagePermission } from '../../middleware/permissions'
import { getNextSeqNumber, getNextEntitySeqNumber, withSeqRetry } from '../../utils/sequenceGenerator'
import { logActivity } from '../../utils/activityLog'
import { notifyRoles } from '../../utils/notify'
import { recalculateOrderCosts } from '../../utils/costCalculator'
import { checkMaterialShortage } from '../../utils/materialShortageCheck'
import { sendEmail } from '../../services/emailProvider'
import { getEntityId, entityFilter, orderVisibilityFilter } from '../../utils/entityFilter'
import { getEntityCompanyInfo } from '../../utils/entitySettings'
import {
  recommendAssignedEntity,
  recalcOrderBillingGroups,
  setOrderBillingStatus,
  generateCardsForOrder,
} from './helpers'

const ordersCoreRouter = new Hono<HonoEnv>()
ordersCoreRouter.use('/*', authMiddleware, requireAnyPagePermission('/orders', '/cards'))

ordersCoreRouter.get('/', async (c) => {
  try {
    const { page = '1', limit = '50', status = '', search = '', sort = 'created_at_desc', date_from = '', date_to = '', exclude_status = '', priority = '', amount_min = '', amount_max = '', delivery_method = '', billing_status = '', overdue = '' } = c.req.query()
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
        (SELECT COUNT(*) FROM cards WHERE order_id = o.id AND shipped_at IS NOT NULL) as shipped_cards,
        (SELECT CASE WHEN COUNT(*) > 0 THEN 1 ELSE 0 END FROM order_items WHERE order_id = o.id AND price_status = 'PENDING') as has_pending_prices,
        (SELECT item_name FROM order_items WHERE order_id = o.id AND (parent_item_id IS NULL OR parent_item_id = 0) ORDER BY id LIMIT 1) as main_item_name,
        (SELECT width FROM order_items WHERE order_id = o.id AND (parent_item_id IS NULL OR parent_item_id = 0) ORDER BY id LIMIT 1) as main_item_width,
        (SELECT height FROM order_items WHERE order_id = o.id AND (parent_item_id IS NULL OR parent_item_id = 0) ORDER BY id LIMIT 1) as main_item_height,
        (SELECT content FROM order_items WHERE order_id = o.id AND (parent_item_id IS NULL OR parent_item_id = 0) ORDER BY id LIMIT 1) as main_item_content,
        (SELECT COUNT(*) FROM order_items WHERE order_id = o.id AND (parent_item_id IS NULL OR parent_item_id = 0)) as item_count,
        COALESCE(e.short_name, e.name) as entity_name
      FROM orders o
      LEFT JOIN clients c ON o.client_id = c.id
      LEFT JOIN users u ON o.created_by = u.id
      LEFT JOIN entities e ON e.id = o.entity_id
    `
    const params: any[] = []
    const whereClauses: string[] = []

    // 주문 가시성 필터 (멀티법인 협업): 소유(청구) 법인 + 담당 품목 보유 법인. ADMIN/코디네이터는 전체.
    const ef = orderVisibilityFilter(c, 'o')
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

    // 출고지연: 납기일 경과 + 미출고(SHIPPED/COMPLETED/취소/견적 제외)
    if (overdue === '1') {
      whereClauses.push("o.delivery_date IS NOT NULL AND o.delivery_date != '' AND o.delivery_date < date('now', '+9 hours') AND o.status NOT IN ('SHIPPED','COMPLETED','CANCELLED','QUOTATION')")
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

    // 주문 가시성 필터 (목록과 일치)
    const efCount = orderVisibilityFilter(c, 'o')
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

    if (overdue === '1') {
      countWhereClauses.push("o.delivery_date IS NOT NULL AND o.delivery_date != '' AND o.delivery_date < date('now', '+9 hours') AND o.status NOT IN ('SHIPPED','COMPLETED','CANCELLED','QUOTATION')")
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
      WHERE o.auto_complete_date IS NOT NULL
        AND o.status NOT IN ('SHIPPED', 'COMPLETED', 'CANCELLED')
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

    // 주문 가시성 (멀티법인 격리·IDOR 차단): 소유(청구) 법인 + 담당 품목 보유 법인만 열람.
    // ADMIN(entityId=0)/코디네이터는 전체. 권한 없으면 존재 비노출 위해 404.
    const viewerEntity = getEntityId(c)
    const viewerUser = c.get('user') as { is_coordinator?: number } | undefined
    if (viewerEntity !== 0 && !viewerUser?.is_coordinator) {
      const ownEntity = Number((order as any).entity_id)
      const hasAssigned = (items || []).some((it: any) => Number(it.assigned_entity_id) === viewerEntity)
      if (ownEntity !== viewerEntity && !hasAssigned) {
        return c.json({ success: false, error: 'Order not found' }, 404)
      }
    }

    // split billing P2: 청구그룹(법인별 청구 단위) — 상세 화면 요약 표시용
    const { results: billingGroups } = await c.env.DB.prepare(`
      SELECT g.id, g.entity_id, g.billing_status, g.supply_amount, g.tax_amount, g.billed_amount,
             g.billed_at, g.tax_invoice_id, e.name AS entity_name, e.short_name AS entity_short_name
      FROM order_billing_groups g
      LEFT JOIN entities e ON e.id = g.entity_id
      WHERE g.order_id = ?
      ORDER BY g.entity_id ASC
    `).bind(id).all()

    const response: ApiResponse<any> = {
      success: true,
      data: {
        ...order,
        items,
        billing_groups: billingGroups || []
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

    // 청구(매출) 법인: 명시값 우선, 없으면 로그인 법인 (코디네이터가 타법인 주문 접수 시 명시 선택)
    // ⚠️ 불변식 "번호 E{eid} = 행 entity_id" → 채번도 billingEntityId 기준이어야 함(세션 법인 X).
    //    billing_entity_id ≠ 세션 법인일 때(코디 타법인 접수) 번호 접두와 entity_id 불일치 버그 방지.
    const billingEntityId = (orderData.billing_entity_id && Number(orderData.billing_entity_id) > 0)
      ? Number(orderData.billing_entity_id)
      : (getEntityId(c) || 1)

    // Generate order number (without ORD- prefix)
    const today = new Date()
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '')

    const orderNumber = await getNextEntitySeqNumber(c.env.DB, 'orders', 'order_number', billingEntityId, dateStr)

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

    // Calculate totals (PENDING 품목은 0원 처리)
    let totalAmount = 0
    let vatAmount = 0
    for (const item of orderData.items) {
      if (item.price_status === 'PENDING') { continue }
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
    // billingEntityId는 위(채번 전)에서 계산됨 — 번호 접두와 entity_id 일치 보장
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
      billingEntityId,
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

    // Insert order items — two-pass batch for parent_item_id support (#63 원자화)
    // Pre-resolve: item detail lookups for items missing name
    const parentItems: Array<{ idx: number; item: any; itemName: string | null; categoryName: string | null; unit: string; itemAmount: number }> = []
    const itemIdsToLookup: number[] = []
    const lookupIndices: number[] = []

    for (let i = 0; i < orderData.items.length; i++) {
      const item = orderData.items[i]
      if (item.parent_client_id) continue

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

      const entry = { idx: i, item, itemName: item.item_name || null, categoryName: item.category_name || null, unit: item.unit || 'EA', itemAmount }
      parentItems.push(entry)

      if (item.item_id && !entry.itemName) {
        itemIdsToLookup.push(item.item_id)
        lookupIndices.push(parentItems.length - 1)
      }
    }

    // Batch lookup item details
    if (itemIdsToLookup.length > 0) {
      const lookupStmts = itemIdsToLookup.map(id =>
        c.env.DB.prepare('SELECT item_name, category, unit FROM items WHERE id = ?').bind(id)
      )
      const lookupResults = await c.env.DB.batch(lookupStmts)
      for (let k = 0; k < lookupResults.length; k++) {
        const row = lookupResults[k].results[0] as { item_name: string; category: string; unit: string } | undefined
        if (row) {
          const entry = parentItems[lookupIndices[k]]
          entry.itemName = row.item_name
          entry.categoryName = row.category
          entry.unit = row.unit
        }
      }
    }

    // Pass 1: batch insert parent/regular rows
    const orderEntityId = billingEntityId
    const pass1Stmts = parentItems.map(({ idx, item, itemName, categoryName, unit, itemAmount }) => {
      // 담당 법인: 요청 명시값 우선, 없으면 카드그룹 기반 추천. NULL=청구 법인 담당(투명)
      const assignedEntity = (item.assigned_entity_id !== undefined && item.assigned_entity_id !== null)
        ? item.assigned_entity_id
        : recommendAssignedEntity({ ...item, category_name: categoryName }, orderEntityId)
      const assignmentStatus = assignedEntity ? (item.assignment_status || 'PENDING') : null
      return c.env.DB.prepare(`
        INSERT INTO order_items (
          order_id, item_id, item_name, category_name,
          width, height, quantity, unit,
          unit_price, amount, vat_included,
          post_processing, content, specification, sort_order,
          ai_group_index, scale_factor, ai_analysis_id, parent_item_id, finishing, price_status,
          assigned_entity_id, assignment_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)
      `).bind(
        orderId,
        item.item_id || null,
        itemName || 'Unknown',
        categoryName || null,
        item.width_mm || item.width || null,
        item.height_mm || item.height || null,
        item.quantity || 1,
        unit,
        item.price_status === 'PENDING' ? 0 : (item.unit_price || 0),
        item.price_status === 'PENDING' ? 0 : itemAmount,
        item.vat_included !== undefined ? (item.vat_included ? 1 : 0) : 1,
        item.post_processing || item.paper || null,
        item.content || item.print || null,
        item.specification || null,
        idx,
        item.ai_group_index !== undefined ? item.ai_group_index : null,
        item.scale_factor || 1,
        item.ai_analysis_id || null,
        item.finishing || null,
        item.price_status || 'CONFIRMED',
        assignedEntity,
        assignmentStatus
      )
    })

    const clientIdMap = new Map<string, number>()
    if (pass1Stmts.length > 0) {
      const pass1Results = await c.env.DB.batch(pass1Stmts)
      for (let k = 0; k < pass1Results.length; k++) {
        const item = parentItems[k].item
        if (item.client_group_id) {
          clientIdMap.set(item.client_group_id, pass1Results[k].meta.last_row_id as number)
        }
      }
    }

    // Pass 2: batch insert child rows (has parent_client_id)
    const parentOnlyCount = parentItems.length
    const pass2Stmts: ReturnType<ReturnType<typeof c.env.DB.prepare>['bind']>[] = []
    for (let i = 0; i < orderData.items.length; i++) {
      const item = orderData.items[i]
      if (!item.parent_client_id) continue

      const parentDbId = clientIdMap.get(item.parent_client_id) ?? null
      pass2Stmts.push(
        c.env.DB.prepare(`
          INSERT INTO order_items (
            order_id, item_id, item_name, category_name,
            width, height, quantity, unit,
            unit_price, amount, vat_included,
            post_processing, content, specification, sort_order,
            ai_group_index, scale_factor, ai_analysis_id, parent_item_id,
            assigned_entity_id, assignment_status
          ) VALUES (?, NULL, ?, NULL, ?, ?, ?, ?, 0, 0, 1, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          orderId,
          item.item_name || '',
          item.width_mm || item.width || null,
          item.height_mm || item.height || null,
          item.quantity || 1,
          item.unit || 'EA',
          item.content || null,
          item.specification || null,
          parentOnlyCount + i,
          item.ai_group_index !== undefined ? item.ai_group_index : null,
          item.scale_factor || 1,
          item.ai_analysis_id || null,
          parentDbId,
          item.assigned_entity_id || null,
          (item.assigned_entity_id ? (item.assignment_status || 'PENDING') : null)
        )
      )
    }
    if (pass2Stmts.length > 0) {
      await c.env.DB.batch(pass2Stmts)
    }

    // split billing P2: 품목 담당법인별 청구그룹 생성/재계산
    await recalcOrderBillingGroups(c.env.DB, orderId)

    // Insert status history
    await c.env.DB.prepare(`
      INSERT INTO order_status_history (order_id, to_status, changed_by, change_reason)
      VALUES (?, ?, ?, ?)
    `).bind(orderId, initialStatus, user?.id || null, initialStatus === 'QUOTATION' ? 'Quotation created' : 'Order created').run()

    // Step 3.5 — save order_ai_files (다중 AI 파일 지원)
    const aiFiles: Array<{ file_path: string; analysis_id?: number; groups_count?: number }> = orderData.ai_files || []
    if (aiFiles.length > 0) {
      const aiFileStmts = aiFiles.map((af: { file_path: string; analysis_id?: number }, idx: number) =>
        c.env.DB.prepare(
          `INSERT INTO order_ai_files (order_id, file_path, file_name, analysis_id, sort_order, entity_id)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).bind(
          orderId,
          af.file_path,
          (af.file_path || '').split(/[/\\]/).pop() || null,
          af.analysis_id || null,
          idx,
          getEntityId(c)
        )
      )
      await c.env.DB.batch(aiFileStmts)
    }

    // Step 4 — enqueue an AI_PROCESS task for IllustratorAutomat.
    // One task per order covers the entire file: JSX processing + EPS output +
    // NAS upload to Z:\orders\{category}\{year}\{month}\{order_number}\.
    // The agent claims this via POST /api/tasks/claim?type=AI_PROCESS.
    if (aiFilePath) {
      try {
        await c.env.DB.prepare(`
          INSERT INTO tasks (type, status, order_id, input_payload, created_by, entity_id)
          VALUES ('AI_PROCESS', 'PENDING', ?, ?, ?, ?)
        `).bind(
          orderId,
          JSON.stringify({
            order_number: orderNumber,
            ai_file_path: aiFilePath,
            ai_analysis_id: orderData.ai_analysis_id ?? null
          }),
          user?.id || null,
          getEntityId(c) || 1
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

    // ── 여신한도 체크 (#69) ──────────────────────────────────────────────────
    // ADMIN은 무조건 통과, 그 외 역할은 여신 초과 시 결재 요청 생성 + 카드 미생성
    let creditBlocked = false
    if (orderData.client_id && user?.role !== 'ADMIN') {
      const creditClient = await c.env.DB.prepare(
        `SELECT credit_limit, credit_hold FROM clients WHERE id = ?`
      ).bind(orderData.client_id).first<{ credit_limit: number; credit_hold: number }>()

      if (creditClient?.credit_hold === 1) {
        // 수동 차단 — 주문 자체를 막진 않되 결재 필수
        creditBlocked = true
      } else if (creditClient?.credit_limit && creditClient.credit_limit > 0) {
        const balRow = await c.env.DB.prepare(`
          SELECT COALESCE(SUM(CASE WHEN final_amount > 0 THEN final_amount ELSE 0 END), 0)
                 - COALESCE((SELECT SUM(amount) FROM payments WHERE client_id = ?), 0) as balance
          FROM orders WHERE client_id = ? AND status NOT IN ('CANCELLED','DELETED','QUOTATION')
        `).bind(orderData.client_id, orderData.client_id).first<{ balance: number }>()
        const balance = balRow?.balance || 0
        if (balance >= creditClient.credit_limit) {
          creditBlocked = true
        }
      }

      if (creditBlocked) {
        // #163: 여신 초과 — 결재 요청 원자적 생성
        const today2 = new Date().toISOString().slice(0, 10).replace(/-/g, '')
        // #329: 법인코드 E{eid} 내장 — 멀티법인 번호 충돌 방지 (행 entity_id와 동일 eid 사용)
        const aprNumber = await getNextEntitySeqNumber(c.env.DB, 'approval_requests', 'request_number', getEntityId(c) || 1, today2, { base: 'APR-' })

        const clientName = await c.env.DB.prepare(
          `SELECT client_name FROM clients WHERE id = ?`
        ).bind(orderData.client_id).first<{ client_name: string }>()

        const balRow2 = await c.env.DB.prepare(`
          SELECT COALESCE(SUM(CASE WHEN final_amount > 0 THEN final_amount ELSE 0 END), 0)
                 - COALESCE((SELECT SUM(amount) FROM payments WHERE client_id = ?), 0) as balance
          FROM orders WHERE client_id = ? AND status NOT IN ('CANCELLED','DELETED','QUOTATION')
        `).bind(orderData.client_id, orderData.client_id).first<{ balance: number }>()

        const creditInfo = await c.env.DB.prepare(
          `SELECT credit_limit FROM clients WHERE id = ?`
        ).bind(orderData.client_id).first<{ credit_limit: number }>()

        const entityId = getEntityId(c) || 1 // #329: 번호 E{eid}와 행 entity_id 일치 보장

        // batch 1: 주문 credit_status + approval_requests 원자적 생성
        const batchResults = await c.env.DB.batch([
          c.env.DB.prepare(
            `UPDATE orders SET credit_status = 'PENDING' WHERE id = ?`
          ).bind(orderId),
          c.env.DB.prepare(`
            INSERT INTO approval_requests (request_number, type, requester_id, title, content, amount, reference_type, reference_id, status, current_step, total_steps, entity_id)
            VALUES (?, 'CREDIT_OVERRIDE', ?, ?, ?, ?, 'order', ?, 'PENDING', 1, 1, ?)
          `).bind(
            aprNumber,
            user?.id || 1,
            `여신한도 초과 승인 요청 — ${clientName?.client_name || ''}`,
            JSON.stringify({
              client_id: orderData.client_id,
              client_name: clientName?.client_name,
              credit_limit: creditInfo?.credit_limit || 0,
              current_balance: balRow2?.balance || 0,
              order_amount: finalAmount,
              order_number: orderNumber
            }),
            finalAmount,
            orderId,
            entityId
          )
        ])

        const aprId = batchResults[1].meta?.last_row_id as number

        // batch 2: approval_steps + credit_overrides 원자적 생성
        await c.env.DB.batch([
          c.env.DB.prepare(`
            INSERT INTO approval_steps (request_id, step_order, approver_role, label, status, entity_id)
            VALUES (?, 1, 'ADMIN', '경리/관리자 승인', 'PENDING', ?)
          `).bind(aprId, entityId || 1),
          c.env.DB.prepare(`
            INSERT INTO credit_overrides (order_id, client_id, credit_limit, balance_at_time, order_amount, approval_request_id, entity_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).bind(
            orderId, orderData.client_id,
            creditInfo?.credit_limit || 0, balRow2?.balance || 0,
            finalAmount, aprId, entityId || 1
          )
        ])

        // 카드 생성 없이 반환 — 여신 승인 대기 상태
        return c.json({
          success: true,
          data: { id: orderId, order_number: orderNumber, credit_status: 'PENDING', approval_request_id: aprId },
          message: '여신한도 초과 — 경리/관리자 승인 대기 중입니다. 승인 후 생산이 시작됩니다.'
        })
      }
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
        entityId: billingEntityId
      })
    }

    // ── 타법인 배정 알림: 타법인 담당(assigned_entity_id ≠ 청구법인) 품목이 있으면 그 법인에 알림 (멀티법인 협업) ──
    try {
      const { results: crossEntities } = await c.env.DB.prepare(
        `SELECT DISTINCT assigned_entity_id AS eid FROM order_items
         WHERE order_id = ? AND assigned_entity_id IS NOT NULL AND assigned_entity_id != ?`
      ).bind(orderId, billingEntityId).all<{ eid: number }>()
      for (const row of (crossEntities || [])) {
        await notifyRoles(
          c.env.DB,
          ['DESIGNER', 'MANAGER'],
          '타법인 작업 배정',
          `주문 ${orderNumber}에 귀 법인 담당 품목이 배정되었습니다.`,
          '/orders',
          row.eid as number
        )
      }
    } catch (_) { /* 알림 실패는 주문 생성에 영향 없음 */ }

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

      // N+1 제거: 분석 결과를 IN(...)으로 일괄 선조회 후 thumbnail UPDATE는 db.batch로 묶음
      const thumbAnalysisIds = [...new Set((cardsForThumb as any[]).map((r) => r.ai_analysis_id as number))]
      const analysisCache = new Map<number, Record<string, unknown>[]>()
      if (thumbAnalysisIds.length > 0) {
        const aph = thumbAnalysisIds.map(() => '?').join(',')
        const { results: aRows } = await c.env.DB.prepare(
          `SELECT id, groups_json FROM ai_analysis_requests WHERE id IN (${aph})`
        ).bind(...thumbAnalysisIds).all<{ id: number; groups_json: string | null }>()
        for (const a of aRows) {
          let parsed: Record<string, unknown>[] = []
          if (a.groups_json) { try { parsed = JSON.parse(a.groups_json) } catch (_) { parsed = [] } }
          analysisCache.set(a.id, parsed)
        }
      }

      const thumbStmts: D1PreparedStatement[] = []
      for (const row of cardsForThumb) {
        const analysisId = row.ai_analysis_id as number
        const groupIndex = row.ai_group_index as number
        const groups = analysisCache.get(analysisId) || []
        // ai_group_index === -1 means "whole file" → use first group's thumbnail
        const matchedGroup = groupIndex === -1
          ? groups[0]
          : groups.find((g) => g.index === groupIndex)

        if (matchedGroup?.thumbnail_base64) {
          const thumbnailUrl = `data:image/png;base64,${matchedGroup.thumbnail_base64 as string}`
          thumbStmts.push(c.env.DB.prepare(
            'UPDATE cards SET thumbnail_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
          ).bind(thumbnailUrl, row.card_id))
        }
      }
      for (let i = 0; i < thumbStmts.length; i += 80) {
        await c.env.DB.batch(thumbStmts.slice(i, i + 80))
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

          // N+1 제거: 품목명을 IN(...)으로 일괄 선조회 후 INSERT는 db.batch로 묶음
          const aiItemIds = [...new Set((aiItems as any[]).map((oi) => oi.item_id as number).filter((v) => v != null))]
          const itemNameMap = new Map<number, string>()
          if (aiItemIds.length > 0) {
            const iph = aiItemIds.map(() => '?').join(',')
            const { results: nameRows } = await c.env.DB.prepare(
              `SELECT id, name FROM items WHERE id IN (${iph})`
            ).bind(...aiItemIds).all<{ id: number; name: string }>()
            for (const nr of nameRows) itemNameMap.set(nr.id, nr.name)
          }

          const jobStmts: D1PreparedStatement[] = []
          for (const oi of aiItems) {
            const gIdx = (oi.ai_group_index as number) ?? 0
            const group = groups[gIdx]
            if (!group) continue

            const finishing = [oi.finishing, oi.finishing2, oi.finishing3].filter(Boolean).join('+')
            const productName = itemNameMap.get(oi.item_id as number) || ''
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

            jobStmts.push(c.env.DB.prepare(
              `INSERT INTO auto_process_jobs
               (order_id, order_item_id, ai_analysis_id, ai_group_index,
                source_path, product, width_cm, height_cm, finishing,
                scale_factor, clip_bounds, margins, status, ia_params, entity_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
            ).bind(
              orderId, oi.id as number, aiAnalysisId, gIdx,
              analysis.file_path, productName, (oi.width as number) || 0, (oi.height as number) || 0, finishing,
              scale, JSON.stringify(clipBounds),
              JSON.stringify({ L: mL, R: mR, T: mT, B: mB }),
              JSON.stringify(iaParams),
              getEntityId(c)
            ))
          }
          for (let i = 0; i < jobStmts.length; i += 80) {
            await c.env.DB.batch(jobStmts.slice(i, i + 80))
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

    // Phase 5: 주문 생성 시 CONFIRMED이면 자재 부족 경고
    let materialWarnings: any[] = []
    if (initialStatus === 'CONFIRMED') {
      try {
        materialWarnings = await checkMaterialShortage(c.env.DB, orderId, getEntityId(c) || 1)
      } catch (mErr) {
        console.error('Material shortage check failed (non-blocking):', mErr)
      }
    }

    return c.json({
      success: true,
      data: {
        id: orderId,
        order_number: orderNumber
      },
      message: `Order created successfully. ${cardsGenerated} card(s) generated.${autoProcessStarted ? ' 자동가공이 시작되었습니다.' : ''}`,
      ...(materialWarnings.length > 0 && {
        material_warnings: materialWarnings,
        warning_message: `자재 부족 ${materialWarnings.length}건: ${materialWarnings.slice(0, 3).map((w: any) => w.material_name).join(', ')}${materialWarnings.length > 3 ? ' 외' : ''}`,
      }),
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

// Delete order (ADMIN 하드 삭제 / MANAGER 소프트 삭제 가능)
ordersCoreRouter.delete('/:id', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')
    const user = c.get('user')
    const efOrd = entityFilter(c) // 타 법인 주문 삭제 IDOR 방지 — #333

    // Check if order exists (status, client_id, final_amount 포함)
    const order = await c.env.DB.prepare(`
      SELECT id, order_number, status, client_id, final_amount, billing_status, billed_amount FROM orders WHERE id = ?${efOrd.clause}
    `).bind(id, ...efOrd.params).first<{ id: number; order_number: string; status: string; client_id: number; final_amount: number; billing_status: string | null; billed_amount: number | null }>()

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
      // #219: 소프트 삭제 — 원자적 batch 처리
      const softDeleteStmts = [
        c.env.DB.prepare(`
          UPDATE orders
          SET status = 'CANCELLED',
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(id),
        c.env.DB.prepare(`
          INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, change_reason)
          VALUES (?, ?, 'CANCELLED', ?, ?)
        `).bind(id, order.status, user.id, '주문 삭제 요청으로 인한 취소'),
        c.env.DB.prepare(`
          UPDATE cards
          SET status = 'HOLD',
              hold_reason = '주문 삭제/취소',
              hold_at = CURRENT_TIMESTAMP,
              hold_by = ?
          WHERE order_id = ? AND status != 'HOLD'
            AND shipped_at IS NULL
        `).bind(user.id, id),
      ]

      // split billing P3: balance 캐시 미사용. 미수금은 order_billing_groups[BILLED] 파생이며
      // status != 'CANCELLED' 필터로 취소 주문은 자동 제외 → 별도 차감 불필요.

      await c.env.DB.batch(softDeleteStmts)

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

    // split billing P3: balance 캐시 미사용 — 하드 삭제 시 order_billing_groups 도 함께 삭제(아래 batch).
    // 미수금은 파생이므로 별도 역산 불필요.

    // #87: 원자적 삭제 (db.batch — 전체 성공 또는 전체 롤백)
    await c.env.DB.batch([
      // #116: card_id 기반 정리 (cards 삭제 전에 먼저, #117 FK 미강제 대응)
      c.env.DB.prepare('DELETE FROM card_status_history WHERE card_id IN (SELECT id FROM cards WHERE order_id = ?)').bind(id),
      c.env.DB.prepare('DELETE FROM quality_issues WHERE card_id IN (SELECT id FROM cards WHERE order_id = ?)').bind(id),
      c.env.DB.prepare('DELETE FROM waste_records WHERE card_id IN (SELECT id FROM cards WHERE order_id = ?)').bind(id),
      c.env.DB.prepare('UPDATE print_events SET card_id = NULL WHERE card_id IN (SELECT id FROM cards WHERE order_id = ?)').bind(id),
      c.env.DB.prepare('DELETE FROM card_items WHERE card_id IN (SELECT id FROM cards WHERE order_id = ?)').bind(id),
      // #332: cards 참조 잔여 (cards 삭제 전) — tasks/print_file_map은 이력 보존(SET NULL), work_records는 card_id NOT NULL이라 DELETE
      c.env.DB.prepare('UPDATE tasks SET card_id = NULL WHERE card_id IN (SELECT id FROM cards WHERE order_id = ?)').bind(id),
      c.env.DB.prepare('DELETE FROM work_records WHERE card_id IN (SELECT id FROM cards WHERE order_id = ?)').bind(id),
      c.env.DB.prepare('UPDATE print_file_map SET card_id = NULL WHERE card_id IN (SELECT id FROM cards WHERE order_id = ?)').bind(id),
      // #116: order_id 기반 정리
      c.env.DB.prepare('DELETE FROM customer_claims WHERE order_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM returns WHERE order_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM credit_overrides WHERE order_id = ?').bind(id),
      c.env.DB.prepare(`DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE order_id = ?)`).bind(id),
      c.env.DB.prepare('DELETE FROM shipments WHERE order_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM cards WHERE order_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM order_items WHERE order_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM order_billing_groups WHERE order_id = ?').bind(id),  // split billing P3
      c.env.DB.prepare('DELETE FROM order_status_history WHERE order_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM tax_invoice_orders WHERE order_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM order_ai_files WHERE order_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM auto_process_jobs WHERE order_id = ?').bind(id),
      // #332: tasks.order_id 이력 보존 (SET NULL)
      c.env.DB.prepare('UPDATE tasks SET order_id = NULL WHERE order_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM orders WHERE id = ?').bind(id),
    ])

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

    // #101: CONFIRMED 이상 상태에서 delivery_date NULL 방지
    const confirmedStatuses = ['CONFIRMED', 'PRINTING', 'PRINT_DONE', 'SHIPPED']
    if (confirmedStatuses.includes(existingOrder.status) && !orderData.delivery_date) {
      return c.json({ success: false, error: '확정된 주문의 납품일은 필수입니다.' }, 400)
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

    // Calculate totals (PENDING 품목은 0원 처리)
    let totalAmount = 0
    let vatAmount = 0
    for (const item of orderData.items) {
      if (item.price_status === 'PENDING') { continue }
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

    // split billing P3: balance 캐시 미사용. BILLED(청구 확정) 주문의 금액 수정은 미수금 파생에
    // 자동 반영되지 않는다 — order_billing_groups 가 동결(발행된 세금계산서 보호)되므로.
    // 청구 후 금액 변경분은 adjustment(감액/증액)로 처리한다.

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
      // #87 + #122: 카드 자식 테이블 + 카드 + order_items 원자적 삭제 (재생성 전)
      await c.env.DB.batch([
        c.env.DB.prepare('DELETE FROM card_status_history WHERE card_id IN (SELECT id FROM cards WHERE order_id = ?)').bind(id),
        c.env.DB.prepare('DELETE FROM quality_issues WHERE card_id IN (SELECT id FROM cards WHERE order_id = ?)').bind(id),
        c.env.DB.prepare('DELETE FROM waste_records WHERE card_id IN (SELECT id FROM cards WHERE order_id = ?)').bind(id),
        c.env.DB.prepare('UPDATE print_events SET card_id = NULL WHERE card_id IN (SELECT id FROM cards WHERE order_id = ?)').bind(id),
        c.env.DB.prepare('DELETE FROM card_items WHERE card_id IN (SELECT id FROM cards WHERE order_id = ?)').bind(id),
        c.env.DB.prepare('DELETE FROM cards WHERE order_id = ?').bind(id),
        c.env.DB.prepare("DELETE FROM auto_process_jobs WHERE order_id = ? AND status IN ('pending','processing','failed')").bind(id),
        c.env.DB.prepare('DELETE FROM order_items WHERE order_id = ?').bind(id),
      ])
    }

    // 카드 보존 경로에서는 order_items 삭제 전 card_items 매핑을 저장
    // (order_items 삭제 시 card_items가 ON DELETE CASCADE로 함께 삭제되기 때문)
    let savedCardItemMappings: Array<{ card_id: number; item_id: number | null; sort_order: number; quantity: number }> = []
    if (cardsPreserved) {
      const { results: existingMappings } = await c.env.DB.prepare(`
        SELECT ci.card_id, ci.quantity, oi.item_id, oi.sort_order
        FROM card_items ci
        JOIN order_items oi ON ci.order_item_id = oi.id
        WHERE oi.order_id = ?
      `).bind(id).all()
      savedCardItemMappings = (existingMappings || []).map((m: any) => ({
        card_id: m.card_id,
        item_id: m.item_id,
        sort_order: m.sort_order,
        quantity: m.quantity,
      }))

      await c.env.DB.prepare('DELETE FROM order_items WHERE order_id = ?').bind(id).run()
    }

    // Insert updated order items — two-pass for parent_item_id support
    // Pass 1: parent/regular rows (no parent_client_id) → collect DB IDs
    // N+1 제거: 품목 상세 IN(...) 일괄 선조회 + INSERT db.batch(부모 last_row_id는 결과 인덱스로 매핑)
    const putClientIdMap = new Map<string, number>()

    const putLookupIds = [...new Set(
      (orderData.items as any[])
        .filter((it: any) => it.item_id && !it.item_name)
        .map((it: any) => it.item_id as number)
    )]
    const putItemDetailMap = new Map<number, { item_name: string; category: string; unit: string }>()
    if (putLookupIds.length > 0) {
      const dph = putLookupIds.map(() => '?').join(',')
      const { results: detailRows } = await c.env.DB.prepare(
        `SELECT id, item_name, category, unit FROM items WHERE id IN (${dph})`
      ).bind(...putLookupIds).all<{ id: number; item_name: string; category: string; unit: string }>()
      for (const dr of detailRows) putItemDetailMap.set(dr.id, { item_name: dr.item_name, category: dr.category, unit: dr.unit })
    }

    const putParentStmts: D1PreparedStatement[] = []
    const putParentClientGroupIds: (string | null)[] = []
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
        const itemDetail = putItemDetailMap.get(item.item_id)
        if (itemDetail) {
          itemName = itemDetail.item_name
          categoryName = itemDetail.category
          unit = itemDetail.unit
        }
      }

      const putAssignedEntity = (item.assigned_entity_id !== undefined && item.assigned_entity_id !== null)
        ? item.assigned_entity_id
        : recommendAssignedEntity({ ...item, category_name: categoryName }, getEntityId(c) || 1)
      const putAssignmentStatus = putAssignedEntity ? (item.assignment_status || 'PENDING') : null
      putParentStmts.push(c.env.DB.prepare(`
        INSERT INTO order_items (
          order_id, item_id, item_name, category_name,
          width, height, quantity, unit,
          unit_price, amount, vat_included,
          post_processing, content, specification, sort_order,
          ai_group_index, scale_factor, ai_analysis_id, parent_item_id, finishing, price_status,
          assigned_entity_id, assignment_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)
      `).bind(
        id,
        item.item_id || null,
        itemName || 'Unknown',
        categoryName || null,
        item.width_mm || item.width || null,
        item.height_mm || item.height || null,
        item.quantity || 1,
        unit,
        item.price_status === 'PENDING' ? 0 : (item.unit_price || 0),
        item.price_status === 'PENDING' ? 0 : itemAmount,
        item.vat_included !== undefined ? (item.vat_included ? 1 : 0) : 1,
        item.post_processing || item.paper || null,
        item.content || item.print || null,
        item.specification || null,
        i,
        item.ai_group_index !== undefined ? item.ai_group_index : null,
        item.scale_factor || 1,
        item.ai_analysis_id || null,
        item.finishing || null,
        item.price_status || 'CONFIRMED',
        putAssignedEntity,
        putAssignmentStatus
      ))
      putParentClientGroupIds.push(item.client_group_id || null)
    }
    if (putParentStmts.length > 0) {
      const putParentResults = await c.env.DB.batch(putParentStmts)
      for (let i = 0; i < putParentClientGroupIds.length; i++) {
        const cg = putParentClientGroupIds[i]
        if (cg) putClientIdMap.set(cg, putParentResults[i].meta.last_row_id as number)
      }
    }

    // Pass 2: child rows (has parent_client_id) → resolve parent DB ID (N+1 제거: db.batch)
    const putParentOnlyCount = orderData.items.filter((i: any) => !i.parent_client_id).length
    const putChildStmts: D1PreparedStatement[] = []
    for (let i = 0; i < orderData.items.length; i++) {
      const item = orderData.items[i]
      if (!item.parent_client_id) continue

      const parentDbId = putClientIdMap.get(item.parent_client_id) ?? null

      putChildStmts.push(c.env.DB.prepare(`
        INSERT INTO order_items (
          order_id, item_id, item_name, category_name,
          width, height, quantity, unit,
          unit_price, amount, vat_included,
          post_processing, content, specification, sort_order,
          ai_group_index, scale_factor, ai_analysis_id, parent_item_id,
          assigned_entity_id, assignment_status
        ) VALUES (?, NULL, ?, NULL, ?, ?, ?, ?, 0, 0, 1, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id,
        item.item_name || '',
        item.width_mm || item.width || null,
        item.height_mm || item.height || null,
        item.quantity || 1,
        item.unit || 'EA',
        item.content || null,
        item.specification || null,
        putParentOnlyCount + i,
        item.ai_group_index !== undefined ? item.ai_group_index : null,
        item.scale_factor || 1,
        item.ai_analysis_id || null,
        parentDbId,
        item.assigned_entity_id || null,
        (item.assigned_entity_id ? (item.assignment_status || 'PENDING') : null)
      ))
    }
    if (putChildStmts.length > 0) await c.env.DB.batch(putChildStmts)

    // split billing P2: 품목 담당법인별 청구그룹 재계산(BILLED/PAID 동결은 헬퍼가 처리)
    await recalcOrderBillingGroups(c.env.DB, parseInt(id))

    // #124: 카드 보존 경로 — card_items 재매핑 (item_id + sort_order 기준)
    if (cardsPreserved && savedCardItemMappings.length > 0) {
      // 새로 삽입된 order_items 조회
      const { results: newOrderItems } = await c.env.DB.prepare(`
        SELECT id, item_id, sort_order FROM order_items WHERE order_id = ? ORDER BY sort_order
      `).bind(id).all()

      const remapStmts: any[] = []
      for (const mapping of savedCardItemMappings) {
        // item_id + sort_order로 매칭, 없으면 item_id만으로 매칭
        let matched = (newOrderItems || []).find(
          (oi: any) => oi.item_id === mapping.item_id && oi.sort_order === mapping.sort_order
        )
        if (!matched) {
          matched = (newOrderItems || []).find((oi: any) => oi.item_id === mapping.item_id)
        }
        if (matched) {
          remapStmts.push(
            c.env.DB.prepare(
              `INSERT INTO card_items (card_id, order_item_id, quantity) VALUES (?, ?, ?)`
            ).bind(mapping.card_id, (matched as any).id, mapping.quantity)
          )
        }
      }
      if (remapStmts.length > 0) {
        await c.env.DB.batch(remapStmts)
      }
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

export default ordersCoreRouter
