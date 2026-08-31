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
import { excludePurchaseNonCounterpartiesSql } from '../../constants/intercompany'
import { validateUpload } from '../../utils/uploadValidation'
import { buildPoListFilter, resolvePoSort, PO_SORT_DEFAULT } from './listFilter'

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
    // 조회조건 = listFilter.ts SSOT (목록·카운트·통계·CSV 공유). 여기에 조건을 직접 붙이지 말 것.
    const listFilter = buildPoListFilter(c)
    const params: any[] = [...listFilter.params]
    query += listFilter.where

    // 정렬 = listFilter.ts SSOT (목록·CSV 공유)
    const orderBy = resolvePoSort(sort)

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

    // 총 건수 + 금액 합계 — 목록과 동일한 조회조건(listFilter SSOT)
    // ⚠️ 합계는 '현재 페이지'가 아니라 '조회조건 전체' 기준이다.
    const countQuery = `SELECT COUNT(*) as count,
        COALESCE(SUM(po.total_amount), 0) as sum_supply,
        COALESCE(SUM(po.vat_amount), 0) as sum_vat,
        COALESCE(SUM(po.final_amount), 0) as sum_final
      FROM purchase_orders po
      LEFT JOIN clients c ON po.supplier_id = c.id${listFilter.where}`
    const countRow = await c.env.DB.prepare(countQuery).bind(...listFilter.params).first<{
      count: number; sum_supply: number; sum_vat: number; sum_final: number
    }>()
    const count = countRow?.count ?? 0

    // 수량 합계 — 발주:품목이 1:N 이라 목록 쿼리에 JOIN 하면 발주 행이 불어나 금액이 중복 합산된다.
    let sumQty = 0
    try {
      const qtyRow = await c.env.DB.prepare(
        `SELECT COALESCE(SUM(poi.quantity), 0) as qty
         FROM purchase_order_items poi
         WHERE poi.po_id IN (SELECT po.id FROM purchase_orders po LEFT JOIN clients c ON po.supplier_id = c.id${listFilter.where})`
      ).bind(...listFilter.params).first<{ qty: number }>()
      sumQty = Number(qtyRow?.qty) || 0
    } catch (_qtyErr) { /* 수량 집계 실패는 목록을 막지 않음 */ }

    const response: PaginatedResponse<PurchaseOrder> & { summary: Record<string, number> } = {
      success: true,
      data: results as unknown as PurchaseOrder[],
      pagination: {
        page: parseInt(page),
        limit: safeLimit,
        total: count,
        total_pages: Math.ceil(count / safeLimit)
      },
      summary: {
        count,
        quantity: sumQty,
        supply_amount: Number(countRow?.sum_supply) || 0,
        vat_amount: Number(countRow?.sum_vat) || 0,
        final_amount: Number(countRow?.sum_final) || 0,
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

    // 귀속 법인: 명시값 우선, 없으면 세션 법인 (주문 생성과 동형 — `orders/create.ts`)
    // ⚠️ 불변식 "번호 E{eid} = 행 entity_id" → **채번도 이 값을 써야 한다**(세션 법인 X).
    //    이걸 안 지키면 번호 접두와 행 entity_id 가 갈린다 — 주문에서 겪은 그 버그다.
    // ★ 이전엔 body 의 `entity_id` 를 아예 안 봤다. `entity_id: 99` 를 보내도 세션 법인(E1)에
    //   생성돼 **E2E 가 실법인을 오염**시켰다(쓰기 스모크가 잡았다, 2026-08-09).
    const poEntityId = (data.entity_id && Number(data.entity_id) > 0)
      ? Number(data.entity_id)
      : (getEntityId(c) || 1)

    // 발주번호 자동생성: YYYYMMDD-P001
    const dateStr = kstYmdCompact()

    const poNumber = await getNextEntitySeqNumber(c.env.DB, 'purchase_orders', 'po_number', poEntityId, dateStr, { suffix: 'P' })

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
      poEntityId          // ★ 채번(poNumber)과 **같은 값**이어야 한다 — 갈리면 번호 접두와 행이 어긋난다
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

    // AP 잔액은 파생이다(`ledger/accounts-payable.ts` = 발주 − 지급 − 조정, 법인 필터).
    //   `clients.purchase_balance` 캐시 갱신은 2026-08-31 제거 — 화면이 안 읽는데 14곳에서
    //   갱신만 하고 있었고, 수정·삭제 경로가 하나만 어긋나도 조용히 틀린 값이 남는 축이었다.
    //   (AR 의 `clients.balance` 폐기와 같은 처리 — 컬럼은 D1 제약상 남겨둔다)

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

    // AP 잔액은 파생이다(`ledger/accounts-payable.ts` = 발주 − 지급 − 조정, 법인 필터).
    //   `clients.purchase_balance` 캐시 갱신은 2026-08-31 제거 — 화면이 안 읽는데 14곳에서
    //   갱신만 하고 있었고, 수정·삭제 경로가 하나만 어긋나도 조용히 틀린 값이 남는 축이었다.
    //   (AR 의 `clients.balance` 폐기와 같은 처리 — 컬럼은 D1 제약상 남겨둔다)

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
      // 소프트 삭제: CANCELLED 전환 (AP 잔액은 파생이라 캐시 차감 불요 — 위 주석)
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
