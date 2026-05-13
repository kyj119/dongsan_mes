import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import type { PurchaseRequest, PurchaseRequestItem, ApiResponse, PaginatedResponse } from '../types/models'
import { authMiddleware, requireRole } from '../middleware/auth'
import { getEntityId } from '../utils/entityFilter'

const prRouter = new Hono<HonoEnv>()

// Apply authentication middleware to all routes
prRouter.use('/*', authMiddleware, requireRole('ADMIN', 'MANAGER', 'DESIGNER'))

// ============================================================================
// GET / - 발주 요청 목록
// ============================================================================
prRouter.get('/', async (c) => {
  try {
    const user = c.get('user')
    const {
      page = '1',
      limit = '50',
      status = '',
      urgency = '',
      search = '',
      date_from = '',
      date_to = ''
    } = c.req.query()
    const safeLimit = Math.min(Number(limit) || 50, 200)
    const offset = (Number(page) - 1) * safeLimit

    let query = `
      SELECT
        pr.*,
        u.name as requester_name,
        c.client_name as supplier_name
      FROM purchase_requests pr
      JOIN users u ON pr.requester_id = u.id
      LEFT JOIN clients c ON pr.supplier_id = c.id
    `
    const params: any[] = []
    const whereClauses: string[] = []

    if (user?.role === 'MANAGER') {
      whereClauses.push('pr.requester_id = ?')
      params.push(user.id)
    }
    if (status) {
      whereClauses.push('pr.status = ?')
      params.push(status)
    }
    if (urgency) {
      whereClauses.push('pr.urgency = ?')
      params.push(urgency)
    }
    if (search) {
      whereClauses.push('(pr.request_number LIKE ? OR u.name LIKE ? OR c.client_name LIKE ?)')
      const searchPattern = `%${search}%`
      params.push(searchPattern, searchPattern, searchPattern)
    }
    if (date_from) {
      whereClauses.push('pr.created_at >= ?')
      params.push(date_from)
    }
    if (date_to) {
      whereClauses.push('pr.created_at <= ?')
      params.push(date_to + ' 23:59:59')
    }

    if (whereClauses.length > 0) {
      query += ' WHERE ' + whereClauses.join(' AND ')
    }
    query += ' ORDER BY pr.created_at DESC LIMIT ? OFFSET ?'
    params.push(safeLimit, offset)

    const { results } = await c.env.DB.prepare(query).bind(...params).all()

    let countQuery = `
      SELECT COUNT(*) as count
      FROM purchase_requests pr
      JOIN users u ON pr.requester_id = u.id
      LEFT JOIN clients c ON pr.supplier_id = c.id
    `
    const countParams: any[] = []
    const countWhereClauses: string[] = []

    if (user?.role === 'MANAGER') {
      countWhereClauses.push('pr.requester_id = ?')
      countParams.push(user.id)
    }
    if (status) {
      countWhereClauses.push('pr.status = ?')
      countParams.push(status)
    }
    if (urgency) {
      countWhereClauses.push('pr.urgency = ?')
      countParams.push(urgency)
    }
    if (search) {
      countWhereClauses.push('(pr.request_number LIKE ? OR u.name LIKE ? OR c.client_name LIKE ?)')
      const searchPattern = `%${search}%`
      countParams.push(searchPattern, searchPattern, searchPattern)
    }
    if (date_from) {
      countWhereClauses.push('pr.created_at >= ?')
      countParams.push(date_from)
    }
    if (date_to) {
      countWhereClauses.push('pr.created_at <= ?')
      countParams.push(date_to + ' 23:59:59')
    }
    if (countWhereClauses.length > 0) {
      countQuery += ' WHERE ' + countWhereClauses.join(' AND ')
    }

    const countRow = await c.env.DB.prepare(countQuery).bind(...countParams).first<{ count: number }>()
    const count = countRow?.count ?? 0

    return c.json({
      success: true,
      requests: results,
      pagination: {
        page: Number(page),
        limit: safeLimit,
        total: count,
        total_pages: Math.ceil(count / safeLimit)
      }
    })
  } catch (error) {
    console.error('src/routes/purchaseRequests.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// GET /stats - 상태별 건수 (/:id 보다 먼저 등록)
// ============================================================================
prRouter.get('/stats', async (c) => {
  try {
    const user = c.get('user')
    let query = `SELECT status, COUNT(*) as count FROM purchase_requests`
    const params: any[] = []
    if (user?.role === 'MANAGER') {
      query += ' WHERE requester_id = ?'
      params.push(user.id)
    }
    query += ' GROUP BY status'

    const { results } = await c.env.DB.prepare(query).bind(...params).all<{ status: string; count: number }>()
    const stats: Record<string, number> = { total: 0, pending: 0, approved: 0, rejected: 0, converted: 0 }
    for (const row of results) {
      const key = row.status.toLowerCase()
      stats[key] = row.count
      stats.total += row.count
    }
    return c.json({ success: true, data: stats })
  } catch (error) {
    console.error('src/routes/purchaseRequests.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// GET /:id/comments - 댓글 목록 조회 (/:id 보다 먼저 등록)
// ============================================================================
prRouter.get('/:id/comments', async (c) => {
  try {
    const id = c.req.param('id')
    const { results } = await c.env.DB.prepare(`
      SELECT pc.*, u.name as user_name
      FROM pr_comments pc
      JOIN users u ON pc.user_id = u.id
      WHERE pc.request_id = ?
      ORDER BY pc.created_at ASC
    `).bind(Number(id)).all()
    return c.json({ success: true, comments: results })
  } catch (error) {
    console.error('src/routes/purchaseRequests.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// POST /:id/comments - 댓글 작성 (/:id 보다 먼저 등록)
// ============================================================================
prRouter.post('/:id/comments', async (c) => {
  try {
    const user = c.get('user')
    const id = c.req.param('id')
    const { content } = await c.req.json()

    if (!content || !content.trim()) {
      return c.json({ success: false, error: '댓글 내용을 입력해주세요.' }, 400)
    }

    const pr = await c.env.DB.prepare('SELECT id FROM purchase_requests WHERE id = ?').bind(Number(id)).first()
    if (!pr) return c.json({ success: false, error: '발주 요청을 찾을 수 없습니다.' }, 404)

    await c.env.DB.prepare(`
      INSERT INTO pr_comments (request_id, user_id, content) VALUES (?, ?, ?)
    `).bind(Number(id), user?.id || 1, content.trim()).run()

    return c.json({ success: true }, 201)
  } catch (error) {
    console.error('src/routes/purchaseRequests.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// GET /:id - 발주 요청 상세
// ============================================================================
prRouter.get('/:id', async (c) => {
  try {
    const user = c.get('user')
    const id = c.req.param('id')

    const request = await c.env.DB.prepare(`
      SELECT pr.*, u.name as requester_name, c.client_name as supplier_name,
             ab.name as approved_by_name
      FROM purchase_requests pr
      JOIN users u ON pr.requester_id = u.id
      LEFT JOIN clients c ON pr.supplier_id = c.id
      LEFT JOIN users ab ON pr.approved_by = ab.id
      WHERE pr.id = ?
    `).bind(id).first<PurchaseRequest & { requester_name: string; supplier_name: string | null; approved_by_name: string | null }>()

    if (!request) {
      return c.json({ success: false, error: '발주 요청을 찾을 수 없습니다.' }, 404)
    }
    if (user?.role === 'MANAGER' && request.requester_id !== user.id) {
      return c.json({ success: false, error: '접근 권한이 없습니다.' }, 403)
    }

    const { results: items } = await c.env.DB.prepare(`
      SELECT * FROM purchase_request_items WHERE request_id = ? ORDER BY sort_order ASC
    `).bind(id).all()

    const { results: history } = await c.env.DB.prepare(`
      SELECT h.*, u.name as changed_by_name
      FROM pr_status_history h
      LEFT JOIN users u ON h.changed_by = u.id
      WHERE h.request_id = ? ORDER BY h.created_at ASC
    `).bind(id).all()

    const { results: comments } = await c.env.DB.prepare(`
      SELECT pc.*, u.name as user_name
      FROM pr_comments pc
      JOIN users u ON pc.user_id = u.id
      WHERE pc.request_id = ?
      ORDER BY pc.created_at ASC
    `).bind(id).all()

    let linkedPO = null
    if (request.converted_po_id) {
      linkedPO = await c.env.DB.prepare(`
        SELECT po.id, po.po_number, po.status, po.final_amount, po.expected_date,
               c.client_name as supplier_name
        FROM purchase_orders po
        LEFT JOIN clients c ON po.supplier_id = c.id
        WHERE po.id = ?
      `).bind(request.converted_po_id).first()
    }

    return c.json({ success: true, request: { ...request, items, history, comments, linkedPO } })
  } catch (error) {
    console.error('src/routes/purchaseRequests.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// POST / - 발주 요청 생성
// ============================================================================
prRouter.post('/', async (c) => {
  try {
    const user = c.get('user')
    const data = await c.req.json()

    if (!data.items || data.items.length === 0) {
      return c.json({ success: false, error: '품목을 최소 1개 이상 입력해야 합니다.' }, 400)
    }

    const today = new Date()
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '')

    const seqRow = await c.env.DB.prepare(`
      SELECT COALESCE(MAX(CAST(SUBSTR(request_number, 13) AS INTEGER)), 0) as max_seq
      FROM purchase_requests WHERE request_number LIKE ?
    `).bind(`PR-${dateStr}-%`).first<{ max_seq: number }>()
    const max_seq = seqRow?.max_seq ?? 0

    const requestNumber = `PR-${dateStr}-${String(max_seq + 1).padStart(3, '0')}`

    const prResult = await c.env.DB.prepare(`
      INSERT INTO purchase_requests (
        request_number, requester_id, supplier_id, urgency, status, reason, notes,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'PENDING', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).bind(
      requestNumber, user?.id || 1, data.supplier_id || null,
      data.urgency || 'NORMAL', data.reason || null, data.notes || null
    ).run()

    const requestId = prResult.meta.last_row_id

    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i]
      await c.env.DB.prepare(`
        INSERT INTO purchase_request_items (
          request_id, item_id, item_name, category_name,
          quantity, unit, estimated_unit_price, sort_order, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        requestId, item.item_id || null, item.item_name, item.category_name || null,
        Number(item.quantity) || 1, item.unit || 'EA',
        Number(item.estimated_unit_price) || 0, i, item.notes || null
      ).run()
    }

    await c.env.DB.prepare(`
      INSERT INTO pr_status_history (request_id, to_status, changed_by, change_reason)
      VALUES (?, 'PENDING', ?, '발주 요청 생성')
    `).bind(requestId, user?.id || 1).run()

    return c.json({ success: true, request_number: requestNumber, request_id: requestId }, 201)
  } catch (error) {
    console.error('src/routes/purchaseRequests.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// PUT /:id - 발주 요청 수정 (PENDING만)
// ============================================================================
prRouter.put('/:id', async (c) => {
  try {
    const user = c.get('user')
    const id = c.req.param('id')
    const data = await c.req.json()

    const pr = await c.env.DB.prepare(`SELECT id, requester_id, supplier_id, urgency, status FROM purchase_requests WHERE id = ?`).bind(id).first<PurchaseRequest>()
    if (!pr) return c.json({ success: false, error: '발주 요청을 찾을 수 없습니다.' }, 404)
    if (user?.role === 'MANAGER' && pr.requester_id !== user.id) {
      return c.json({ success: false, error: '접근 권한이 없습니다.' }, 403)
    }
    if (pr.status !== 'PENDING') {
      return c.json({ success: false, error: `'${pr.status}' 상태에서는 수정할 수 없습니다.` }, 400)
    }
    if (!data.items || data.items.length === 0) {
      return c.json({ success: false, error: '품목을 최소 1개 이상 입력해야 합니다.' }, 400)
    }

    await c.env.DB.prepare(`
      UPDATE purchase_requests SET
        supplier_id = ?, urgency = ?, reason = ?, notes = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      data.supplier_id !== undefined ? data.supplier_id : pr.supplier_id,
      data.urgency || pr.urgency,
      data.reason !== undefined ? data.reason : pr.reason,
      data.notes !== undefined ? data.notes : pr.notes,
      id
    ).run()

    // 수정 전 품목 조회 (이력 비교용)
    const { results: oldItems } = await c.env.DB.prepare(
      `SELECT item_name, quantity, unit, estimated_unit_price FROM purchase_request_items WHERE request_id = ? ORDER BY sort_order ASC`
    ).bind(id).all<Pick<PurchaseRequestItem, 'item_name' | 'quantity' | 'unit' | 'estimated_unit_price'>>()

    await c.env.DB.prepare(`DELETE FROM purchase_request_items WHERE request_id = ?`).bind(id).run()

    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i]
      await c.env.DB.prepare(`
        INSERT INTO purchase_request_items (
          request_id, item_id, item_name, category_name,
          quantity, unit, estimated_unit_price, sort_order, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        Number(id), item.item_id || null, item.item_name, item.category_name || null,
        Number(item.quantity) || 1, item.unit || 'EA',
        Number(item.estimated_unit_price) || 0, i, item.notes || null
      ).run()
    }

    // 수정 이력 기록
    const changes: string[] = []
    if (data.supplier_id !== undefined && data.supplier_id !== pr.supplier_id) changes.push('공급업체 변경')
    if (data.urgency && data.urgency !== pr.urgency) changes.push(`긴급도: ${pr.urgency}→${data.urgency}`)
    if (data.reason !== undefined && data.reason !== pr.reason) changes.push('사유 변경')

    const oldItemCount = oldItems.length
    const newItemCount = data.items.length
    if (oldItemCount !== newItemCount) {
      changes.push(`품목 수: ${oldItemCount}→${newItemCount}`)
    } else {
      // 같은 수일 때 수량/단가 변경 감지
      for (let i = 0; i < Math.min(oldItemCount, newItemCount); i++) {
        const o = oldItems[i]
        const n = data.items[i]
        if (o.item_name !== n.item_name || Number(o.quantity) !== (Number(n.quantity) || 1) ||
            Number(o.estimated_unit_price) !== (Number(n.estimated_unit_price) || 0)) {
          changes.push('품목 내용 변경')
          break
        }
      }
    }

    if (changes.length > 0) {
      await c.env.DB.prepare(`
        INSERT INTO pr_status_history (request_id, from_status, to_status, changed_by, change_reason)
        VALUES (?, 'PENDING', 'PENDING', ?, ?)
      `).bind(Number(id), user?.id || 1, `수정: ${changes.join(', ')}`).run()
    }

    return c.json({ success: true })
  } catch (error) {
    console.error('src/routes/purchaseRequests.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// PATCH /:id/approve - 승인 (ADMIN only)
// ============================================================================
prRouter.patch('/:id/approve', requireRole('ADMIN'), async (c) => {
  try {
    const user = c.get('user')
    const id = c.req.param('id')
    const data = await c.req.json()

    const pr = await c.env.DB.prepare(`SELECT id, supplier_id, status FROM purchase_requests WHERE id = ?`).bind(id).first<PurchaseRequest>()
    if (!pr) return c.json({ success: false, error: '발주 요청을 찾을 수 없습니다.' }, 404)
    if (pr.status !== 'PENDING') {
      return c.json({ success: false, error: `'${pr.status}' 상태에서는 승인할 수 없습니다.` }, 400)
    }

    const newSupplierId = data.supplier_id !== undefined ? data.supplier_id : pr.supplier_id

    await c.env.DB.prepare(`
      UPDATE purchase_requests SET
        status = 'APPROVED', supplier_id = ?, approved_by = ?,
        approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(newSupplierId, user?.id || 1, id).run()

    if (data.items && data.items.length > 0) {
      for (const itemUpdate of data.items) {
        if (!itemUpdate.request_item_id) continue
        await c.env.DB.prepare(`
          UPDATE purchase_request_items SET admin_quantity = ?, admin_unit_price = ?
          WHERE id = ? AND request_id = ?
        `).bind(
          itemUpdate.admin_quantity !== undefined ? Number(itemUpdate.admin_quantity) : null,
          itemUpdate.admin_unit_price !== undefined ? Number(itemUpdate.admin_unit_price) : null,
          itemUpdate.request_item_id, Number(id)
        ).run()
      }
    }

    await c.env.DB.prepare(`
      INSERT INTO pr_status_history (request_id, from_status, to_status, changed_by, change_reason)
      VALUES (?, 'PENDING', 'APPROVED', ?, ?)
    `).bind(Number(id), user?.id || 1, data.change_reason || '발주 요청 승인').run()

    return c.json({ success: true })
  } catch (error) {
    console.error('src/routes/purchaseRequests.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// PATCH /:id/reject - 반려 (ADMIN only)
// ============================================================================
prRouter.patch('/:id/reject', requireRole('ADMIN'), async (c) => {
  try {
    const user = c.get('user')
    const id = c.req.param('id')
    const data = await c.req.json()

    if (!data.reject_reason) {
      return c.json({ success: false, error: '반려 사유는 필수입니다.' }, 400)
    }

    const pr = await c.env.DB.prepare(`SELECT id, status FROM purchase_requests WHERE id = ?`).bind(id).first<PurchaseRequest>()
    if (!pr) return c.json({ success: false, error: '발주 요청을 찾을 수 없습니다.' }, 404)
    if (pr.status !== 'PENDING') {
      return c.json({ success: false, error: `'${pr.status}' 상태에서는 반려할 수 없습니다.` }, 400)
    }

    await c.env.DB.prepare(`
      UPDATE purchase_requests SET status = 'REJECTED', reject_reason = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(data.reject_reason, id).run()

    await c.env.DB.prepare(`
      INSERT INTO pr_status_history (request_id, from_status, to_status, changed_by, change_reason)
      VALUES (?, 'PENDING', 'REJECTED', ?, ?)
    `).bind(Number(id), user?.id || 1, data.reject_reason).run()

    return c.json({ success: true })
  } catch (error) {
    console.error('src/routes/purchaseRequests.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// POST /:id/convert - 발주서(PO) 변환 (ADMIN only)
// ============================================================================
prRouter.post('/:id/convert', requireRole('ADMIN'), async (c) => {
  try {
    const user = c.get('user')
    const id = c.req.param('id')

    const pr = await c.env.DB.prepare(`SELECT id, supplier_id, status FROM purchase_requests WHERE id = ?`).bind(id).first<PurchaseRequest>()
    if (!pr) return c.json({ success: false, error: '발주 요청을 찾을 수 없습니다.' }, 404)
    if (pr.status !== 'APPROVED') {
      return c.json({ success: false, error: `'${pr.status}' 상태에서는 발주서 변환이 불가능합니다. APPROVED 상태만 가능합니다.` }, 400)
    }
    if (!pr.supplier_id) {
      return c.json({ success: false, error: '공급업체가 지정되지 않았습니다. 승인 시 공급업체를 지정해주세요.' }, 400)
    }

    const { results: requestItems } = await c.env.DB.prepare(`
      SELECT * FROM purchase_request_items WHERE request_id = ? ORDER BY sort_order ASC
    `).bind(id).all<PurchaseRequestItem>()

    if (!requestItems || requestItems.length === 0) {
      return c.json({ success: false, error: '요청 품목이 없습니다.' }, 400)
    }

    // PO items 구성: admin 값 우선
    const poItems = requestItems.map((ri) => ({
      item_id: ri.item_id || null,
      item_name: ri.item_name,
      category_name: ri.category_name || null,
      quantity: Number(ri.admin_quantity) || Number(ri.quantity) || 1,
      unit: ri.unit || 'EA',
      unit_price: Number(ri.admin_unit_price) || Number(ri.estimated_unit_price) || 0,
      notes: ri.notes || null,
      sort_order: ri.sort_order || 0
    }))

    // 금액 계산 (VAT 10% 일괄 적용)
    let totalAmount = 0
    for (const item of poItems) {
      totalAmount += item.unit_price * item.quantity
    }
    const vatAmount = totalAmount * 0.1
    const finalAmount = totalAmount + vatAmount

    // PO 번호 자동생성: YYYYMMDD-P001
    const today = new Date()
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '')

    const poSeqRow = await c.env.DB.prepare(`
      SELECT COALESCE(MAX(CAST(SUBSTR(po_number, 11) AS INTEGER)), 0) as max_seq
      FROM purchase_orders WHERE po_number LIKE ?
    `).bind(`${dateStr}-P%`).first<{ max_seq: number }>()

    const poNumber = `${dateStr}-P${String((poSeqRow?.max_seq ?? 0) + 1).padStart(3, '0')}`

    // INSERT purchase_orders (DRAFT 상태)
    const poResult = await c.env.DB.prepare(`
      INSERT INTO purchase_orders (
        po_number, supplier_id, status, order_date,
        total_amount, vat_amount, discount_amount, final_amount,
        notes, created_by, entity_id, created_at, updated_at
      ) VALUES (?, ?, 'DRAFT', ?, ?, ?, 0, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).bind(
      poNumber, pr.supplier_id,
      today.toISOString().split('T')[0],
      totalAmount, vatAmount, finalAmount,
      pr.notes || null, user?.id || 1,
      getEntityId(c) || 1
    ).run()

    const poId = poResult.meta.last_row_id

    for (const item of poItems) {
      const itemAmount = item.unit_price * item.quantity
      await c.env.DB.prepare(`
        INSERT INTO purchase_order_items (
          po_id, item_id, item_name, category_name,
          quantity, received_quantity, unit, unit_price, amount, vat_included,
          sort_order, notes
        ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, 1, ?, ?)
      `).bind(
        poId, item.item_id, item.item_name, item.category_name,
        item.quantity, item.unit, item.unit_price, itemAmount,
        item.sort_order, item.notes
      ).run()
    }

    await c.env.DB.prepare(`
      INSERT INTO po_status_history (po_id, to_status, changed_by, change_reason)
      VALUES (?, 'DRAFT', ?, ?)
    `).bind(poId, user?.id || 1, `발주 요청 #${pr.request_number} 변환`).run()

    await c.env.DB.prepare(`
      UPDATE purchase_requests SET status = 'CONVERTED', converted_po_id = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(poId, id).run()

    await c.env.DB.prepare(`
      INSERT INTO pr_status_history (request_id, from_status, to_status, changed_by, change_reason)
      VALUES (?, 'APPROVED', 'CONVERTED', ?, ?)
    `).bind(Number(id), user?.id || 1, `발주서 ${poNumber} 생성`).run()

    return c.json({ success: true, po_id: poId, po_number: poNumber })
  } catch (error) {
    console.error('src/routes/purchaseRequests.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// POST /:id/auto-convert - 공급업체별 자동 분리 발주서 생성 (ADMIN only)
// ============================================================================
prRouter.post('/:id/auto-convert', requireRole('ADMIN'), async (c) => {
  try {
    const user = c.get('user')
    const id = c.req.param('id')

    const pr = await c.env.DB.prepare(`SELECT id, status FROM purchase_requests WHERE id = ?`).bind(id).first<PurchaseRequest>()
    if (!pr) return c.json({ success: false, error: '발주 요청을 찾을 수 없습니다.' }, 404)
    if (pr.status !== 'APPROVED') {
      return c.json({ success: false, error: `'${pr.status}' 상태에서는 자동 변환이 불가능합니다. APPROVED 상태만 가능합니다.` }, 400)
    }

    const { results: requestItems } = await c.env.DB.prepare(`
      SELECT * FROM purchase_request_items WHERE request_id = ? ORDER BY sort_order ASC
    `).bind(id).all<PurchaseRequestItem>()

    if (!requestItems || requestItems.length === 0) {
      return c.json({ success: false, error: '요청 품목이 없습니다.' }, 400)
    }

    // 각 품목의 최근 공급업체 조회 후 그룹화
    const supplierGroups = new Map<number | string, { supplierId: number | null, supplierName: string, items: PurchaseRequestItem[] }>()

    for (const ri of requestItems) {
      let supplierId: number | null = null
      let supplierName = '미지정'

      if (ri.item_id) {
        // 해당 품목의 최근 입고 이력에서 공급업체 조회
        const recentPO = await c.env.DB.prepare(`
          SELECT po.supplier_id, c.client_name
          FROM purchase_order_items poi
          JOIN purchase_orders po ON poi.po_id = po.id
          LEFT JOIN clients c ON po.supplier_id = c.id
          WHERE poi.item_id = ? AND poi.received_quantity > 0
          ORDER BY po.created_at DESC
          LIMIT 1
        `).bind(ri.item_id).first<{ supplier_id: number | null; client_name: string | null }>()

        if (recentPO && recentPO.supplier_id) {
          supplierId = recentPO.supplier_id
          supplierName = recentPO.client_name || '공급업체'
        }
      }

      // 이력이 없으면 PR의 공급업체 사용
      if (!supplierId && pr.supplier_id) {
        supplierId = pr.supplier_id
        const supplierRow = await c.env.DB.prepare('SELECT client_name FROM clients WHERE id = ?').bind(pr.supplier_id).first<{ client_name: string }>()
        supplierName = supplierRow?.client_name || '공급업체'
      }

      const groupKey = supplierId || 'unassigned'
      if (!supplierGroups.has(groupKey)) {
        supplierGroups.set(groupKey, { supplierId, supplierName, items: [] })
      }
      supplierGroups.get(groupKey)!.items.push(ri)
    }

    // 공급업체 매핑 불가 시 에러
    if (supplierGroups.size === 1 && supplierGroups.has('unassigned')) {
      return c.json({
        success: false,
        error: '품목의 입고 이력이 없어 공급업체를 자동 매핑할 수 없습니다. PR에 공급업체를 지정하거나 일반 변환을 사용해주세요.'
      }, 400)
    }

    // 각 공급업체 그룹마다 PO 생성
    const createdPOs: { po_id: number, po_number: string, supplier_name: string, item_count: number }[] = []
    const today = new Date()
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '')

    for (const [groupKey, group] of supplierGroups) {
      if (!group.supplierId) continue // 미지정 그룹 건너뜀

      // PO 번호 생성 (루프 내에서 매번 최신 max_seq 조회)
      const loopSeqRow = await c.env.DB.prepare(`
        SELECT COALESCE(MAX(CAST(SUBSTR(po_number, 11) AS INTEGER)), 0) as max_seq
        FROM purchase_orders WHERE po_number LIKE ?
      `).bind(`${dateStr}-P%`).first<{ max_seq: number }>()

      const poNumber = `${dateStr}-P${String((loopSeqRow?.max_seq ?? 0) + 1).padStart(3, '0')}`

      // 금액 계산 (admin 값 우선)
      let totalAmount = 0
      const poItems = group.items.map((ri) => {
        const qty = Number(ri.admin_quantity) || Number(ri.quantity) || 1
        const price = Number(ri.admin_unit_price) || Number(ri.estimated_unit_price) || 0
        const amount = qty * price
        totalAmount += amount
        return { ...ri, qty, price, amount }
      })
      const vatAmount = totalAmount * 0.1
      const finalAmount = totalAmount + vatAmount

      // PO INSERT
      const poResult = await c.env.DB.prepare(`
        INSERT INTO purchase_orders (
          po_number, supplier_id, status, order_date,
          total_amount, vat_amount, discount_amount, final_amount,
          notes, created_by, entity_id, created_at, updated_at
        ) VALUES (?, ?, 'DRAFT', ?, ?, ?, 0, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).bind(
        poNumber, group.supplierId,
        today.toISOString().split('T')[0],
        totalAmount, vatAmount, finalAmount,
        `발주요청 #${pr.request_number} 자동 분리`, user?.id || 1,
        getEntityId(c) || 1
      ).run()

      const poId = poResult.meta.last_row_id

      // PO Items INSERT
      for (let i = 0; i < poItems.length; i++) {
        const item = poItems[i]
        await c.env.DB.prepare(`
          INSERT INTO purchase_order_items (
            po_id, item_id, item_name, category_name,
            quantity, received_quantity, unit, unit_price, amount, vat_included,
            sort_order, notes
          ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, 1, ?, ?)
        `).bind(
          poId, item.item_id || null, item.item_name, item.category_name || null,
          item.qty, item.unit || 'EA', item.price, item.amount,
          i, item.notes || null
        ).run()
      }

      // 상태 이력
      await c.env.DB.prepare(`
        INSERT INTO po_status_history (po_id, to_status, changed_by, change_reason)
        VALUES (?, 'DRAFT', ?, ?)
      `).bind(poId, user?.id || 1, `발주요청 #${pr.request_number} 자동 분리`).run()

      createdPOs.push({ po_id: poId as number, po_number: poNumber, supplier_name: group.supplierName, item_count: poItems.length }) // TODO: #17 poId as number - D1 meta.last_row_id 타입
    }

    // 미지정 품목 목록
    const unassigned = supplierGroups.get('unassigned')
    const unassignedItems = unassigned ? unassigned.items.map((ri) => ri.item_name) : []

    // 생성된 PO가 1개 이상이면 PR을 CONVERTED로 전환
    if (createdPOs.length > 0) {
      await c.env.DB.prepare(`
        UPDATE purchase_requests SET status = 'CONVERTED', converted_po_id = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(createdPOs[0].po_id, id).run()

      await c.env.DB.prepare(`
        INSERT INTO pr_status_history (request_id, from_status, to_status, changed_by, change_reason)
        VALUES (?, 'APPROVED', 'CONVERTED', ?, ?)
      `).bind(Number(id), user?.id || 1, `자동 분리: ${createdPOs.length}건 발주서 생성`).run()
    }

    return c.json({
      success: true,
      created_pos: createdPOs,
      unassigned_items: unassignedItems,
      message: `${createdPOs.length}건의 발주서가 생성되었습니다.` +
        (unassignedItems.length > 0 ? ` (미매핑 품목 ${unassignedItems.length}건은 제외됨)` : '')
    })
  } catch (error) {
    console.error('src/routes/purchaseRequests.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// DELETE /:id - 발주 요청 삭제 (PENDING/REJECTED만)
// ============================================================================
prRouter.delete('/:id', async (c) => {
  try {
    const user = c.get('user')
    const id = c.req.param('id')

    const pr = await c.env.DB.prepare(`SELECT id, requester_id, status FROM purchase_requests WHERE id = ?`).bind(id).first<PurchaseRequest>()
    if (!pr) return c.json({ success: false, error: '발주 요청을 찾을 수 없습니다.' }, 404)
    if (user?.role === 'MANAGER' && pr.requester_id !== user.id) {
      return c.json({ success: false, error: '접근 권한이 없습니다.' }, 403)
    }
    if (!['PENDING', 'REJECTED'].includes(pr.status)) {
      return c.json({
        success: false,
        error: `'${pr.status}' 상태의 발주 요청은 삭제할 수 없습니다. PENDING 또는 REJECTED만 가능합니다.`
      }, 400)
    }

    await c.env.DB.prepare(`DELETE FROM purchase_requests WHERE id = ?`).bind(id).run()

    return c.json({ success: true })
  } catch (error) {
    console.error('src/routes/purchaseRequests.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

export default prRouter