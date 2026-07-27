/**
 * purchaseOrders/po-receipts.ts — 입고 이력/검수/명세서 라우트 (core.ts에서 분리, 2026-06-12 대형파일 분할 2/4)
 *
 * 입고이력 CSV · 거래명세서 첨부/조회(receipts/:receiptId/statement) · 입고이력 목록(receipts) ·
 * 검수내역(/:id/inspections) · 입고 대기 큐(receiving-queue). 배럴에서 core 앞 마운트. ⚠️ 이동만, 로직 수정 0.
 */
import { Hono } from 'hono'
import type { HonoEnv } from '../../types/env'
import { authMiddleware, requireRole } from '../../middleware/auth'
import { requireAnyPagePermission } from '../../middleware/permissions'
import { entityFilter } from '../../utils/entityFilter'
import { validateUpload } from '../../utils/uploadValidation'
import { kstYmd } from '../../utils/kstDate'

const poReceiptsRouter = new Hono<HonoEnv>()
poReceiptsRouter.use('/*', authMiddleware, requireAnyPagePermission('/purchase-orders', '/receiving'))

// ============================================================================
// GET /receipts/export/csv - 입고이력 CSV (현재 필터 기준, /receipts/:receiptId 보다 먼저 등록)
// ============================================================================
poReceiptsRouter.get('/receipts/export/csv', async (c) => {
  try {
    const { inspection_status = '', date_from = '', date_to = '', search = '' } = c.req.query()

    const ef = entityFilter(c, 'ir')
    let query = `
      SELECT
        ir.receipt_number, ir.receipt_date, ir.inspection_status, ir.notes,
        po.po_number,
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
    if (ef.clause) { whereClauses.push(ef.clause.replace(' AND ', '')); params.push(...ef.params) }
    if (inspection_status) { whereClauses.push('ir.inspection_status = ?'); params.push(inspection_status) }
    if (date_from) { whereClauses.push('ir.receipt_date >= ?'); params.push(date_from) }
    if (date_to) { whereClauses.push('ir.receipt_date <= ?'); params.push(date_to) }
    if (search) {
      whereClauses.push('(ir.receipt_number LIKE ? OR po.po_number LIKE ? OR c.client_name LIKE ?)')
      const p = `%${search}%`
      params.push(p, p, p)
    }
    if (whereClauses.length > 0) query += ' WHERE ' + whereClauses.join(' AND ')
    query += ' ORDER BY ir.receipt_date DESC, ir.id DESC LIMIT 5001'  // #372: 캡+1 조회로 잘림 감지

    const { results } = await c.env.DB.prepare(query).bind(...params).all()
    const truncated = (results || []).length > 5000
    const exportRows = truncated ? (results || []).slice(0, 5000) : (results || [])

    const inspLabels: Record<string, string> = {
      NORMAL: '정상', PENDING_REVIEW: '확인대기', WAITING_RESHIP: '재입고대기',
      CANCELLED: '취소', PASSED: '합격', PARTIAL: '부분합격', FAILED: '불합격'
    }

    const headers = ['입고번호', '입고일', '발주번호', '공급업체', '검수상태', '품목수', '합격수량', '불합격수량', '검수자', '비고']
    const rows = exportRows.map((r: any) => [
      r.receipt_number || '',
      (r.receipt_date || '').slice(0, 10),
      r.po_number || '',
      r.supplier_name || '',
      inspLabels[r.inspection_status] || r.inspection_status || '',
      r.item_count || 0,
      r.total_accepted || 0,
      r.total_rejected || 0,
      r.inspector_name || '',
      r.notes || ''
    ])

    const { generateCsv, csvResponse, CSV_TRUNCATION_NOTE } = await import('../../utils/csv')
    return csvResponse(c, `입고이력_${kstYmd()}.csv`, generateCsv(headers, rows, { footerNote: truncated ? CSV_TRUNCATION_NOTE : undefined }))
  } catch (error) {
    console.error('receiving CSV export error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// GET /templates - 템플릿 목록
// ============================================================================
// ── 거래명세서 첨부 (입고 건당) — 법인카드 영수증 R2 패턴 재사용 ──
// POST /receipts/:receiptId/statement — 거래명세서 파일 업로드
poReceiptsRouter.post('/receipts/:receiptId/statement', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const receiptId = c.req.param('receiptId')
    const ef = entityFilter(c)
    const own = await c.env.DB.prepare(
      `SELECT id FROM inventory_receipts WHERE id = ?${ef.clause}`
    ).bind(receiptId, ...ef.params).first()
    if (!own) return c.json({ success: false, error: '입고 내역을 찾을 수 없습니다.' }, 404)

    const formData = await c.req.formData()
    const file = formData.get('file') as File | null
    if (!file) return c.json({ success: false, error: '파일 필수' }, 400)

    // #357: 크기·MIME·확장자 검증 (거래명세서 = 이미지/PDF, 10MB)
    const v = validateUpload(file)
    if (!v.ok) return c.json({ success: false, error: v.error }, 400)
    const ext = v.ext
    const key = `po-statements/${kstYmd()}/${receiptId}_${Date.now()}.${ext}`
    await (c.env as any).R2_BUCKET.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } })

    await c.env.DB.prepare(
      `UPDATE inventory_receipts SET statement_file_key = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?${ef.clause}`
    ).bind(key, receiptId, ...ef.params).run()
    return c.json({ success: true, data: { key }, message: '거래명세서 첨부 완료' })
  } catch (error) {
    console.error('statement upload error:', error)
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// GET /receipts/:receiptId/statement — 거래명세서 파일 서빙 (key는 DB에서 조회, URL 미노출)
poReceiptsRouter.get('/receipts/:receiptId/statement', async (c) => {
  try {
    const receiptId = c.req.param('receiptId')
    const ef = entityFilter(c)
    const row = await c.env.DB.prepare(
      `SELECT statement_file_key FROM inventory_receipts WHERE id = ?${ef.clause}`
    ).bind(receiptId, ...ef.params).first<{ statement_file_key: string | null }>()
    if (!row || !row.statement_file_key) return c.json({ success: false, error: '첨부 없음' }, 404)
    const obj = await (c.env as any).R2_BUCKET.get(row.statement_file_key)
    if (!obj) return c.json({ success: false, error: '파일 없음' }, 404)
    const headers = new Headers()
    headers.set('Content-Type', obj.httpMetadata?.contentType || 'application/octet-stream')
    headers.set('Cache-Control', 'private, max-age=3600')
    return new Response(obj.body, { headers })
  } catch (error) {
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

poReceiptsRouter.get('/receipts', async (c) => {
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
        ir.total_amount, ir.notes, ir.po_id, ir.created_at, ir.statement_file_key,
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

    // #363/IDOR: 입고이력 목록 법인 격리 (신규 /receipts/export/csv와 정합. entity_id 컬럼 0232 존재)
    const ef = entityFilter(c, 'ir')
    if (ef.clause) { whereClauses.push(ef.clause.replace(' AND ', '')); params.push(...ef.params) }

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
    // 정렬 규약: 페이징 목록은 고유키 tie-break 필수 (동일 created_at 배치 데이터에서 페이지 간 중복/누락 방지)
    query += ' ORDER BY ir.receipt_date DESC, ir.id DESC LIMIT ? OFFSET ?'
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

    if (ef.clause) { countWhereClauses.push(ef.clause.replace(' AND ', '')); countParams.push(...ef.params) }

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

    const countRow2 = await c.env.DB.prepare(countQuery).bind(...countParams).first<{ count: number }>()
    const count2 = countRow2?.count ?? 0

    return c.json({
      success: true,
      data: results,
      pagination: {
        page: parseInt(page),
        limit: safeLimit,
        total: count2,
        total_pages: Math.ceil(count2 / safeLimit)
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
poReceiptsRouter.get('/:id/inspections', async (c) => {
  try {
    const id = c.req.param('id')

    const ef = entityFilter(c)  // #358계열: 발주 검수이력 조회 법인 격리
    const po = await c.env.DB.prepare(`SELECT id FROM purchase_orders WHERE id = ?${ef.clause}`).bind(id, ...ef.params).first()
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
    type InspectionRow = Record<string, unknown>
    const inspectionMap = new Map<number, Record<string, unknown>>()
    for (const row of rows as InspectionRow[]) {
      if (!inspectionMap.has(row.receipt_id as number)) {
        inspectionMap.set(row.receipt_id as number, {
          receipt_id: row.receipt_id,
          receipt_number: row.receipt_number,
          receipt_date: row.receipt_date,
          inspection_status: row.inspection_status,
          receipt_notes: row.receipt_notes,
          inspector_name: row.inspector_name,
          items: []
        })
      }
      ;(inspectionMap.get(row.receipt_id as number) as Record<string, unknown[]>).items.push({
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
// GET /receiving-queue - 입고 대기 PO + 라인 (⚠️ /:id 보다 먼저)
// ============================================================================
// scope=mine (기본 OPERATOR): 내 담당 라인만 / scope=all (ADMIN/MANAGER): 전체
// 응답: PO 카드 렌더용 — PO 헤더 + 대기 라인 배열 (PO별 그룹)
// ============================================================================
poReceiptsRouter.get('/receiving-queue', async (c) => {
  try {
    const user = c.get('user')
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

    const { results } = await c.env.DB.prepare(sql).bind(...binds, ...entityFilter(c, 'po').params).all()
    const rows = (results || []) as Record<string, unknown>[]

    // PO 단위 그룹화
    const poMap = new Map<number, Record<string, unknown> & { lines: Record<string, unknown>[] }>()
    for (const r of rows) {
      const poId = r.po_id as number
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


export default poReceiptsRouter
