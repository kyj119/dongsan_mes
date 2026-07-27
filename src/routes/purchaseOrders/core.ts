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
import { kstYmd, kstYmdCompact } from '../../utils/kstDate'
import { excludeInternalClientsSql } from '../../constants/intercompany'
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
      sort = 'order_date_desc',   // 기본=발주일 최신순(+id tie-break). sortOptions 주석 참조
      date_from = '',
      date_to = '',
      supplier_id = '',
      overdue = '',
      receiving = '',
      include_intercompany = ''
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

    // 법인간거래(내부법인 3사 매입처) 기본 제외 — 미지급(AP) 집계가 이미 전수 제외하고 있어
    //   목록에만 보이면 기준 불일치(accounts-payable.ts의 excludeInternalClientsSql와 동일 SSOT).
    //   include_intercompany=1 이면 포함(화면 체크박스 '법인간거래 포함'). po_number 접두 필터 금지 —
    //   명명 규칙 의존은 이관 규칙 변경에 깨짐. 정본 식별 = supplier_id ∈ 내부법인 clients.
    //   ⚠️ receiving=1(입고 페이지)은 제외 대상 아님 — 입고는 실물 업무라 숨기면 입고 누락. (2026-07-27)
    if (include_intercompany !== '1' && receiving !== '1') {
      whereClauses.push(excludeInternalClientsSql('po.supplier_id').replace(' AND ', ''))
    }

    if (ef.clause) {
      whereClauses.push(ef.clause.replace(' AND ', ''))
      params.push(...ef.params)
    }

    if (whereClauses.length > 0) {
      query += ' WHERE ' + whereClauses.join(' AND ')
    }

    // ⚠️ 정렬 규약: 모든 옵션에 고유키(po.id) tie-break 필수.
    //   이관/배치 INSERT 데이터는 created_at이 초 단위까지 동일(prod 발주 258건 중 241건이 동일값).
    //   tie-break 없이 created_at DESC만 걸면 SQLite가 동값 구간을 rowid ASC(=오래된 순)로 반환 →
    //   화면 첫 줄이 가장 오래된 발주(SMP-0001)로 뒤집히고, LIMIT/OFFSET 페이징도 불안정해짐.
    //   기본 정렬은 등록시각(created_at)이 아니라 업무일자(order_date) 기준 — 이관 데이터의 created_at은
    //   실제 발주 시점이 아니라 이관 실행 시각이므로 업무상 의미가 없음. (2026-07-27)
    const sortOptions: Record<string, string> = {
      'order_date_desc': 'po.order_date DESC, po.id DESC',
      'order_date_asc': 'po.order_date ASC, po.id ASC',
      'created_at_desc': 'po.created_at DESC, po.id DESC',
      'created_at_asc': 'po.created_at ASC, po.id ASC',
      'expected_date_asc': 'po.expected_date IS NULL, po.expected_date ASC, po.id DESC',
      'final_amount_desc': 'po.final_amount DESC, po.id DESC',
      'po_number_asc': 'po.po_number ASC, po.id ASC'
    }
    const orderBy = sortOptions[sort] || sortOptions['order_date_desc']

    query += ` ORDER BY ${orderBy} LIMIT ? OFFSET ?`
    params.push(safeLimit, offset)

    const { results } = await c.env.DB.prepare(query).bind(...params).all()

    // include_items=1: 라인 동봉 (최근 발주 복제 모달·자주 품목 칩). 부모 쿼리가 entity 필터 적용됨.
    if (c.req.query('include_items') === '1' && (results || []).length > 0) {
      const poIds = (results as any[]).map((r) => r.id as number)
      const itemsByPo = new Map<number, any[]>()
      for (let i = 0; i < poIds.length; i += 80) { // D1 바인드 한도 청크
        const chunk = poIds.slice(i, i + 80)
        const ph = chunk.map(() => '?').join(',')
        const { results: poiRows } = await c.env.DB.prepare(`
          SELECT poi.po_id, poi.item_id, poi.item_name, poi.quantity, poi.unit,
                 poi.unit_price, poi.amount, poi.vat_included, poi.price_status, poi.notes,
                 i.specification AS item_specification, i.width_mm AS item_width_mm
          FROM purchase_order_items poi
          LEFT JOIN items i ON i.id = poi.item_id
          WHERE poi.po_id IN (${ph})
          ORDER BY poi.po_id, poi.sort_order ASC, poi.id ASC
        `).bind(...chunk).all()
        for (const row of (poiRows as any[]) || []) {
          const arr = itemsByPo.get(row.po_id as number) || []
          arr.push(row)
          itemsByPo.set(row.po_id as number, arr)
        }
      }
      for (const r of results as any[]) r.items = itemsByPo.get(r.id as number) || []
    }

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
    if (include_intercompany !== '1' && receiving !== '1') {   // 목록과 동일 규칙(페이지네이션 총계 정합)
      countWhereClauses.push(excludeInternalClientsSql('po.supplier_id').replace(' AND ', ''))
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
        i.specification AS item_specification,
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
      ORDER BY poi.sort_order ASC, poi.id ASC
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
      ORDER BY created_at DESC, id DESC
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
    const dateStr = kstYmdCompact()

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
      data.order_date || kstYmd(),
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

export default poCoreRouter
