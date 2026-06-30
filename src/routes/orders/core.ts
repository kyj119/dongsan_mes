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
      // #454: cards 참조 비-FK 정리 (cards 삭제 전) — 자동 재고차감 이력
      c.env.DB.prepare('DELETE FROM inventory_auto_deductions WHERE card_id IN (SELECT id FROM cards WHERE order_id = ?)').bind(id),
      // #116: order_id 기반 정리
      c.env.DB.prepare('DELETE FROM customer_claims WHERE order_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM returns WHERE order_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM credit_overrides WHERE order_id = ?').bind(id),
      c.env.DB.prepare(`DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE order_id = ?)`).bind(id),
      c.env.DB.prepare('DELETE FROM shipments WHERE order_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM cards WHERE order_id = ?').bind(id),
      // #454: order_id/order_item_id 기반 비-FK 정리 (order_items 삭제 전 order_item_id SET NULL)
      c.env.DB.prepare('UPDATE print_file_map SET order_item_id = NULL WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id = ?)').bind(id),
      c.env.DB.prepare('DELETE FROM pp_material_deductions WHERE order_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM original_archives WHERE order_id = ?').bind(id),  // ⚠️ R2 객체(archive_url)는 별도 정리 필요
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

export default ordersCoreRouter
