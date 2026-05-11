/**
 * purchaseOrders/core.ts — 발주 CRUD + 상태/조회/특수 (15 routes)
 * 2026-04-15 분할
 */
import { Hono } from 'hono'
import type { HonoEnv } from '../../types/env'
import type { PurchaseOrder, PurchaseOrderItem, ApiResponse, PaginatedResponse } from '../../types/models'
import { authMiddleware, requireRole } from '../../middleware/auth'
import { requireAnyPagePermission } from '../../middleware/permissions'
import { getEntityId, entityFilter } from '../../utils/entityFilter'
import { getEntityCompanyInfo } from '../../utils/entitySettings'

const poCoreRouter = new Hono<HonoEnv>()
// 데이터 권한: /purchase-orders 또는 /receiving 페이지 권한이 있어야 진입.
// 쓰기 권한(POST/PUT/DELETE/PATCH)은 각 엔드포인트에서 requireRole('ADMIN','MANAGER') 로 별도 제한.
poCoreRouter.use('/*', authMiddleware, requireAnyPagePermission('/purchase-orders', '/receiving'))

poCoreRouter.get('/', async (c) => {
  try {
    const {
      page = '1',
      limit = '50',
      status = '',
      search = '',
      sort = 'created_at_desc',
      date_from = '',
      date_to = '',
      supplier_id = '',
      overdue = '',
      receiving = ''
    } = c.req.query()
    const safeLimit = Math.min(parseInt(limit) || 50, 200)
    const offset = (parseInt(page) - 1) * safeLimit

    let query = `
      SELECT
        po.*,
        c.client_name as supplier_name,
        u.name as created_by_name
      FROM purchase_orders po
      LEFT JOIN clients c ON po.supplier_id = c.id
      LEFT JOIN users u ON po.created_by = u.id
    `
    const params: any[] = []
    const whereClauses: string[] = []
    const ef = entityFilter(c, 'po')

    if (receiving === '1') {
      whereClauses.push("po.status IN ('CONFIRMED', 'PARTIAL_RECEIVED')")
    } else if (status) {
      whereClauses.push('po.status = ?')
      params.push(status)
    }

    if (search) {
      whereClauses.push('(po.po_number LIKE ? OR c.client_name LIKE ?)')
      const searchPattern = `%${search}%`
      params.push(searchPattern, searchPattern)
    }

    if (date_from) {
      whereClauses.push('po.order_date >= ?')
      params.push(date_from)
    }
    if (date_to) {
      whereClauses.push('po.order_date <= ?')
      params.push(date_to)
    }

    if (supplier_id) {
      whereClauses.push('po.supplier_id = ?')
      params.push(parseInt(supplier_id))
    }

    if (overdue === '1') {
      whereClauses.push("po.status IN ('CONFIRMED', 'PARTIAL_RECEIVED') AND po.expected_date IS NOT NULL AND po.expected_date < date('now')")
    }

    if (ef.clause) {
      whereClauses.push(ef.clause.replace(' AND ', ''))
      params.push(...ef.params)
    }

    if (whereClauses.length > 0) {
      query += ' WHERE ' + whereClauses.join(' AND ')
    }

    const sortOptions: Record<string, string> = {
      'created_at_desc': 'po.created_at DESC',
      'created_at_asc': 'po.created_at ASC',
      'order_date_desc': 'po.order_date DESC',
      'expected_date_asc': 'po.expected_date ASC NULLS LAST',
      'final_amount_desc': 'po.final_amount DESC'
    }
    const orderBy = sortOptions[sort] || 'po.created_at DESC'

    query += ` ORDER BY ${orderBy} LIMIT ? OFFSET ?`
    params.push(safeLimit, offset)

    const { results } = await c.env.DB.prepare(query).bind(...params).all()

    // COUNT 쿼리
    let countQuery = `SELECT COUNT(*) as count
      FROM purchase_orders po
      LEFT JOIN clients c ON po.supplier_id = c.id`
    const countParams: any[] = []
    const countWhereClauses: string[] = []

    if (receiving === '1') {
      countWhereClauses.push("po.status IN ('CONFIRMED', 'PARTIAL_RECEIVED')")
    } else if (status) {
      countWhereClauses.push('po.status = ?')
      countParams.push(status)
    }
    if (search) {
      countWhereClauses.push('(po.po_number LIKE ? OR c.client_name LIKE ?)')
      const searchPattern = `%${search}%`
      countParams.push(searchPattern, searchPattern)
    }
    if (date_from) {
      countWhereClauses.push('po.order_date >= ?')
      countParams.push(date_from)
    }
    if (date_to) {
      countWhereClauses.push('po.order_date <= ?')
      countParams.push(date_to)
    }
    if (supplier_id) {
      countWhereClauses.push('po.supplier_id = ?')
      countParams.push(parseInt(supplier_id))
    }
    if (overdue === '1') {
      countWhereClauses.push("po.status IN ('CONFIRMED', 'PARTIAL_RECEIVED') AND po.expected_date IS NOT NULL AND po.expected_date < date('now')")
    }
    if (ef.clause) {
      countWhereClauses.push(ef.clause.replace(' AND ', ''))
      countParams.push(...ef.params)
    }
    if (countWhereClauses.length > 0) {
      countQuery += ' WHERE ' + countWhereClauses.join(' AND ')
    }

    const { count } = await c.env.DB.prepare(countQuery).bind(...countParams).first() as any

    const response: PaginatedResponse<PurchaseOrder> = {
      success: true,
      data: results as any,
      pagination: {
        page: parseInt(page),
        limit: safeLimit,
        total: count,
        total_pages: Math.ceil(count / safeLimit)
      }
    }

    return c.json(response)
  } catch (error) {
    console.error('src/routes/purchaseOrders.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ============================================================================
// GET /stats - 상태별 통계 (/:id 보다 먼저 등록)
// ============================================================================
poCoreRouter.get('/stats', async (c) => {
  try {
    const ef = entityFilter(c)
    const efWhere = ef.params.length > 0 ? ' WHERE entity_id = ?' : ''
    const efAnd = ef.params.length > 0 ? ' AND entity_id = ?' : ''

    const { results } = ef.params.length > 0
      ? await c.env.DB.prepare(`SELECT status, COUNT(*) as count FROM purchase_orders WHERE entity_id = ? GROUP BY status`).bind(...ef.params).all()
      : await c.env.DB.prepare(`SELECT status, COUNT(*) as count FROM purchase_orders GROUP BY status`).all()

    const stats: Record<string, number> = { total: 0 }
    for (const row of results as any[]) {
      stats[(row as any).status] = (row as any).count
      stats.total += (row as any).count
    }

    // 납기 지연 카운트
    const overdue = await c.env.DB.prepare(`
      SELECT COUNT(*) as count FROM purchase_orders
      WHERE status IN ('CONFIRMED', 'PARTIAL_RECEIVED')
        AND expected_date IS NOT NULL AND expected_date < date('now')${efAnd}
    `).bind(...ef.params).first() as any
    stats.overdue = overdue?.count || 0

    // 납기 임박 (D-3 이내)
    const upcoming = await c.env.DB.prepare(`
      SELECT COUNT(*) as count FROM purchase_orders
      WHERE status IN ('CONFIRMED', 'PARTIAL_RECEIVED')
        AND expected_date IS NOT NULL
        AND expected_date >= date('now')
        AND expected_date <= date('now', '+3 days')${efAnd}
    `).bind(...ef.params).first() as any
    stats.upcoming = upcoming?.count || 0

    // 이번 달 발주 금액 합계
    const monthlyAmount = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(final_amount), 0) as total
      FROM purchase_orders
      WHERE status NOT IN ('CANCELLED', 'DRAFT')
        AND order_date >= date('now', 'start of month')${efAnd}
    `).bind(...ef.params).first() as any
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
    ;(stats as any).supplier_balances = supplierBalances

    // 재고 부족 알림 수
    try {
      const alertCount = await c.env.DB.prepare(
        `SELECT COUNT(*) as count FROM stock_alerts WHERE status = 'ACTIVE'`
      ).first() as any
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
poCoreRouter.get('/export/csv', async (c) => {
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

    if (status) { whereClauses.push('po.status = ?'); params.push(status) }
    if (search) {
      whereClauses.push('(po.po_number LIKE ? OR c.client_name LIKE ?)')
      params.push(`%${search}%`, `%${search}%`)
    }
    if (date_from) { whereClauses.push('po.order_date >= ?'); params.push(date_from) }
    if (date_to) { whereClauses.push('po.order_date <= ?'); params.push(date_to) }
    if (supplier_id) { whereClauses.push('po.supplier_id = ?'); params.push(parseInt(supplier_id)) }
    if (overdue === '1') {
      whereClauses.push("po.status IN ('CONFIRMED', 'PARTIAL_RECEIVED') AND po.expected_date IS NOT NULL AND po.expected_date < date('now')")
    }
    if (whereClauses.length > 0) query += ' WHERE ' + whereClauses.join(' AND ')
    query += ' ORDER BY po.created_at DESC LIMIT 5000'

    const { results } = await c.env.DB.prepare(query).bind(...params).all() as any

    const statusLabels: Record<string, string> = {
      DRAFT: '임시저장', CONFIRMED: '발주확정', PARTIAL_RECEIVED: '부분입고',
      RECEIVED: '입고완료', CANCELLED: '취소'
    }

    const headers = ['발주번호', '공급업체', '발주일', '납기일', '금액', '상태', '비고', '작성자', '등록일']
    const rows = (results || []).map((po: any) => [
      po.po_number, po.supplier_name, po.order_date, po.expected_date,
      po.final_amount, statusLabels[po.status] || po.status,
      po.notes, po.created_by_name,
      po.created_at ? new Date(po.created_at).toLocaleDateString('ko-KR') : ''
    ])

    const { generateCsv, csvResponse } = await import('../../utils/csv')
    const today = new Date().toISOString().slice(0, 10)
    return csvResponse(c, `발주목록_${today}.csv`, generateCsv(headers, rows))
  } catch (error) {
    console.error('src/routes/purchaseOrders.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// GET /templates - 템플릿 목록
// ============================================================================
poCoreRouter.get('/receipts', async (c) => {
  try {
    const {
      page = '1',
      limit = '20',
      inspection_status = '',
      date_from = '',
      date_to = '',
      search = ''
    } = c.req.query()
    const safeLimit = Math.min(parseInt(limit) || 20, 100)
    const offset = (parseInt(page) - 1) * safeLimit

    let query = `
      SELECT
        ir.id, ir.receipt_number, ir.receipt_date, ir.inspection_status,
        ir.total_amount, ir.notes, ir.po_id, ir.created_at,
        po.po_number, po.expected_date,
        c.client_name as supplier_name,
        u.name as inspector_name,
        (SELECT COUNT(*) FROM inventory_receipt_items WHERE receipt_id = ir.id) as item_count,
        (SELECT COALESCE(SUM(accepted_quantity), 0) FROM inventory_receipt_items WHERE receipt_id = ir.id) as total_accepted,
        (SELECT COALESCE(SUM(rejected_quantity), 0) FROM inventory_receipt_items WHERE receipt_id = ir.id) as total_rejected
      FROM inventory_receipts ir
      LEFT JOIN purchase_orders po ON ir.po_id = po.id
      LEFT JOIN clients c ON ir.supplier_id = c.id
      LEFT JOIN users u ON ir.received_by = u.id
    `
    const params: any[] = []
    const whereClauses: string[] = []

    if (inspection_status) {
      whereClauses.push('ir.inspection_status = ?')
      params.push(inspection_status)
    }
    if (date_from) {
      whereClauses.push('ir.receipt_date >= ?')
      params.push(date_from)
    }
    if (date_to) {
      whereClauses.push('ir.receipt_date <= ?')
      params.push(date_to)
    }
    if (search) {
      whereClauses.push('(ir.receipt_number LIKE ? OR po.po_number LIKE ? OR c.client_name LIKE ?)')
      const p = `%${search}%`
      params.push(p, p, p)
    }

    if (whereClauses.length > 0) {
      query += ' WHERE ' + whereClauses.join(' AND ')
    }
    query += ' ORDER BY ir.created_at DESC LIMIT ? OFFSET ?'
    params.push(safeLimit, offset)

    const { results } = await c.env.DB.prepare(query).bind(...params).all()

    // COUNT
    let countQuery = `
      SELECT COUNT(*) as count
      FROM inventory_receipts ir
      LEFT JOIN purchase_orders po ON ir.po_id = po.id
      LEFT JOIN clients c ON ir.supplier_id = c.id
    `
    const countParams: any[] = []
    const countWhereClauses: string[] = []

    if (inspection_status) {
      countWhereClauses.push('ir.inspection_status = ?')
      countParams.push(inspection_status)
    }
    if (date_from) {
      countWhereClauses.push('ir.receipt_date >= ?')
      countParams.push(date_from)
    }
    if (date_to) {
      countWhereClauses.push('ir.receipt_date <= ?')
      countParams.push(date_to)
    }
    if (search) {
      countWhereClauses.push('(ir.receipt_number LIKE ? OR po.po_number LIKE ? OR c.client_name LIKE ?)')
      const p = `%${search}%`
      countParams.push(p, p, p)
    }

    if (countWhereClauses.length > 0) {
      countQuery += ' WHERE ' + countWhereClauses.join(' AND ')
    }

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
    console.error('src/routes/purchaseOrders.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ============================================================================
// GET /:id/inspections - PO의 검수 이력 조회 (/:id 보다 먼저 등록)
// ============================================================================
poCoreRouter.get('/:id/inspections', async (c) => {
  try {
    const id = c.req.param('id')

    const po = await c.env.DB.prepare(`SELECT id FROM purchase_orders WHERE id = ?`).bind(id).first()
    if (!po) {
      return c.json({ success: false, error: 'Purchase order not found' }, 404)
    }

    const { results: rows } = await c.env.DB.prepare(`
      SELECT
        ir.id as receipt_id,
        ir.receipt_number,
        ir.receipt_date,
        ir.inspection_status,
        ir.notes as receipt_notes,
        u.name as inspector_name,
        iri.id as item_id,
        iri.item_id as inventory_item_id,
        iri.quantity,
        iri.received_quantity,
        iri.accepted_quantity,
        iri.rejected_quantity,
        iri.quality_status,
        iri.reject_memo,
        iri.unit_price,
        iri.amount,
        iri.po_item_id,
        poi.item_name
      FROM inventory_receipts ir
      JOIN inventory_receipt_items iri ON ir.id = iri.receipt_id
      LEFT JOIN users u ON ir.received_by = u.id
      LEFT JOIN purchase_order_items poi ON iri.po_item_id = poi.id
      WHERE ir.po_id = ?
      ORDER BY ir.created_at DESC, iri.id ASC
    `).bind(id).all()

    // receipt_id 기준으로 그룹화
    const inspectionMap = new Map<number, any>()
    for (const row of rows as any[]) {
      if (!inspectionMap.has(row.receipt_id)) {
        inspectionMap.set(row.receipt_id, {
          receipt_id: row.receipt_id,
          receipt_number: row.receipt_number,
          receipt_date: row.receipt_date,
          inspection_status: row.inspection_status,
          receipt_notes: row.receipt_notes,
          inspector_name: row.inspector_name,
          items: []
        })
      }
      inspectionMap.get(row.receipt_id).items.push({
        item_id: row.item_id,
        inventory_item_id: row.inventory_item_id,
        po_item_id: row.po_item_id,
        item_name: row.item_name,
        quantity: row.quantity,
        received_quantity: row.received_quantity,
        accepted_quantity: row.accepted_quantity,
        rejected_quantity: row.rejected_quantity,
        quality_status: row.quality_status,
        reject_memo: row.reject_memo,
        unit_price: row.unit_price,
        amount: row.amount
      })
    }

    return c.json({
      success: true,
      inspections: Array.from(inspectionMap.values())
    })
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ============================================================================
// GET /:id/invoice - 발주서 인쇄 데이터 (/:id 보다 먼저 등록)
// ============================================================================
poCoreRouter.get('/:id/invoice', async (c) => {
  try {
    const id = c.req.param('id')

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
      WHERE po.id = ?
    `).bind(id).first()

    if (!po) {
      return c.json({ success: false, error: 'Purchase order not found' }, 404)
    }

    const supplier = (po as any).supplier_id
      ? await c.env.DB.prepare('SELECT * FROM clients WHERE id = ?').bind((po as any).supplier_id).first()
      : null

    const { results: items } = await c.env.DB.prepare(`
      SELECT * FROM purchase_order_items WHERE po_id = ? ORDER BY sort_order ASC
    `).bind(id).all()

    // Get company settings (entity 우선, 폴백 settings)
    const entityId = (po as any).entity_id || getEntityId(c)
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
// GET /receiving-queue - 입고 대기 PO + 라인 (⚠️ /:id 보다 먼저)
// ============================================================================
// scope=mine (기본 OPERATOR): 내 담당 라인만 / scope=all (ADMIN/MANAGER): 전체
// 응답: PO 카드 렌더용 — PO 헤더 + 대기 라인 배열 (PO별 그룹)
// ============================================================================
poCoreRouter.get('/receiving-queue', async (c) => {
  try {
    const user = c.get('user') as any
    if (!user?.id) return c.json({ success: false, error: '인증 필요' }, 401)
    const scope = c.req.query('scope') || (user.role === 'OPERATOR' ? 'mine' : 'all')
    const isSupervisor = user.role === 'ADMIN' || user.role === 'MANAGER'

    // 담당자 조건 (mine/all 에 따라)
    let lineFilter = ''
    let binds: any[] = []
    if (scope === 'mine') {
      // 내 담당 라인만
      lineFilter = `AND (sz.manager_id = ? ${isSupervisor ? "OR sz.manager_id IS NULL OR sz.id IS NULL" : ""})`
      binds = [user.id]
    } else {
      // all: 관리자만 허용, 그 외는 mine 로 강제
      if (!isSupervisor) {
        lineFilter = `AND (sz.manager_id = ? OR sz.manager_id IS NULL OR sz.id IS NULL)`
        binds = [user.id]
      }
      // ADMIN/MANAGER 이면 모든 라인 (조건 없음)
    }

    const sql = `
      SELECT
        po.id as po_id,
        po.po_number,
        po.order_date,
        po.expected_date,
        po.status as po_status,
        po.total_amount,
        c.client_name as supplier_name,
        poi.id as po_item_id,
        poi.item_id,
        poi.item_name,
        poi.quantity as ordered_quantity,
        poi.received_quantity,
        poi.accepted_quantity,
        poi.rejected_quantity,
        poi.unit,
        poi.unit_price,
        poi.line_status,
        poi.received_at,
        COALESCE(poi.storage_zone_id, i.storage_zone_id) as effective_zone_id,
        sz.zone_name,
        sz.manager_id as zone_manager_id,
        u_mgr.name as zone_manager_name,
        u_rcv.name as received_by_name
      FROM purchase_order_items poi
      JOIN purchase_orders po ON po.id = poi.po_id
      LEFT JOIN items i ON i.id = poi.item_id
      LEFT JOIN storage_zones sz ON sz.id = COALESCE(poi.storage_zone_id, i.storage_zone_id)
      LEFT JOIN clients c ON c.id = po.supplier_id
      LEFT JOIN users u_mgr ON u_mgr.id = sz.manager_id
      LEFT JOIN users u_rcv ON u_rcv.id = poi.received_by
      WHERE poi.line_status IN ('PENDING','PARTIAL')
        AND po.status IN ('CONFIRMED','PARTIAL_RECEIVED')
        ${lineFilter}${entityFilter(c, 'po').clause}
      ORDER BY po.order_date ASC, po.id ASC, poi.sort_order ASC, poi.id ASC
      LIMIT 500
    `

    const { results } = await c.env.DB.prepare(sql).bind(...binds, ...entityFilter(c, 'po').params).all() as any
    const rows = results || []

    // PO 단위 그룹화
    const poMap = new Map<number, any>()
    for (const r of rows) {
      const poId = r.po_id
      if (!poMap.has(poId)) {
        poMap.set(poId, {
          po_id: poId,
          po_number: r.po_number,
          order_date: r.order_date,
          expected_date: r.expected_date,
          po_status: r.po_status,
          total_amount: r.total_amount,
          supplier_name: r.supplier_name,
          lines: []
        })
      }
      poMap.get(poId)!.lines.push({
        po_item_id: r.po_item_id,
        item_id: r.item_id,
        item_name: r.item_name,
        ordered_quantity: r.ordered_quantity,
        received_quantity: r.received_quantity,
        accepted_quantity: r.accepted_quantity,
        rejected_quantity: r.rejected_quantity,
        unit: r.unit,
        unit_price: r.unit_price,
        line_status: r.line_status,
        received_at: r.received_at,
        zone_id: r.effective_zone_id,
        zone_name: r.zone_name,
        zone_manager_id: r.zone_manager_id,
        zone_manager_name: r.zone_manager_name,
        received_by_name: r.received_by_name,
        is_mine: r.zone_manager_id === user.id  // 담당 여부 플래그
      })
    }

    return c.json({
      success: true,
      data: {
        scope,
        user_id: user.id,
        user_role: user.role,
        po_groups: Array.from(poMap.values())
      }
    })
  } catch (err: any) {
    console.error('receiving-queue error:', err)
    return c.json({ success: false, error: '조회 실패' }, 500)
  }
})

// ============================================================================
// GET /my-lines - 로그인 유저의 담당 창고 입고 대기 라인 (⚠️ /:id 보다 먼저 등록)
// ============================================================================
poCoreRouter.get('/my-lines', async (c) => {
  try {
    const user = c.get('user') as any
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
poCoreRouter.get('/my-lines-count', async (c) => {
  try {
    const user = c.get('user') as any
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

// ============================================================================
// GET /:id - 발주 상세
// ============================================================================
poCoreRouter.get('/:id', async (c) => {
  try {
    const id = c.req.param('id')

    const po = await c.env.DB.prepare(`
      SELECT
        po.*,
        c.client_name as supplier_name,
        u.name as created_by_name
      FROM purchase_orders po
      LEFT JOIN clients c ON po.supplier_id = c.id
      LEFT JOIN users u ON po.created_by = u.id
      WHERE po.id = ?
    `).bind(id).first()

    if (!po) {
      return c.json({ success: false, error: 'Purchase order not found' }, 404)
    }

    // 라인 + 효과 창고(items.storage_zone_id 상속 포함) + 담당자명 + 라인상태
    const { results: items } = await c.env.DB.prepare(`
      SELECT
        poi.*,
        i.width_mm AS item_width_mm,
        i.unit AS item_unit,
        COALESCE(poi.storage_zone_id, i.storage_zone_id) AS effective_zone_id,
        sz.zone_name AS zone_name,
        sz.manager_id AS zone_manager_id,
        u_mgr.name AS zone_manager_name,
        u_rcv.name AS received_by_name
      FROM purchase_order_items poi
      LEFT JOIN items i ON i.id = poi.item_id
      LEFT JOIN storage_zones sz ON sz.id = COALESCE(poi.storage_zone_id, i.storage_zone_id)
      LEFT JOIN users u_mgr ON u_mgr.id = sz.manager_id
      LEFT JOIN users u_rcv ON u_rcv.id = poi.received_by
      WHERE poi.po_id = ?
      ORDER BY poi.sort_order ASC
    `).bind(id).all()

    // 원본 발주요청(PR) 역참조
    const { results: sourceRequests } = await c.env.DB.prepare(`
      SELECT pr.id, pr.request_number, pr.urgency, pr.reason, pr.status,
             pr.created_at, u.name as requester_name
      FROM purchase_requests pr
      LEFT JOIN users u ON pr.requester_id = u.id
      WHERE pr.converted_po_id = ?
    `).bind(id).all()

    // 연결된 입고 이력 조회 (Q-Task 6)
    const { results: receipts } = await c.env.DB.prepare(`
      SELECT id, receipt_number, receipt_date, status, inspection_status,
             total_amount, notes, created_at,
             (SELECT COUNT(*) FROM inventory_receipt_items WHERE receipt_id = inventory_receipts.id) AS line_count,
             (SELECT COALESCE(SUM(received_quantity), 0) FROM inventory_receipt_items WHERE receipt_id = inventory_receipts.id) AS total_received,
             (SELECT COALESCE(SUM(rejected_quantity), 0) FROM inventory_receipt_items WHERE receipt_id = inventory_receipts.id) AS total_rejected
      FROM inventory_receipts
      WHERE po_id = ?
      ORDER BY created_at DESC
    `).bind(id).all()

    const response: ApiResponse<any> = {
      success: true,
      data: { ...po, items, source_requests: sourceRequests, receipts: receipts || [] }
    }

    return c.json(response)
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ============================================================================
// POST / - 발주 생성
// ============================================================================
poCoreRouter.post('/', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const user = c.get('user')
    const data = await c.req.json()

    if (!data.supplier_id || !data.items || data.items.length === 0) {
      return c.json({
        success: false,
        error: 'supplier_id and items are required'
      }, 400)
    }

    // 발주번호 자동생성: YYYYMMDD-P001
    const today = new Date()
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '')

    const { max_seq } = await c.env.DB.prepare(`
      SELECT COALESCE(MAX(CAST(SUBSTR(po_number, 11) AS INTEGER)), 0) as max_seq
      FROM purchase_orders WHERE po_number LIKE ?
    `).bind(`${dateStr}-P%`).first() as any

    const poNumber = `${dateStr}-P${String((max_seq || 0) + 1).padStart(3, '0')}`

    // 금액 계산
    let totalAmount = 0
    let vatAmount = 0

    for (const item of data.items) {
      const itemAmount = (item.unit_price || 0) * (item.quantity || 1)
      totalAmount += itemAmount
      if (item.vat_included !== false && item.vat_included !== 0) {
        vatAmount += itemAmount * 0.1
      }
    }

    const finalAmount = totalAmount + vatAmount - (data.discount_amount || 0)

    // data.status가 'CONFIRMED'이면 즉시 확정 상태로 생성
    const initialStatus = data.status === 'CONFIRMED' ? 'CONFIRMED' : 'DRAFT'
    const nowIso = new Date().toISOString()

    // INSERT purchase_orders
    const poResult = await c.env.DB.prepare(`
      INSERT INTO purchase_orders (
        po_number, supplier_id, status,
        order_date, expected_date,
        total_amount, vat_amount, discount_amount, final_amount,
        notes, internal_notes, created_by,
        confirmed_at, confirmed_by,
        delivery_date, delivery_location,
        entity_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      poNumber,
      data.supplier_id,
      initialStatus,
      data.order_date || today.toISOString().split('T')[0],
      data.expected_date || null,
      totalAmount,
      vatAmount,
      data.discount_amount || 0,
      finalAmount,
      data.notes || null,
      data.internal_notes || null,
      user?.id || 1,
      initialStatus === 'CONFIRMED' ? nowIso : null,
      initialStatus === 'CONFIRMED' ? (user?.id || 1) : null,
      data.delivery_date || null,
      data.delivery_location || null,
      getEntityId(c)
    ).run()

    const poId = poResult.meta.last_row_id

    // INSERT purchase_order_items
    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i]
      let itemName = item.item_name || null
      let categoryName = item.category_name || null
      let unit = item.unit || 'EA'

      if (item.item_id && !itemName) {
        const itemDetail = await c.env.DB.prepare(`
          SELECT item_name, category, unit FROM items WHERE id = ?
        `).bind(item.item_id).first() as any
        if (itemDetail) {
          itemName = itemDetail.item_name
          categoryName = itemDetail.category
          unit = itemDetail.unit
        }
      }

      const itemAmount = (item.unit_price || 0) * (item.quantity || 1)

      await c.env.DB.prepare(`
        INSERT INTO purchase_order_items (
          po_id, item_id, item_name, category_name,
          quantity, received_quantity, unit,
          unit_price, amount, vat_included,
          sort_order, notes
        ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)
      `).bind(
        poId,
        item.item_id || null,
        itemName || '미지정',
        categoryName || null,
        item.quantity || 1,
        unit,
        item.unit_price || 0,
        itemAmount,
        item.vat_included !== undefined ? (item.vat_included ? 1 : 0) : 1,
        i,
        item.notes || null
      ).run()
    }

    // 상태 이력 기록 (DRAFT 초기 항상 추가)
    await c.env.DB.prepare(`
      INSERT INTO po_status_history (po_id, to_status, changed_by, change_reason)
      VALUES (?, 'DRAFT', ?, '발주 생성')
    `).bind(poId, user?.id || 1).run()

    // CONFIRMED로 생성된 경우: 추가 이력 + purchase_balance 업데이트
    if (initialStatus === 'CONFIRMED') {
      await c.env.DB.prepare(`
        INSERT INTO po_status_history (po_id, from_status, to_status, changed_by, change_reason)
        VALUES (?, 'DRAFT', 'CONFIRMED', ?, '발주 생성 시 즉시 확정')
      `).bind(poId, user?.id || 1).run()

      await c.env.DB.prepare(`
        UPDATE clients SET purchase_balance = COALESCE(purchase_balance, 0) + ?,
        updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).bind(finalAmount, data.supplier_id).run()
    }

    return c.json({
      success: true,
      data: { po_number: poNumber, po_id: poId },
      message: initialStatus === 'CONFIRMED' ? '발주가 확정 상태로 생성되었습니다.' : '발주가 생성되었습니다.'
    }, 201)
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ============================================================================
// PUT /:id - 발주 수정
// ============================================================================
poCoreRouter.put('/:id', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const user = c.get('user')
    const id = c.req.param('id')
    const data = await c.req.json()

    const po = await c.env.DB.prepare(`
      SELECT * FROM purchase_orders WHERE id = ?
    `).bind(id).first() as any

    if (!po) {
      return c.json({ success: false, error: 'Purchase order not found' }, 404)
    }

    if (!['DRAFT', 'CONFIRMED'].includes(po.status)) {
      return c.json({
        success: false,
        error: `'${po.status}' 상태에서는 수정할 수 없습니다. DRAFT 또는 CONFIRMED 상태만 수정 가능합니다.`
      }, 400)
    }

    if (!data.items || data.items.length === 0) {
      return c.json({ success: false, error: 'items are required' }, 400)
    }

    const prevSupplierId: number = po.supplier_id
    const prevFinalAmount: number = po.final_amount
    const newSupplierId: number = data.supplier_id || prevSupplierId
    const supplierChanged = newSupplierId !== prevSupplierId

    // 금액 재계산
    let totalAmount = 0
    let vatAmount = 0

    for (const item of data.items) {
      const itemAmount = (item.unit_price || 0) * (item.quantity || 1)
      totalAmount += itemAmount
      if (item.vat_included !== false && item.vat_included !== 0) {
        vatAmount += itemAmount * 0.1
      }
    }

    const finalAmount = totalAmount + vatAmount - (data.discount_amount !== undefined ? data.discount_amount : po.discount_amount)

    // purchase_balance 재조정 (CONFIRMED 상태일 때만)
    if (po.status === 'CONFIRMED') {
      if (supplierChanged) {
        // 이전 공급업체 잔액 차감
        await c.env.DB.prepare(`
          UPDATE clients SET purchase_balance = purchase_balance - ?,
          updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).bind(prevFinalAmount, prevSupplierId).run()

        // 새 공급업체 잔액 증가
        await c.env.DB.prepare(`
          UPDATE clients SET purchase_balance = purchase_balance + ?,
          updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).bind(finalAmount, newSupplierId).run()
      } else {
        // 같은 공급업체: 차액만 조정
        const diff = finalAmount - prevFinalAmount
        if (diff !== 0) {
          await c.env.DB.prepare(`
            UPDATE clients SET purchase_balance = purchase_balance + ?,
            updated_at = CURRENT_TIMESTAMP WHERE id = ?
          `).bind(diff, newSupplierId).run()
        }
      }
    }

    // 발주 헤더 업데이트
    await c.env.DB.prepare(`
      UPDATE purchase_orders SET
        supplier_id = ?,
        order_date = ?,
        expected_date = ?,
        total_amount = ?,
        vat_amount = ?,
        discount_amount = ?,
        final_amount = ?,
        notes = ?,
        internal_notes = ?,
        updated_by = ?,
        delivery_date = ?,
        delivery_location = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      newSupplierId,
      data.order_date || po.order_date,
      data.expected_date !== undefined ? data.expected_date : po.expected_date,
      totalAmount,
      vatAmount,
      data.discount_amount !== undefined ? data.discount_amount : po.discount_amount,
      finalAmount,
      data.notes !== undefined ? data.notes : po.notes,
      data.internal_notes !== undefined ? data.internal_notes : po.internal_notes,
      user?.id || 1,
      data.delivery_date !== undefined ? data.delivery_date : (po as any).delivery_date,
      data.delivery_location !== undefined ? data.delivery_location : (po as any).delivery_location,
      id
    ).run()

    // 기존 품목 삭제 → 새로 INSERT
    await c.env.DB.prepare(`
      DELETE FROM purchase_order_items WHERE po_id = ?
    `).bind(id).run()

    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i]
      let itemName = item.item_name || null
      let categoryName = item.category_name || null
      let unit = item.unit || 'EA'

      if (item.item_id && !itemName) {
        const itemDetail = await c.env.DB.prepare(`
          SELECT item_name, category, unit FROM items WHERE id = ?
        `).bind(item.item_id).first() as any
        if (itemDetail) {
          itemName = itemDetail.item_name
          categoryName = itemDetail.category
          unit = itemDetail.unit
        }
      }

      const itemAmount = (item.unit_price || 0) * (item.quantity || 1)

      await c.env.DB.prepare(`
        INSERT INTO purchase_order_items (
          po_id, item_id, item_name, category_name,
          quantity, received_quantity, unit,
          unit_price, amount, vat_included,
          sort_order, notes
        ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)
      `).bind(
        parseInt(id),
        item.item_id || null,
        itemName || '미지정',
        categoryName || null,
        item.quantity || 1,
        unit,
        item.unit_price || 0,
        itemAmount,
        item.vat_included !== undefined ? (item.vat_included ? 1 : 0) : 1,
        i,
        item.notes || null
      ).run()
    }

    return c.json({
      success: true,
      message: '발주가 수정되었습니다.'
    })
  } catch (error) {
    console.error('src/routes/purchaseOrders.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ============================================================================
// PATCH /:id/status - 상태 변경
// ============================================================================
poCoreRouter.patch('/:id/status', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const user = c.get('user')
    const id = c.req.param('id')
    const { status: newStatus, change_reason } = await c.req.json()

    if (!newStatus) {
      return c.json({ success: false, error: 'status is required' }, 400)
    }

    const po = await c.env.DB.prepare(`
      SELECT * FROM purchase_orders WHERE id = ?
    `).bind(id).first() as any

    if (!po) {
      return c.json({ success: false, error: 'Purchase order not found' }, 404)
    }

    const validTransitions: Record<string, string[]> = {
      'DRAFT':            ['CONFIRMED', 'CANCELLED'],
      'CONFIRMED':        ['PARTIAL_RECEIVED', 'RECEIVED', 'DRAFT', 'CANCELLED'],
      'PARTIAL_RECEIVED': ['RECEIVED', 'CANCELLED'],
      'RECEIVED':         [],
      'CANCELLED':        ['DRAFT'],
    }

    const allowed = validTransitions[po.status] || []
    if (!allowed.includes(newStatus)) {
      return c.json({
        success: false,
        error: `'${po.status}' → '${newStatus}' 전환은 허용되지 않습니다. 가능한 상태: ${allowed.join(', ') || '없음'}`
      }, 400)
    }

    // 상태 전환별 purchase_balance 조정
    if (newStatus === 'CONFIRMED' && po.status === 'DRAFT') {
      // DRAFT → CONFIRMED: balance 증가
      await c.env.DB.prepare(`
        UPDATE clients SET purchase_balance = purchase_balance + ?,
        updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).bind(po.final_amount, po.supplier_id).run()
    } else if (newStatus === 'DRAFT' && po.status === 'CONFIRMED') {
      // CONFIRMED → DRAFT: balance 롤백
      await c.env.DB.prepare(`
        UPDATE clients SET purchase_balance = purchase_balance - ?,
        updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).bind(po.final_amount, po.supplier_id).run()
    } else if (newStatus === 'CANCELLED' && (po.status === 'CONFIRMED' || po.status === 'PARTIAL_RECEIVED')) {
      // CONFIRMED/PARTIAL_RECEIVED → CANCELLED: balance 감소
      await c.env.DB.prepare(`
        UPDATE clients SET purchase_balance = purchase_balance - ?,
        updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).bind(po.final_amount, po.supplier_id).run()
    }
    // CANCELLED → DRAFT: balance 변경 없음 (다시 CONFIRMED 시 증가)

    // confirmed_at, confirmed_by 설정 (DRAFT → CONFIRMED 전환 시)
    if (newStatus === 'CONFIRMED' && po.status === 'DRAFT') {
      await c.env.DB.prepare(`
        UPDATE purchase_orders SET
          status = ?,
          confirmed_at = CURRENT_TIMESTAMP,
          confirmed_by = ?,
          updated_by = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(newStatus, user?.id || 1, user?.id || 1, id).run()
    } else {
      await c.env.DB.prepare(`
        UPDATE purchase_orders SET
          status = ?,
          updated_by = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(newStatus, user?.id || 1, id).run()
    }

    // 상태 이력 기록
    await c.env.DB.prepare(`
      INSERT INTO po_status_history (po_id, from_status, to_status, changed_by, change_reason)
      VALUES (?, ?, ?, ?, ?)
    `).bind(parseInt(id), po.status, newStatus, user?.id || 1, change_reason || null).run()

    return c.json({
      success: true,
      message: `발주 상태가 '${newStatus}'으로 변경되었습니다.`
    })
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ============================================================================
// POST /:id/receive - 입고 처리
// ============================================================================
poCoreRouter.post('/:id/receive', async (c) => {
  try {
    const user = c.get('user')
    const id = c.req.param('id')
    const { items: receiveItems, receipt_date, notes } = await c.req.json()

    if (!receiveItems || receiveItems.length === 0) {
      return c.json({ success: false, error: 'items are required' }, 400)
    }

    const po = await c.env.DB.prepare(`
      SELECT * FROM purchase_orders WHERE id = ?
    `).bind(id).first() as any

    if (!po) {
      return c.json({ success: false, error: 'Purchase order not found' }, 404)
    }

    if (!['CONFIRMED', 'PARTIAL_RECEIVED'].includes(po.status)) {
      return c.json({
        success: false,
        error: `'${po.status}' 상태에서는 입고 처리할 수 없습니다. CONFIRMED 또는 PARTIAL_RECEIVED 상태만 가능합니다.`
      }, 400)
    }

    const receiptDate = receipt_date || new Date().toISOString().split('T')[0]

    // 입고 번호 생성: RCV-YYYYMMDD-001
    const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '')
    const { results: countResults } = await c.env.DB.prepare(`
      SELECT COUNT(*) as count FROM inventory_receipts WHERE receipt_number LIKE ?
    `).bind(`RCV-${dateStr}%`).all()

    const sequence = (((countResults[0] as any).count || 0) + 1).toString().padStart(3, '0')
    const receiptNumber = `RCV-${dateStr}-${sequence}`

    // po_item 정보 로딩
    const { results: poItems } = await c.env.DB.prepare(`
      SELECT * FROM purchase_order_items WHERE po_id = ?
    `).bind(id).all()

    const poItemMap = new Map<number, any>()
    for (const pi of poItems as any[]) {
      poItemMap.set((pi as any).id, pi)
    }

    // 수량 초과 검증 + 입고 총액 계산
    // 하위호환: received_quantity 없으면 quantity 사용
    let receiptTotalAmount = 0
    for (const ri of receiveItems) {
      const poItem = poItemMap.get(ri.po_item_id)
      if (!poItem) {
        return c.json({
          success: false,
          error: `po_item_id ${ri.po_item_id}가 이 발주에 존재하지 않습니다.`
        }, 400)
      }
      const receiveQty: number = Number(ri.received_quantity ?? ri.quantity ?? 0)
      const acceptedQty: number = ri.accepted_quantity !== undefined ? Number(ri.accepted_quantity) : receiveQty
      const rejectedQty: number = ri.rejected_quantity !== undefined ? Number(ri.rejected_quantity) : 0

      // 합격 + 불합격 = 수령 수량 검증
      if (Math.abs((acceptedQty + rejectedQty) - receiveQty) > 0.0001) {
        return c.json({
          success: false,
          error: `품목 '${(poItem as any).item_name}': 합격(${acceptedQty}) + 불합격(${rejectedQty}) = ${acceptedQty + rejectedQty} 이 수령수량(${receiveQty})과 일치하지 않습니다.`
        }, 400)
      }

      const remaining = (poItem as any).quantity - (poItem as any).received_quantity
      if (receiveQty > remaining) {
        return c.json({
          success: false,
          error: `품목 '${(poItem as any).item_name}': 입고 가능 수량(${remaining})을 초과했습니다. 요청: ${receiveQty}`
        }, 400)
      }
      receiptTotalAmount += receiveQty * ((poItem as any).unit_price || 0)
    }

    // ============================================================================
    // Phase 1: 선행 SELECT (재고 조회) + 쓰기 전 전체 계산
    // ============================================================================
    const perItemPrep: Array<{
      poItemId: number
      itemId: number | null
      receiveQty: number
      acceptedQty: number
      rejectedQty: number
      unitPrice: number
      amount: number
      qualityStatus: string
      rejectMemo: string | null
      balanceAfter: number
      hasInventoryRow: boolean
    }> = []
    let summaryAccepted = 0
    let summaryRejected = 0

    for (const ri of receiveItems) {
      const poItem = poItemMap.get(ri.po_item_id) as any
      const receiveQty: number = Number(ri.received_quantity ?? ri.quantity ?? 0)
      const acceptedQty: number = ri.accepted_quantity !== undefined ? Number(ri.accepted_quantity) : receiveQty
      const rejectedQty: number = ri.rejected_quantity !== undefined ? Number(ri.rejected_quantity) : 0
      const unitPrice: number = poItem.unit_price || 0
      const amount = receiveQty * unitPrice
      const qualityStatus = rejectedQty === 0 ? 'PASSED' : acceptedQty === 0 ? 'FAILED' : 'PARTIAL'

      let balanceAfter = 0
      let hasInventoryRow = false
      if (poItem.item_id && acceptedQty > 0) {
        const invRow = await c.env.DB.prepare(
          `SELECT quantity FROM inventory WHERE item_id = ?`
        ).bind(poItem.item_id).first() as any
        const currentStock = Number(invRow?.quantity || 0)
        hasInventoryRow = !!invRow
        balanceAfter = currentStock + acceptedQty
      }

      perItemPrep.push({
        poItemId: ri.po_item_id,
        itemId: poItem.item_id || null,
        receiveQty, acceptedQty, rejectedQty, unitPrice, amount, qualityStatus,
        rejectMemo: ri.reject_memo || null,
        balanceAfter, hasInventoryRow,
      })
      summaryAccepted += acceptedQty
      summaryRejected += rejectedQty
    }

    // 워크플로우 상태: 정상(전량) → NORMAL, 부족/거부 1개라도 → PENDING_REVIEW (관리자 결정 대기)
    //   (이전 PASSED/FAILED/PARTIAL 값은 InspectionQualityStatus enum — 관리자 결정 UI 필터와 불일치였음)
    const inspectionStatusForReceipt = summaryRejected === 0 ? 'NORMAL' : 'PENDING_REVIEW'

    // 새 PO status 사전 계산 (in-memory, 쓰기 전)
    const willAllReceived = (poItems as any[]).every((pi: any) => {
      const match = perItemPrep.find(p => p.poItemId === pi.id)
      const afterReceived = Number(pi.received_quantity || 0) + (match ? match.receiveQty : 0)
      return afterReceived >= Number(pi.quantity)
    })
    const prevStatus = po.status
    const newStatus = willAllReceived ? 'RECEIVED' : 'PARTIAL_RECEIVED'

    // ============================================================================
    // Phase 2: 부모 INSERT (receipt_id 획득 필요)
    // ============================================================================
    const receiptResult = await c.env.DB.prepare(`
      INSERT INTO inventory_receipts (
        receipt_number, receipt_date, supplier, total_amount,
        status, received_by, notes, po_id, supplier_id
      ) VALUES (?, ?, ?, ?, 'COMPLETED', ?, ?, ?, ?)
    `).bind(
      receiptNumber,
      receiptDate,
      String(po.supplier_id || ''),
      receiptTotalAmount,
      user?.id || 1,
      notes || null,
      parseInt(id),
      po.supplier_id || null
    ).run()

    const receiptId = receiptResult.meta.last_row_id

    // ============================================================================
    // Phase 3: 원자적 batch 쓰기 (실패 시 부모 receipt 보상 삭제)
    // ============================================================================
    try {
      const stmts: ReturnType<typeof c.env.DB.prepare>[] = []

      for (const p of perItemPrep) {
        // purchase_order_items 누적 update + line_status 재계산 + 담당자 이력
        //   - 기존 received_quantity + 이번 receiveQty >= ordered quantity → RECEIVED
        //   - 아니면 PARTIAL
        //   - line_status 는 INSERT/UPDATE 시점에 CASE 문으로 결정
        stmts.push(c.env.DB.prepare(`
          UPDATE purchase_order_items
          SET received_quantity = received_quantity + ?,
              accepted_quantity = accepted_quantity + ?,
              rejected_quantity = rejected_quantity + ?,
              line_status = CASE
                WHEN (received_quantity + ?) >= quantity THEN 'RECEIVED'
                ELSE 'PARTIAL'
              END,
              received_by = ?,
              received_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(p.receiveQty, p.acceptedQty, p.rejectedQty, p.receiveQty, user?.id || null, p.poItemId))

        // inventory_receipt_items 라인 insert
        stmts.push(c.env.DB.prepare(`
          INSERT INTO inventory_receipt_items (
            receipt_id, item_id, quantity, unit_price, amount,
            received_quantity, accepted_quantity, rejected_quantity,
            quality_status, reject_memo, po_item_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          receiptId, p.itemId ?? null, p.receiveQty, p.unitPrice, p.amount,
          p.receiveQty, p.acceptedQty, p.rejectedQty,
          p.qualityStatus, p.rejectMemo, p.poItemId
        ))

        // inventory stock + transaction (합격 수량 있을 때만)
        if (p.itemId && p.acceptedQty > 0) {
          if (p.hasInventoryRow) {
            stmts.push(c.env.DB.prepare(`
              UPDATE inventory SET quantity = ?, last_updated = CURRENT_TIMESTAMP WHERE item_id = ?
            `).bind(p.balanceAfter, p.itemId))
          } else {
            stmts.push(c.env.DB.prepare(`
              INSERT INTO inventory (item_id, quantity, last_updated) VALUES (?, ?, CURRENT_TIMESTAMP)
            `).bind(p.itemId, p.balanceAfter))
          }

          stmts.push(c.env.DB.prepare(`
            INSERT INTO inventory_transactions (
              item_id, transaction_type, transaction_date, quantity,
              unit_price, total_amount, reference_type, reference_id,
              balance_after, reason, handled_by, entity_id
            ) VALUES (?, 'IN', ?, ?, ?, ?, 'PURCHASE', ?, ?, '발주입고(합격분)', ?, ?)
          `).bind(
            p.itemId, receiptDate, p.acceptedQty, p.unitPrice,
            p.acceptedQty * p.unitPrice, receiptId, p.balanceAfter, user?.id || 1,
            getEntityId(c) || 1
          ))
        }
      }

      // inventory_receipts.inspection_status 업데이트 (사전계산값 사용)
      stmts.push(c.env.DB.prepare(`
        UPDATE inventory_receipts SET inspection_status = ? WHERE id = ?
      `).bind(inspectionStatusForReceipt, receiptId))

      // purchase_orders status 업데이트 (사전계산값 사용)
      stmts.push(c.env.DB.prepare(`
        UPDATE purchase_orders SET status = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).bind(newStatus, user?.id || 1, id))

      // 상태 변경 시만 이력
      if (newStatus !== prevStatus) {
        stmts.push(c.env.DB.prepare(`
          INSERT INTO po_status_history (po_id, from_status, to_status, changed_by, change_reason)
          VALUES (?, ?, ?, ?, '입고 처리')
        `).bind(parseInt(id), prevStatus, newStatus, user?.id || 1))
      }

      await c.env.DB.batch(stmts)
    } catch (batchErr) {
      // 보상 트랜잭션: 이미 삽입된 부모 receipt 삭제
      try {
        await c.env.DB.prepare(`DELETE FROM inventory_receipts WHERE id = ?`).bind(receiptId).run()
      } catch (_) { /* best effort */ }
      throw batchErr
    }

    // PENDING_REVIEW 시 ADMIN/MANAGER에게 알림 자동 생성 (트랜잭션 밖 — 알림 실패가 입고를 롤백하면 안 됨)
    if (inspectionStatusForReceipt === 'PENDING_REVIEW') {
      try {
        const poNumber = po.po_number as string
        const title = '[검수 대기] ' + poNumber + ' 부족 수량 감지'
        const message = poNumber + ' 발주의 입고 수량이 발주 수량보다 부족합니다. 관리자 확인이 필요합니다.'
        const existing = await c.env.DB.prepare(
          `SELECT id FROM notifications WHERE target_role = 'ADMIN' AND title = ? AND date(created_at) = date('now') LIMIT 1`
        ).bind(title).first()
        if (!existing) {
          await c.env.DB.prepare(
            `INSERT INTO notifications (target_role, title, message, link) VALUES ('ADMIN', ?, ?, '/inspections')`
          ).bind(title, message).run()
        }
      } catch (notifErr) {
        console.warn('purchaseOrders receive: notification insert failed (non-fatal)', notifErr)
      }
    }

    return c.json({
      success: true,
      data: {
        receipt_number: receiptNumber,
        receipt_id: receiptId,
        po_status: newStatus,
        inspection_status: inspectionStatusForReceipt
      },
      message: `입고 처리 완료. 발주 상태: ${newStatus}`
    })
  } catch (error: any) {
    console.error('purchaseOrders receive error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ============================================================================
// POST /:id/copy - 발주 복사
// ============================================================================
poCoreRouter.post('/:id/copy', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const user = c.get('user')
    const id = c.req.param('id')

    const po = await c.env.DB.prepare(`
      SELECT * FROM purchase_orders WHERE id = ?
    `).bind(id).first() as any

    if (!po) {
      return c.json({ success: false, error: 'Purchase order not found' }, 404)
    }

    const { results: originalItems } = await c.env.DB.prepare(`
      SELECT * FROM purchase_order_items WHERE po_id = ? ORDER BY sort_order ASC
    `).bind(id).all()

    // 새 발주번호 생성
    const today = new Date()
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '')

    const { max_seq } = await c.env.DB.prepare(`
      SELECT COALESCE(MAX(CAST(SUBSTR(po_number, 11) AS INTEGER)), 0) as max_seq
      FROM purchase_orders WHERE po_number LIKE ?
    `).bind(`${dateStr}-P%`).first() as any

    const newPoNumber = `${dateStr}-P${String((max_seq || 0) + 1).padStart(3, '0')}`

    // 새 발주 INSERT (DRAFT 상태, balance 미반영)
    const newPoResult = await c.env.DB.prepare(`
      INSERT INTO purchase_orders (
        po_number, supplier_id, status,
        order_date, expected_date,
        total_amount, vat_amount, discount_amount, final_amount,
        notes, internal_notes, created_by, entity_id
      ) VALUES (?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      newPoNumber,
      po.supplier_id,
      today.toISOString().split('T')[0],
      po.expected_date || null,
      po.total_amount,
      po.vat_amount,
      po.discount_amount,
      po.final_amount,
      po.notes ? `[복사] ${po.notes}` : null,
      po.internal_notes || null,
      user?.id || 1,
      getEntityId(c) || 1
    ).run()

    const newPoId = newPoResult.meta.last_row_id

    // 품목 복사 (received_quantity=0으로 초기화)
    for (const item of originalItems as any[]) {
      await c.env.DB.prepare(`
        INSERT INTO purchase_order_items (
          po_id, item_id, item_name, category_name,
          quantity, received_quantity, unit,
          unit_price, amount, vat_included,
          sort_order, notes
        ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)
      `).bind(
        newPoId,
        (item as any).item_id || null,
        (item as any).item_name,
        (item as any).category_name || null,
        (item as any).quantity,
        (item as any).unit || 'EA',
        (item as any).unit_price || 0,
        (item as any).amount || 0,
        (item as any).vat_included,
        (item as any).sort_order || 0,
        (item as any).notes || null
      ).run()
    }

    // 상태 이력 기록
    await c.env.DB.prepare(`
      INSERT INTO po_status_history (po_id, to_status, changed_by, change_reason)
      VALUES (?, 'DRAFT', ?, ?)
    `).bind(newPoId, user?.id || 1, `발주 #${po.po_number} 복사`).run()

    return c.json({
      success: true,
      data: { po_number: newPoNumber, po_id: newPoId },
      message: '발주가 복사되었습니다.'
    }, 201)
  } catch (error) {
    console.error('src/routes/purchaseOrders.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ============================================================================
// DELETE /:id - 발주 삭제
// ============================================================================
poCoreRouter.delete('/:id', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const user = c.get('user')
    const id = c.req.param('id')

    const po = await c.env.DB.prepare(`
      SELECT * FROM purchase_orders WHERE id = ?
    `).bind(id).first() as any

    if (!po) {
      return c.json({ success: false, error: 'Purchase order not found' }, 404)
    }

    if (['PARTIAL_RECEIVED', 'RECEIVED'].includes(po.status)) {
      return c.json({
        success: false,
        error: `'${po.status}' 상태의 발주는 삭제할 수 없습니다.`
      }, 400)
    }

    if (po.status === 'CONFIRMED') {
      // 소프트 삭제: CANCELLED 전환 + purchase_balance 차감
      await c.env.DB.prepare(`
        UPDATE clients SET purchase_balance = purchase_balance - ?,
        updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).bind(po.final_amount, po.supplier_id).run()

      await c.env.DB.prepare(`
        UPDATE purchase_orders SET
          status = 'CANCELLED',
          updated_by = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind((user?.id) || null, id).run()

      await c.env.DB.prepare(`
        INSERT INTO po_status_history (po_id, from_status, to_status, changed_by, change_reason)
        VALUES (?, 'CONFIRMED', 'CANCELLED', ?, '발주 삭제(확정 취소)')
      `).bind(parseInt(id), (user?.id) || null).run()

      return c.json({
        success: true,
        message: '확정된 발주가 취소되었습니다.'
      })
    } else {
      await c.env.DB.prepare(`
        DELETE FROM purchase_orders WHERE id = ?
      `).bind(id).run()

      return c.json({
        success: true,
        message: '발주가 삭제되었습니다.'
      })
    }
  } catch (error) {
    console.error('src/routes/purchaseOrders.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다'
    }, 500)
  }
})

// ============================================================================
// POST /:id/reorder - 원클릭 재발주 (이전 PO 기반으로 새 PO 생성, 바로 CONFIRMED)
// ============================================================================
poCoreRouter.post('/:id/reorder', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')
    const user = c.get('user') as any
    const body: { status?: string } = await c.req.json<{ status?: string }>().catch(() => ({}))
    const targetStatus = body.status || 'CONFIRMED'

    // 원본 PO 조회
    const originalPo = await c.env.DB.prepare(`
      SELECT * FROM purchase_orders WHERE id = ?
    `).bind(id).first() as any
    if (!originalPo) {
      return c.json({ success: false, error: '원본 발주서를 찾을 수 없습니다.' }, 404)
    }

    // 원본 PO 아이템 조회
    const { results: originalItems } = await c.env.DB.prepare(`
      SELECT * FROM purchase_order_items WHERE po_id = ? ORDER BY sort_order
    `).bind(id).all() as any

    // 새 PO 번호 생성
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const lastPo = await c.env.DB.prepare(
      `SELECT po_number FROM purchase_orders WHERE po_number LIKE ? ORDER BY po_number DESC LIMIT 1`
    ).bind(`${today}-P%`).first() as any
    let seq = 1
    if (lastPo) {
      const lastSeq = parseInt(lastPo.po_number.split('-P')[1])
      if (!isNaN(lastSeq)) seq = lastSeq + 1
    }
    const poNumber = `${today}-P${String(seq).padStart(3, '0')}`

    // 새 PO 생성
    const result = await c.env.DB.prepare(`
      INSERT INTO purchase_orders (po_number, supplier_id, status, order_date, expected_date, delivery_location,
        total_amount, vat_amount, discount_amount, final_amount, notes, internal_notes,
        source_po_id, created_by, updated_by, entity_id, confirmed_at, confirmed_by)
      VALUES (?, ?, ?, date('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${targetStatus === 'CONFIRMED' ? "datetime('now')" : 'NULL'}, ${targetStatus === 'CONFIRMED' ? '?' : 'NULL'})
    `).bind(
      poNumber,
      originalPo.supplier_id,
      targetStatus,
      originalPo.expected_date,
      originalPo.delivery_location || null,
      originalPo.total_amount,
      originalPo.vat_amount,
      originalPo.discount_amount || 0,
      originalPo.final_amount,
      originalPo.notes || null,
      `재발주 (원본: ${originalPo.po_number})`,
      id,
      user.id,
      user.id,
      getEntityId(c) || 1,
      ...(targetStatus === 'CONFIRMED' ? [user.id] : [])
    ).run()

    const newPoId = result.meta.last_row_id

    // 아이템 복사 (수량 초기화)
    for (const item of originalItems) {
      await c.env.DB.prepare(`
        INSERT INTO purchase_order_items (po_id, item_id, item_name, category_name, quantity,
          received_quantity, accepted_quantity, rejected_quantity,
          unit, unit_price, amount, vat_included, sort_order, notes)
        VALUES (?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?, ?, ?, ?)
      `).bind(
        newPoId, item.item_id, item.item_name, item.category_name, item.quantity,
        item.unit, item.unit_price, item.amount, item.vat_included, item.sort_order, item.notes
      ).run()
    }

    // 상태 이력 기록
    await c.env.DB.prepare(`
      INSERT INTO po_status_history (po_id, from_status, to_status, changed_by, change_reason)
      VALUES (?, NULL, ?, ?, ?)
    `).bind(newPoId, targetStatus, user.id, `재발주 생성 (원본: ${originalPo.po_number})`).run()

    // CONFIRMED면 매입잔액 업데이트
    if (targetStatus === 'CONFIRMED') {
      await c.env.DB.prepare(`
        UPDATE clients SET purchase_balance = COALESCE(purchase_balance, 0) + ? WHERE id = ?
      `).bind(originalPo.final_amount, originalPo.supplier_id).run()
    }

    return c.json({
      success: true,
      data: { id: newPoId, po_number: poNumber },
      message: `재발주가 ${targetStatus === 'CONFIRMED' ? '확정' : '임시저장'} 상태로 생성되었습니다.`
    })
  } catch (error) {
    console.error('src/routes/purchaseOrders.ts reorder error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// GET /stock-alerts - 안전재고 부족 알림 목록
// ============================================================================
poCoreRouter.post('/quick', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const user = c.get('user') as any
    const body = await c.req.json<{
      supplier_id: number
      items: Array<{
        item_id?: number
        item_name: string
        category_name?: string
        quantity: number
        unit?: string
        unit_price: number
        vat_included?: boolean
      }>
      expected_date?: string
      delivery_location?: string
      notes?: string
    }>()

    if (!body.supplier_id) return c.json({ success: false, error: '공급업체를 선택해주세요.' }, 400)
    if (!body.items?.length) return c.json({ success: false, error: '품목을 추가해주세요.' }, 400)

    // 자동승인 설정 확인
    const { results: settingsRows } = await c.env.DB.prepare(
      `SELECT setting_key, setting_value FROM settings WHERE setting_key IN ('po_auto_approve_enabled', 'po_auto_approve_limit')`
    ).all() as any
    const settingsMap: Record<string, string> = {}
    for (const s of settingsRows) settingsMap[s.setting_key] = s.setting_value

    // 금액 계산
    let totalAmount = 0
    let vatAmount = 0
    for (const item of body.items) {
      const amount = item.quantity * item.unit_price
      totalAmount += amount
      if (item.vat_included !== false) vatAmount += Math.round(amount * 0.1)
    }
    const finalAmount = totalAmount + vatAmount

    // 자동승인 가능 여부 판단
    const autoApproveEnabled = settingsMap.po_auto_approve_enabled === '1'
    const autoApproveLimit = parseFloat(settingsMap.po_auto_approve_limit || '0')
    const canAutoApprove = autoApproveEnabled && finalAmount <= autoApproveLimit
    const status = canAutoApprove ? 'CONFIRMED' : 'DRAFT'

    // PO 번호 생성
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const lastPo = await c.env.DB.prepare(
      `SELECT po_number FROM purchase_orders WHERE po_number LIKE ? ORDER BY po_number DESC LIMIT 1`
    ).bind(`${today}-P%`).first() as any
    let seq = 1
    if (lastPo) {
      const lastSeq = parseInt(lastPo.po_number.split('-P')[1])
      if (!isNaN(lastSeq)) seq = lastSeq + 1
    }
    const poNumber = `${today}-P${String(seq).padStart(3, '0')}`

    // PO 생성
    const result = await c.env.DB.prepare(`
      INSERT INTO purchase_orders (po_number, supplier_id, status, order_date, expected_date, delivery_location,
        total_amount, vat_amount, discount_amount, final_amount, notes, internal_notes,
        created_by, updated_by, entity_id, confirmed_at, confirmed_by)
      VALUES (?, ?, ?, date('now'), ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?,
        ${canAutoApprove ? "datetime('now')" : 'NULL'},
        ${canAutoApprove ? '?' : 'NULL'})
    `).bind(
      poNumber, body.supplier_id, status,
      body.expected_date || null, body.delivery_location || null,
      totalAmount, vatAmount, finalAmount,
      body.notes || null, canAutoApprove ? '빠른 발주 (자동승인)' : '빠른 발주',
      user.id, user.id, getEntityId(c) || 1,
      ...(canAutoApprove ? [user.id] : [])
    ).run()

    const newPoId = result.meta.last_row_id

    // 아이템 저장
    for (let i = 0; i < body.items.length; i++) {
      const item = body.items[i]
      const amount = item.quantity * item.unit_price
      await c.env.DB.prepare(`
        INSERT INTO purchase_order_items (po_id, item_id, item_name, category_name, quantity,
          received_quantity, accepted_quantity, rejected_quantity,
          unit, unit_price, amount, vat_included, sort_order)
        VALUES (?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?, ?, ?)
      `).bind(
        newPoId, item.item_id || null, item.item_name, item.category_name || null,
        item.quantity, item.unit || 'EA', item.unit_price, amount,
        item.vat_included !== false ? 1 : 0, i + 1
      ).run()
    }

    // 상태 이력
    await c.env.DB.prepare(`
      INSERT INTO po_status_history (po_id, from_status, to_status, changed_by, change_reason)
      VALUES (?, NULL, ?, ?, ?)
    `).bind(newPoId, status, user.id, canAutoApprove ? '빠른 발주 (자동승인)' : '빠른 발주 생성').run()

    // CONFIRMED면 매입잔액 업데이트
    if (canAutoApprove) {
      await c.env.DB.prepare(`
        UPDATE clients SET purchase_balance = COALESCE(purchase_balance, 0) + ? WHERE id = ?
      `).bind(finalAmount, body.supplier_id).run()
    }

    return c.json({
      success: true,
      data: { id: newPoId, po_number: poNumber, status, auto_approved: canAutoApprove },
      message: canAutoApprove
        ? `빠른 발주가 자동승인되어 확정되었습니다. (${poNumber})`
        : `빠른 발주가 임시저장되었습니다. 금액이 자동승인 한도를 초과합니다. (${poNumber})`
    })
  } catch (error) {
    console.error('src/routes/purchaseOrders.ts quick error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

export default poCoreRouter
