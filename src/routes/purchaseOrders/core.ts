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
import { getNextSeqNumber, getNextEntitySeqNumber, withSeqRetry } from '../../utils/sequenceGenerator'
import { getEntityCompanyInfo } from '../../utils/entitySettings'
import { validateUpload } from '../../utils/uploadValidation'

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
      whereClauses.push("po.status IN ('CONFIRMED', 'PARTIAL_RECEIVED') AND po.expected_date IS NOT NULL AND po.expected_date < date('now', '+9 hours')")
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
      countWhereClauses.push("po.status IN ('CONFIRMED', 'PARTIAL_RECEIVED') AND po.expected_date IS NOT NULL AND po.expected_date < date('now', '+9 hours')")
    }
    if (ef.clause) {
      countWhereClauses.push(ef.clause.replace(' AND ', ''))
      countParams.push(...ef.params)
    }
    if (countWhereClauses.length > 0) {
      countQuery += ' WHERE ' + countWhereClauses.join(' AND ')
    }

    const countRow = await c.env.DB.prepare(countQuery).bind(...countParams).first<{ count: number }>()
    const count = countRow?.count ?? 0

    const response: PaginatedResponse<PurchaseOrder> = {
      success: true,
      data: results as unknown as PurchaseOrder[],
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
// GET /:id - 발주 상세
// ============================================================================
poCoreRouter.get('/:id', async (c) => {
  try {
    const id = c.req.param('id')

    const ef = entityFilter(c, 'po')  // #358계열: 발주 단건 조회 법인 격리
    const po = await c.env.DB.prepare(`
      SELECT
        po.*,
        c.client_name as supplier_name,
        u.name as created_by_name
      FROM purchase_orders po
      LEFT JOIN clients c ON po.supplier_id = c.id
      LEFT JOIN users u ON po.created_by = u.id
      WHERE po.id = ?${ef.clause}
    `).bind(id, ...ef.params).first()

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

    const poNumber = await getNextEntitySeqNumber(c.env.DB, 'purchase_orders', 'po_number', getEntityId(c) || 1, dateStr, { suffix: 'P' })

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
      getEntityId(c) || 1
    ).run()

    const poId = poResult.meta.last_row_id

    // INSERT purchase_order_items — #350 item_id→item_name N+1 SELECT를 IN절 prefetch로 제거 + batch
    const poiLookupIds = data.items
      .filter((it: any) => it.item_id && !(it.item_name || null))
      .map((it: any) => it.item_id)
    const poiItemMeta: Record<number, { item_name: string; category: string; unit: string }> = {}
    if (poiLookupIds.length > 0) {
      const ph = poiLookupIds.map(() => '?').join(',')
      const { results: metaRows } = await c.env.DB.prepare(
        `SELECT id, item_name, category, unit FROM items WHERE id IN (${ph})`
      ).bind(...poiLookupIds).all<{ id: number; item_name: string; category: string; unit: string }>()
      for (const m of (metaRows || [])) poiItemMeta[m.id as number] = m
    }

    const poiStmts: D1PreparedStatement[] = []
    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i]
      let itemName = item.item_name || null
      let categoryName = item.category_name || null
      let unit = item.unit || 'EA'

      if (item.item_id && !itemName) {
        const itemDetail = poiItemMeta[item.item_id]
        if (itemDetail) {
          itemName = itemDetail.item_name
          categoryName = itemDetail.category
          unit = itemDetail.unit
        }
      }

      const itemAmount = (item.unit_price || 0) * (item.quantity || 1)

      poiStmts.push(c.env.DB.prepare(`
        INSERT INTO purchase_order_items (
          po_id, item_id, item_name, category_name,
          quantity, received_quantity, unit,
          unit_price, price_status, amount, vat_included,
          sort_order, notes
        ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        poId,
        item.item_id || null,
        itemName || '미지정',
        categoryName || null,
        item.quantity || 1,
        unit,
        item.unit_price || 0,
        item.price_status === 'PENDING' ? 'PENDING' : 'CONFIRMED',
        itemAmount,
        item.vat_included !== undefined ? (item.vat_included ? 1 : 0) : 1,
        i,
        item.notes || null
      ))
    }
    for (let i = 0; i < poiStmts.length; i += 80) {
      await c.env.DB.batch(poiStmts.slice(i, i + 80))
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

    const ef = entityFilter(c)  // #358계열: 발주 수정 법인 격리
    const po = await c.env.DB.prepare(`
      SELECT id, status, supplier_id, final_amount, discount_amount,
             order_date, expected_date, notes, internal_notes,
             delivery_date, delivery_location
      FROM purchase_orders WHERE id = ?${ef.clause}
    `).bind(id, ...ef.params).first<PurchaseOrder & { delivery_date?: string; delivery_location?: string; discount_amount: number }>()

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
      data.delivery_date !== undefined ? data.delivery_date : po.delivery_date,
      data.delivery_location !== undefined ? data.delivery_location : po.delivery_location,
      id
    ).run()

    // 기존 품목 삭제 → 새로 INSERT
    await c.env.DB.prepare(`
      DELETE FROM purchase_order_items WHERE po_id = ?
    `).bind(id).run()

    // #350 item_id→item_name N+1 SELECT를 IN절 prefetch로 제거 + batch
    const poiLookupIds = data.items
      .filter((it: any) => it.item_id && !(it.item_name || null))
      .map((it: any) => it.item_id)
    const poiItemMeta: Record<number, { item_name: string; category: string; unit: string }> = {}
    if (poiLookupIds.length > 0) {
      const ph = poiLookupIds.map(() => '?').join(',')
      const { results: metaRows } = await c.env.DB.prepare(
        `SELECT id, item_name, category, unit FROM items WHERE id IN (${ph})`
      ).bind(...poiLookupIds).all<{ id: number; item_name: string; category: string; unit: string }>()
      for (const m of (metaRows || [])) poiItemMeta[m.id as number] = m
    }

    const poiStmts: D1PreparedStatement[] = []
    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i]
      let itemName = item.item_name || null
      let categoryName = item.category_name || null
      let unit = item.unit || 'EA'

      if (item.item_id && !itemName) {
        const itemDetail = poiItemMeta[item.item_id]
        if (itemDetail) {
          itemName = itemDetail.item_name
          categoryName = itemDetail.category
          unit = itemDetail.unit
        }
      }

      const itemAmount = (item.unit_price || 0) * (item.quantity || 1)

      poiStmts.push(c.env.DB.prepare(`
        INSERT INTO purchase_order_items (
          po_id, item_id, item_name, category_name,
          quantity, received_quantity, unit,
          unit_price, price_status, amount, vat_included,
          sort_order, notes
        ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        parseInt(id),
        item.item_id || null,
        itemName || '미지정',
        categoryName || null,
        item.quantity || 1,
        unit,
        item.unit_price || 0,
        item.price_status === 'PENDING' ? 'PENDING' : 'CONFIRMED',
        itemAmount,
        item.vat_included !== undefined ? (item.vat_included ? 1 : 0) : 1,
        i,
        item.notes || null
      ))
    }
    for (let i = 0; i < poiStmts.length; i += 80) {
      await c.env.DB.batch(poiStmts.slice(i, i + 80))
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

    const ef = entityFilter(c)  // #358계열: 발주 단건 변경 법인 격리
    const po = await c.env.DB.prepare(`
      SELECT id, status, supplier_id, final_amount
      FROM purchase_orders WHERE id = ?${ef.clause}
    `).bind(id, ...ef.params).first<PurchaseOrder>()

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

    const ef = entityFilter(c)  // #358계열: 발주 입고처리 법인 격리
    const po = await c.env.DB.prepare(`
      SELECT id, status, supplier_id
      FROM purchase_orders WHERE id = ?${ef.clause}
    `).bind(id, ...ef.params).first<PurchaseOrder>()

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
    const rcvCountRow = await c.env.DB.prepare(`
      SELECT COUNT(*) as count FROM inventory_receipts WHERE receipt_number LIKE ?
    `).bind(`RCV-${dateStr}%`).first<{ count: number }>()

    const sequence = ((rcvCountRow?.count || 0) + 1).toString().padStart(3, '0')
    const receiptNumber = `RCV-${dateStr}-${sequence}`

    // po_item 정보 로딩
    const { results: poItems } = await c.env.DB.prepare(`
      SELECT id, item_id, item_name, quantity, received_quantity, unit_price
      FROM purchase_order_items WHERE po_id = ?
    `).bind(id).all()

    type PoItemRow = Record<string, unknown>
    const poItemMap = new Map<number, PoItemRow>()
    for (const pi of poItems as PoItemRow[]) {
      poItemMap.set(pi.id as number, pi)
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
          error: `품목 '${poItem.item_name}': 합격(${acceptedQty}) + 불합격(${rejectedQty}) = ${acceptedQty + rejectedQty} 이 수령수량(${receiveQty})과 일치하지 않습니다.`
        }, 400)
      }

      const remaining = Number(poItem.quantity) - Number(poItem.received_quantity)
      if (receiveQty > remaining) {
        return c.json({
          success: false,
          error: `품목 '${poItem.item_name}': 입고 가능 수량(${remaining})을 초과했습니다. 요청: ${receiveQty}`
        }, 400)
      }
      receiptTotalAmount += receiveQty * (Number(poItem.unit_price) || 0)
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
      entityId: number
      zoneId: number | null
    }> = []
    let summaryAccepted = 0
    let summaryRejected = 0

    for (const ri of receiveItems) {
      const poItem = poItemMap.get(ri.po_item_id)!
      const receiveQty: number = Number(ri.received_quantity ?? ri.quantity ?? 0)
      const acceptedQty: number = ri.accepted_quantity !== undefined ? Number(ri.accepted_quantity) : receiveQty
      const rejectedQty: number = ri.rejected_quantity !== undefined ? Number(ri.rejected_quantity) : 0
      const unitPrice: number = Number(poItem.unit_price) || 0
      const amount = receiveQty * unitPrice
      const qualityStatus = rejectedQty === 0 ? 'PASSED' : acceptedQty === 0 ? 'FAILED' : 'PARTIAL'

      let balanceAfter = 0
      let hasInventoryRow = false
      const poEntityId = getEntityId(c) || 1
      if (poItem.item_id && acceptedQty > 0) {
        const invRow = await c.env.DB.prepare(
          `SELECT quantity FROM inventory WHERE item_id = ? AND entity_id = ?`
        ).bind(poItem.item_id, poEntityId).first<{ quantity: number }>()
        const currentStock = Number(invRow?.quantity || 0)
        hasInventoryRow = !!invRow
        balanceAfter = currentStock + acceptedQty
      }

      // 품목의 storage_zone_id 미리 조회 (batch 안에서 await 방지)
      let itemZoneId: number | null = null
      if (poItem.item_id && !hasInventoryRow) {
        const zRow = await c.env.DB.prepare('SELECT storage_zone_id FROM items WHERE id = ?').bind(poItem.item_id).first<{ storage_zone_id: number | null }>()
        itemZoneId = zRow?.storage_zone_id ?? null
      }

      perItemPrep.push({
        poItemId: ri.po_item_id,
        itemId: (poItem.item_id as number) || null,
        receiveQty, acceptedQty, rejectedQty, unitPrice, amount, qualityStatus,
        rejectMemo: ri.reject_memo || null,
        balanceAfter, hasInventoryRow,
        entityId: poEntityId, zoneId: itemZoneId,
      })
      summaryAccepted += acceptedQty
      summaryRejected += rejectedQty
    }

    // 워크플로우 상태: 정상(전량) → NORMAL, 부족/거부 1개라도 → PENDING_REVIEW (관리자 결정 대기)
    //   (이전 PASSED/FAILED/PARTIAL 값은 InspectionQualityStatus enum — 관리자 결정 UI 필터와 불일치였음)
    const inspectionStatusForReceipt = summaryRejected === 0 ? 'NORMAL' : 'PENDING_REVIEW'

    // 새 PO status 사전 계산 (in-memory, 쓰기 전)
    const willAllReceived = (poItems as PoItemRow[]).every((pi) => {
      const match = perItemPrep.find(p => p.poItemId === (pi.id as number))
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
        status, received_by, notes, po_id, supplier_id, entity_id
      ) VALUES (?, ?, ?, ?, 'COMPLETED', ?, ?, ?, ?, ?)
    `).bind(
      receiptNumber,
      receiptDate,
      String(po.supplier_id || ''),
      receiptTotalAmount,
      user?.id || 1,
      notes || null,
      parseInt(id),
      po.supplier_id || null,
      getEntityId(c) || 1
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
              UPDATE inventory SET quantity = ?, last_updated = CURRENT_TIMESTAMP WHERE item_id = ? AND entity_id = ?
            `).bind(p.balanceAfter, p.itemId, p.entityId))
          } else {
            stmts.push(c.env.DB.prepare(`
              INSERT INTO inventory (item_id, quantity, entity_id, storage_zone_id, last_updated) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            `).bind(p.itemId, p.balanceAfter, p.entityId, p.zoneId))
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
      // 보상 트랜잭션: 이미 삽입된 부모 receipt + 자식 items 삭제 (#311 고아 방지)
      try {
        await c.env.DB.batch([
          c.env.DB.prepare(`DELETE FROM inventory_receipt_items WHERE receipt_id = ?`).bind(receiptId),
          c.env.DB.prepare(`DELETE FROM inventory_receipts WHERE id = ?`).bind(receiptId)
        ])
      } catch (_) { /* best effort */ }
      throw batchErr
    }

    // ============================================================================
    // Phase 4: 단가 자동 갱신 (트랜잭션 밖 — 실패해도 입고 롤백 안 함)
    // ① 매입처 단가 upsert → ② base_price 갱신 → ③ 그룹 연쇄 → ④ 이력
    // ============================================================================
    const priceUpdates: Array<{ itemId: number; name: string; old: number; new_: number }> = []
    try {
      for (const p of perItemPrep) {
        if (!p.itemId || p.unitPrice <= 0) continue

        // ① client_item_prices upsert (매입처 단가)
        if (po.supplier_id) {
          await c.env.DB.prepare(`
            INSERT INTO client_item_prices (client_id, item_id, price)
            VALUES (?, ?, ?)
            ON CONFLICT(client_id, item_id) DO UPDATE SET price = ?, updated_at = CURRENT_TIMESTAMP
          `).bind(po.supplier_id, p.itemId, p.unitPrice, p.unitPrice).run()
        }

        // ② items.base_price 갱신
        const oldItem = await c.env.DB.prepare(
          'SELECT base_price, item_group, item_name FROM items WHERE id = ?'
        ).bind(p.itemId).first<{ base_price: number; item_group: string | null; item_name: string }>()

        if (!oldItem || oldItem.base_price === p.unitPrice) continue

        // 직접 입고 품목 갱신
        await c.env.DB.prepare(
          'UPDATE items SET base_price = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        ).bind(p.unitPrice, p.itemId).run()

        await c.env.DB.prepare(
          `INSERT INTO price_change_history (target_type, target_id, field_name, old_value, new_value, changed_by, entity_id)
           VALUES ('ITEM', ?, 'base_price', ?, ?, ?, ?)`
        ).bind(p.itemId, oldItem.base_price, p.unitPrice, user?.username || 'system', getEntityId(c)).run()

        priceUpdates.push({ itemId: p.itemId, name: oldItem.item_name, old: oldItem.base_price, new_: p.unitPrice })

        // ③ 같은 item_group + 단가 연동(price_linked) 품목 연쇄 갱신
        if (oldItem.item_group) {
          const linked = await c.env.DB.prepare(
            'SELECT price_linked FROM item_group_settings WHERE group_name = ?'
          ).bind(oldItem.item_group).first<{ price_linked: number }>()

          if (linked?.price_linked) {
            const { results: groupItems } = await c.env.DB.prepare(
              'SELECT id, base_price, item_name FROM items WHERE item_group = ? AND id != ? AND is_active = 1'
            ).bind(oldItem.item_group, p.itemId).all<{ id: number; base_price: number; item_name: string }>()

            const updateStmts = []
            for (const gi of groupItems) {
              if (gi.base_price === p.unitPrice) continue
              updateStmts.push(
                c.env.DB.prepare('UPDATE items SET base_price = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
                  .bind(p.unitPrice, gi.id)
              )
              updateStmts.push(
                c.env.DB.prepare(
                  `INSERT INTO price_change_history (target_type, target_id, field_name, old_value, new_value, changed_by, entity_id)
                   VALUES ('ITEM', ?, 'base_price', ?, ?, ?, ?)`
                ).bind(gi.id, gi.base_price, p.unitPrice, user?.username || 'system', getEntityId(c))
              )
              priceUpdates.push({ itemId: gi.id, name: gi.item_name, old: gi.base_price, new_: p.unitPrice })
            }
            if (updateStmts.length) await c.env.DB.batch(updateStmts)
          }
        }
      }
    } catch (priceErr) {
      console.warn('purchaseOrders receive: price auto-update failed (non-fatal)', priceErr)
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
            `INSERT INTO notifications (target_role, title, message, link, entity_id) VALUES ('ADMIN', ?, ?, '/inspections', ?)`
          ).bind(title, message, getEntityId(c)).run()
        }
      } catch (notifErr) {
        console.warn('purchaseOrders receive: notification insert failed (non-fatal)', notifErr)
      }
    }

    const priceMsg = priceUpdates.length
      ? ` 단가 변경: ${priceUpdates.length}건 (${priceUpdates.map(u => u.name + ' ' + u.old.toLocaleString() + '→' + u.new_.toLocaleString()).join(', ')})`
      : ''

    return c.json({
      success: true,
      data: {
        receipt_number: receiptNumber,
        receipt_id: receiptId,
        po_status: newStatus,
        inspection_status: inspectionStatusForReceipt,
        price_updates: priceUpdates.length ? priceUpdates : undefined
      },
      message: `입고 처리 완료. 발주 상태: ${newStatus}${priceMsg}`
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

    const ef = entityFilter(c)  // #358계열: 발주 복사 원본 법인 격리 (타법인 발주 복사 차단)
    const po = await c.env.DB.prepare(`
      SELECT id, po_number, supplier_id, expected_date,
             total_amount, vat_amount, discount_amount, final_amount,
             notes, internal_notes
      FROM purchase_orders WHERE id = ?${ef.clause}
    `).bind(id, ...ef.params).first<PurchaseOrder>()

    if (!po) {
      return c.json({ success: false, error: 'Purchase order not found' }, 404)
    }

    const { results: originalItems } = await c.env.DB.prepare(`
      SELECT item_id, item_name, category_name, quantity, unit, unit_price, amount, vat_included, sort_order, notes
      FROM purchase_order_items WHERE po_id = ? ORDER BY sort_order ASC
    `).bind(id).all()

    // 새 발주번호 생성
    const today = new Date()
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '')

    const newPoNumber = await getNextEntitySeqNumber(c.env.DB, 'purchase_orders', 'po_number', getEntityId(c) || 1, dateStr, { suffix: 'P' })

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
    for (const item of originalItems as Record<string, unknown>[]) {
      await c.env.DB.prepare(`
        INSERT INTO purchase_order_items (
          po_id, item_id, item_name, category_name,
          quantity, received_quantity, unit,
          unit_price, amount, vat_included,
          sort_order, notes
        ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)
      `).bind(
        newPoId,
        item.item_id || null,
        item.item_name,
        item.category_name || null,
        item.quantity,
        item.unit || 'EA',
        item.unit_price || 0,
        item.amount || 0,
        item.vat_included,
        item.sort_order || 0,
        item.notes || null
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

    const ef = entityFilter(c)  // #358계열: 발주 단건 변경 법인 격리
    const po = await c.env.DB.prepare(`
      SELECT id, status, supplier_id, final_amount
      FROM purchase_orders WHERE id = ?${ef.clause}
    `).bind(id, ...ef.params).first<PurchaseOrder>()

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
      // #181: 하위 테이블도 함께 삭제 (고아 레코드 방지)
      await c.env.DB.batch([
        c.env.DB.prepare('DELETE FROM purchase_order_items WHERE po_id = ?').bind(id),
        c.env.DB.prepare('DELETE FROM po_status_history WHERE po_id = ?').bind(id),
        // #312: 발주 삭제 시 관련 비용조정의 po_id를 NULL 처리 (조정 레코드 자체는 보존)
        c.env.DB.prepare('UPDATE purchase_adjustments SET po_id = NULL WHERE po_id = ?').bind(id),
        // #324: 매입 인보이스 댕글링 방지 — po_id NULL 처리 (인보이스 레코드 보존)
        c.env.DB.prepare('UPDATE purchase_invoices SET po_id = NULL WHERE po_id = ?').bind(id),
        c.env.DB.prepare('DELETE FROM purchase_orders WHERE id = ?').bind(id)
      ])

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
    const user = c.get('user')
    const body: { status?: string } = await c.req.json<{ status?: string }>().catch(() => ({}))
    const targetStatus = body.status || 'CONFIRMED'

    // 원본 PO 조회
    const ef = entityFilter(c)  // #358계열: 발주 재주문 원본 법인 격리 (타법인 발주 재주문 차단)
    const originalPo = await c.env.DB.prepare(`
      SELECT id, po_number, supplier_id, expected_date, delivery_location,
             total_amount, vat_amount, discount_amount, final_amount, notes
      FROM purchase_orders WHERE id = ?${ef.clause}
    `).bind(id, ...ef.params).first<PurchaseOrder & { delivery_location?: string }>()
    if (!originalPo) {
      return c.json({ success: false, error: '원본 발주서를 찾을 수 없습니다.' }, 404)
    }

    // 원본 PO 아이템 조회
    const { results: originalItems } = await c.env.DB.prepare(`
      SELECT item_id, item_name, category_name, quantity, unit, unit_price, amount, vat_included, sort_order, notes
      FROM purchase_order_items WHERE po_id = ? ORDER BY sort_order
    `).bind(id).all()

    // 새 PO 번호 생성
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    // entity별 시퀀스 (0281 복합 UNIQUE(entity_id, po_number) 정합 — 정규 생성 경로와 동일)
    const poNumber = await getNextSeqNumber(c.env.DB, 'purchase_orders', 'po_number', `${today}-P`, 3, getEntityId(c))

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
    const user = c.get('user')
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
    ).all()
    const settingsMap: Record<string, string> = {}
    for (const s of settingsRows as Record<string, unknown>[]) settingsMap[s.setting_key as string] = s.setting_value as string

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
    const autoApproveLimit = Number(settingsMap.po_auto_approve_limit || '0')
    const canAutoApprove = autoApproveEnabled && finalAmount <= autoApproveLimit
    const status = canAutoApprove ? 'CONFIRMED' : 'DRAFT'

    // PO 번호 생성
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    // entity별 시퀀스 (0281 복합 UNIQUE(entity_id, po_number) 정합 — 정규 생성 경로와 동일)
    const poNumber = await getNextSeqNumber(c.env.DB, 'purchase_orders', 'po_number', `${today}-P`, 3, getEntityId(c))

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
