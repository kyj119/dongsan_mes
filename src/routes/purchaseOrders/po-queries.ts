/**
 * purchaseOrders/po-queries.ts — 발주 통계/조회 라우트 (core.ts에서 분리, 2026-06-12 대형파일 분할 1/4)
 *
 * 상태별 통계(stats) · CSV export · 발주서 인쇄데이터(/:id/invoice) · 담당 입고대기 라인(my-lines·my-lines-count).
 * 배럴(purchaseOrders.ts)에서 core 앞에 마운트(/:id 섀도잉 방지). ⚠️ 이동만, 로직 수정 0.
 */
import { Hono } from 'hono'
import type { HonoEnv } from '../../types/env'
import { authMiddleware } from '../../middleware/auth'
import { requireAnyPagePermission } from '../../middleware/permissions'
import { getEntityId, entityFilter } from '../../utils/entityFilter'
import { getEntityCompanyInfo } from '../../utils/entitySettings'

const poQueriesRouter = new Hono<HonoEnv>()
poQueriesRouter.use('/*', authMiddleware, requireAnyPagePermission('/purchase-orders', '/receiving'))

// ============================================================================
// GET /stats - 상태별 통계 (/:id 보다 먼저 등록)
// ============================================================================
poQueriesRouter.get('/stats', async (c) => {
  try {
    const ef = entityFilter(c)
    const efWhere = ef.params.length > 0 ? ' WHERE entity_id = ?' : ''
    const efAnd = ef.params.length > 0 ? ' AND entity_id = ?' : ''

    const { results } = ef.params.length > 0
      ? await c.env.DB.prepare(`SELECT status, COUNT(*) as count FROM purchase_orders WHERE entity_id = ? GROUP BY status`).bind(...ef.params).all()
      : await c.env.DB.prepare(`SELECT status, COUNT(*) as count FROM purchase_orders GROUP BY status`).all()

    const stats: Record<string, number> = { total: 0 }
    for (const row of results as Record<string, unknown>[]) {
      stats[row.status as string] = row.count as number
      stats.total += row.count as number
    }

    // 납기 지연 카운트
    const overdue = await c.env.DB.prepare(`
      SELECT COUNT(*) as count FROM purchase_orders
      WHERE status IN ('CONFIRMED', 'PARTIAL_RECEIVED')
        AND expected_date IS NOT NULL AND expected_date < date('now', '+9 hours')${efAnd}
    `).bind(...ef.params).first<{ count: number }>()
    stats.overdue = overdue?.count || 0

    // 납기 임박 (D-3 이내)
    const upcoming = await c.env.DB.prepare(`
      SELECT COUNT(*) as count FROM purchase_orders
      WHERE status IN ('CONFIRMED', 'PARTIAL_RECEIVED')
        AND expected_date IS NOT NULL
        AND expected_date >= date('now', '+9 hours')
        AND expected_date <= date('now', '+9 hours', '+3 days')${efAnd}
    `).bind(...ef.params).first<{ count: number }>()
    stats.upcoming = upcoming?.count || 0

    // 이번 달 발주 금액 합계
    const monthlyAmount = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(final_amount), 0) as total
      FROM purchase_orders
      WHERE status NOT IN ('CANCELLED', 'DRAFT')
        AND order_date >= date('now', 'start of month')${efAnd}
    `).bind(...ef.params).first<{ total: number }>()
    stats.monthly_amount = monthlyAmount?.total || 0

    // 공급업체별 미지급 현황 TOP 5
    const { results: supplierBalances } = await c.env.DB.prepare(`
      SELECT c.id, c.client_name, COALESCE(c.purchase_balance, 0) as balance,
        COUNT(po.id) as active_po_count
      FROM clients c
      LEFT JOIN purchase_orders po ON po.supplier_id = c.id AND po.status IN ('CONFIRMED', 'PARTIAL_RECEIVED')${efAnd.replace('entity_id', 'po.entity_id')}
      WHERE c.client_type IN ('PURCHASES', 'BOTH') AND COALESCE(c.purchase_balance, 0) > 0
      GROUP BY c.id
      ORDER BY c.purchase_balance DESC
      LIMIT 5
    `).bind(...ef.params).all()
    ;(stats as Record<string, unknown>).supplier_balances = supplierBalances

    // 재고 부족 알림 수
    try {
      const alertCount = await c.env.DB.prepare(
        `SELECT COUNT(*) as count FROM stock_alerts WHERE status = 'ACTIVE'`
      ).first<{ count: number }>()
      stats.active_alerts = alertCount?.count || 0
    } catch { stats.active_alerts = 0 }

    return c.json({ success: true, data: stats })
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ============================================================================
// GET /export/csv - 발주 목록 CSV 내보내기 (/:id 보다 먼저 등록)
// ============================================================================
poQueriesRouter.get('/export/csv', async (c) => {
  try {
    const { status = '', search = '', date_from = '', date_to = '', supplier_id = '', overdue = '' } = c.req.query()

    let query = `
      SELECT po.*, c.client_name as supplier_name, u.name as created_by_name
      FROM purchase_orders po
      LEFT JOIN clients c ON po.supplier_id = c.id
      LEFT JOIN users u ON po.created_by = u.id
    `
    const params: any[] = []
    const whereClauses: string[] = []

    // #358계열: 발주목록 CSV 법인 격리 — GET / 목록(entityFilter po)과 정합, 타법인 발주 export 차단
    const ef = entityFilter(c, 'po')
    if (ef.clause) { whereClauses.push(ef.clause.replace(' AND ', '')); params.push(...ef.params) }

    if (status) { whereClauses.push('po.status = ?'); params.push(status) }
    if (search) {
      whereClauses.push('(po.po_number LIKE ? OR c.client_name LIKE ?)')
      params.push(`%${search}%`, `%${search}%`)
    }
    if (date_from) { whereClauses.push('po.order_date >= ?'); params.push(date_from) }
    if (date_to) { whereClauses.push('po.order_date <= ?'); params.push(date_to) }
    if (supplier_id) { whereClauses.push('po.supplier_id = ?'); params.push(parseInt(supplier_id)) }
    if (overdue === '1') {
      whereClauses.push("po.status IN ('CONFIRMED', 'PARTIAL_RECEIVED') AND po.expected_date IS NOT NULL AND po.expected_date < date('now', '+9 hours')")
    }
    if (whereClauses.length > 0) query += ' WHERE ' + whereClauses.join(' AND ')
    query += ' ORDER BY po.created_at DESC LIMIT 5001'  // #372: 캡+1 조회로 잘림 감지

    const { results } = await c.env.DB.prepare(query).bind(...params).all()
    const truncated = (results || []).length > 5000
    const exportRows = truncated ? (results || []).slice(0, 5000) : (results || [])

    const statusLabels: Record<string, string> = {
      DRAFT: '임시저장', CONFIRMED: '발주확정', PARTIAL_RECEIVED: '부분입고',
      RECEIVED: '입고완료', CANCELLED: '취소'
    }

    const headers = ['발주번호', '공급업체', '발주일', '납기일', '금액', '상태', '비고', '작성자', '등록일']
    const rows = exportRows.map((po: Record<string, unknown>) => [
      po.po_number as string, po.supplier_name as string, po.order_date as string, po.expected_date as string | null,
      po.final_amount as number, statusLabels[po.status as string] || (po.status as string),
      po.notes as string | null, po.created_by_name as string | null,
      po.created_at ? new Date(po.created_at as string).toLocaleDateString('ko-KR') : ''
    ])

    const { generateCsv, csvResponse, CSV_TRUNCATION_NOTE } = await import('../../utils/csv')
    const today = new Date().toISOString().slice(0, 10)
    return csvResponse(c, `발주목록_${today}.csv`, generateCsv(headers, rows, { footerNote: truncated ? CSV_TRUNCATION_NOTE : undefined }))
  } catch (error) {
    console.error('src/routes/purchaseOrders.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// GET /:id/invoice - 발주서 인쇄 데이터 (/:id 보다 먼저 등록)
// ============================================================================
poQueriesRouter.get('/:id/invoice', async (c) => {
  try {
    const id = c.req.param('id')

    const ef = entityFilter(c, 'po')  // #358계열: 발주 인보이스 조회 법인 격리
    const po = await c.env.DB.prepare(`
      SELECT
        po.*,
        c.client_name as supplier_name,
        u.name as created_by_name,
        u.phone as created_by_phone,
        u.email as created_by_email
      FROM purchase_orders po
      LEFT JOIN clients c ON po.supplier_id = c.id
      LEFT JOIN users u ON po.created_by = u.id
      WHERE po.id = ?${ef.clause}
    `).bind(id, ...ef.params).first()

    if (!po) {
      return c.json({ success: false, error: 'Purchase order not found' }, 404)
    }

    const poRec = po as Record<string, unknown>
    const supplier = poRec.supplier_id
      ? await c.env.DB.prepare(
          `SELECT id, client_code, client_name, representative, business_registration_number,
                  business_type, business_item, phone, mobile, fax, email, address, postal_code,
                  transfer_info, is_active, balance, client_type, delivery_method, auto_billing,
                  price_policy_id, notes, invoice_method, created_at, updated_at
           FROM clients WHERE id = ?`
        ).bind(poRec.supplier_id).first()
      : null

    const { results: items } = await c.env.DB.prepare(`
      SELECT id, po_id, item_id, item_name, category_name, quantity, received_quantity,
             unit, unit_price, price_status, amount, vat_included, sort_order, notes,
             accepted_quantity, rejected_quantity, storage_zone_id, line_status,
             received_by, received_at, created_at, updated_at
      FROM purchase_order_items WHERE po_id = ? ORDER BY sort_order ASC
    `).bind(id).all()

    // Get company settings (entity 우선, 폴백 settings)
    const entityId = (poRec.entity_id as number) || getEntityId(c)
    const company = await getEntityCompanyInfo(c.env.DB, entityId)

    return c.json({
      success: true,
      data: { po, supplier, items, company }
    })
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ============================================================================
// GET /my-lines - 로그인 유저의 담당 창고 입고 대기 라인 (⚠️ /:id 보다 먼저 등록)
// ============================================================================
poQueriesRouter.get('/my-lines', async (c) => {
  try {
    const user = c.get('user')
    if (!user?.id) return c.json({ success: false, error: '인증 필요' }, 401)
    const isSupervisor = user.role === 'ADMIN' || user.role === 'MANAGER'

    const sql = `
      SELECT
        poi.id as po_item_id,
        poi.po_id,
        poi.item_id,
        poi.item_name,
        poi.quantity as ordered_quantity,
        poi.received_quantity,
        poi.unit,
        poi.unit_price,
        poi.line_status,
        poi.received_at,
        po.po_number,
        po.order_date,
        po.expected_date,
        po.status as po_status,
        c.client_name as supplier_name,
        COALESCE(poi.storage_zone_id, i.storage_zone_id) as effective_zone_id,
        sz.zone_name,
        sz.manager_id as zone_manager_id,
        u.name as received_by_name
      FROM purchase_order_items poi
      JOIN purchase_orders po ON po.id = poi.po_id
      LEFT JOIN items i ON i.id = poi.item_id
      LEFT JOIN storage_zones sz ON sz.id = COALESCE(poi.storage_zone_id, i.storage_zone_id)
      LEFT JOIN clients c ON c.id = po.supplier_id
      LEFT JOIN users u ON u.id = poi.received_by
      WHERE poi.line_status IN ('PENDING','PARTIAL')
        AND po.status IN ('CONFIRMED','PARTIAL_RECEIVED')
        AND (
          sz.manager_id = ?
          ${isSupervisor ? "OR sz.manager_id IS NULL OR sz.id IS NULL" : ""}
        )
      ORDER BY po.order_date ASC, poi.id ASC
      LIMIT 200
    `
    const { results } = await c.env.DB.prepare(sql).bind(user.id).all()
    return c.json({ success: true, data: results || [] })
  } catch (err: any) {
    console.error('my-lines error:', err)
    return c.json({ success: false, error: '조회 실패' }, 500)
  }
})

// GET /my-lines-count - 사이드바 배지용 카운트 (⚠️ /:id 보다 먼저)
poQueriesRouter.get('/my-lines-count', async (c) => {
  try {
    const user = c.get('user')
    if (!user?.id) return c.json({ success: false, error: '인증 필요' }, 401)
    const isSupervisor = user.role === 'ADMIN' || user.role === 'MANAGER'

    const sql = `
      SELECT COUNT(*) as cnt
      FROM purchase_order_items poi
      JOIN purchase_orders po ON po.id = poi.po_id
      LEFT JOIN items i ON i.id = poi.item_id
      LEFT JOIN storage_zones sz ON sz.id = COALESCE(poi.storage_zone_id, i.storage_zone_id)
      WHERE poi.line_status IN ('PENDING','PARTIAL')
        AND po.status IN ('CONFIRMED','PARTIAL_RECEIVED')
        AND (
          sz.manager_id = ?
          ${isSupervisor ? "OR sz.manager_id IS NULL OR sz.id IS NULL" : ""}
        )
    `
    const row = await c.env.DB.prepare(sql).bind(user.id).first<{ cnt: number }>()
    return c.json({ success: true, data: { count: Number(row?.cnt || 0) } })
  } catch (err: any) {
    console.error('my-lines-count error:', err)
    return c.json({ success: false, error: '카운트 실패' }, 500)
  }
})


export default poQueriesRouter
