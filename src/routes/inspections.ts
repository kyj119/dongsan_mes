import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { entityFilter, getEntityId } from '../utils/entityFilter'
import { kstYmd } from '../utils/kstDate'

const inspectionsRouter = new Hono<HonoEnv>()
inspectionsRouter.use('/*', authMiddleware)

// ============================================================================
// 검수 템플릿 관리
// ============================================================================

// GET /templates - 검수 템플릿 목록
inspectionsRouter.get('/templates', async (c) => {
  try {
    const category = c.req.query('category')
    let sql = `
      SELECT it.*,
        (SELECT COUNT(*) FROM inspection_template_items WHERE template_id = it.id) as item_count
      FROM inspection_templates it
      WHERE it.is_active = 1
    `
    const params: any[] = []
    if (category) {
      sql += ' AND (it.category_name = ? OR it.category_name IS NULL)'
      params.push(category)
    }
    sql += ' ORDER BY it.sort_order, it.template_name'

    const { results } = await c.env.DB.prepare(sql).bind(...params).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('inspections templates GET error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// GET /templates/:id - 템플릿 상세 (항목 포함)
inspectionsRouter.get('/templates/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const template = await c.env.DB.prepare('SELECT id, template_name, category_name, is_active, sort_order, created_at, updated_at FROM inspection_templates WHERE id = ?').bind(id).first()
    if (!template) return c.json({ success: false, error: '템플릿을 찾을 수 없습니다.' }, 404)

    const { results: items } = await c.env.DB.prepare(
      'SELECT id, template_id, check_item, check_type, description, is_required, sort_order, created_at FROM inspection_template_items WHERE template_id = ? ORDER BY sort_order'
    ).bind(id).all()

    return c.json({ success: true, data: { ...template, items } })
  } catch (error) {
    console.error('inspections template GET :id error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// POST /templates - 검수 템플릿 생성 (ADMIN)
inspectionsRouter.post('/templates', requireRole('ADMIN'), async (c) => {
  try {
    const body = await c.req.json<{
      template_name: string
      category_name?: string
      items: Array<{
        check_item: string
        check_type?: string
        description?: string
        is_required?: boolean
      }>
    }>()

    if (!body.template_name?.trim()) {
      return c.json({ success: false, error: '템플릿명을 입력해주세요.' }, 400)
    }

    const result = await c.env.DB.prepare(`
      INSERT INTO inspection_templates (template_name, category_name) VALUES (?, ?)
    `).bind(body.template_name.trim(), body.category_name?.trim() || null).run()

    const templateId = result.meta.last_row_id

    // 검수 항목 저장
    if (body.items?.length) {
      const tplItemStmts: D1PreparedStatement[] = []  // #350 단순 INSERT 루프 → batch
      for (let i = 0; i < body.items.length; i++) {
        const item = body.items[i]
        tplItemStmts.push(c.env.DB.prepare(`
          INSERT INTO inspection_template_items (template_id, check_item, check_type, description, is_required, sort_order)
          VALUES (?, ?, ?, ?, ?, ?)
        `).bind(
          templateId, item.check_item, item.check_type || 'PASS_FAIL',
          item.description || null, item.is_required !== false ? 1 : 0, i + 1
        ))
      }
      for (let i = 0; i < tplItemStmts.length; i += 80) {
        await c.env.DB.batch(tplItemStmts.slice(i, i + 80))
      }
    }

    return c.json({ success: true, data: { id: templateId }, message: '검수 템플릿이 생성되었습니다.' })
  } catch (error) {
    console.error('inspections template POST error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// PUT /templates/:id - 검수 템플릿 수정 (ADMIN)
inspectionsRouter.put('/templates/:id', requireRole('ADMIN'), async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json<{
      template_name?: string
      category_name?: string
      is_active?: number
      items?: Array<{
        id?: number
        check_item: string
        check_type?: string
        description?: string
        is_required?: boolean
      }>
    }>()

    await c.env.DB.prepare(`
      UPDATE inspection_templates SET
        template_name = COALESCE(?, template_name),
        category_name = ?,
        is_active = COALESCE(?, is_active),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      body.template_name?.trim() || null,
      body.category_name?.trim() ?? null,
      body.is_active ?? null,
      id
    ).run()

    // 항목 갱신 (전체 교체)
    if (body.items) {
      const stmts: any[] = [
        c.env.DB.prepare('DELETE FROM inspection_template_items WHERE template_id = ?').bind(id)
      ]
      for (let i = 0; i < body.items.length; i++) {
        const item = body.items[i]
        stmts.push(c.env.DB.prepare(`
          INSERT INTO inspection_template_items (template_id, check_item, check_type, description, is_required, sort_order)
          VALUES (?, ?, ?, ?, ?, ?)
        `).bind(
          id, item.check_item, item.check_type || 'PASS_FAIL',
          item.description || null, item.is_required !== false ? 1 : 0, i + 1
        ))
      }
      await c.env.DB.batch(stmts)
    }

    return c.json({ success: true, message: '검수 템플릿이 수정되었습니다.' })
  } catch (error) {
    console.error('inspections template PUT error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// DELETE /templates/:id - 검수 템플릿 비활성화 (ADMIN)
inspectionsRouter.delete('/templates/:id', requireRole('ADMIN'), async (c) => {
  try {
    const id = c.req.param('id')
    await c.env.DB.prepare(
      'UPDATE inspection_templates SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(id).run()
    return c.json({ success: true, message: '검수 템플릿이 비활성화되었습니다.' })
  } catch (error) {
    console.error('inspections template DELETE error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// 검수 결과 기록
// ============================================================================

// POST /results - 검수 결과 저장 (Q1-a: ADMIN/MANAGER/OPERATOR만)
inspectionsRouter.post('/results', requireRole('ADMIN', 'MANAGER', 'OPERATOR'), async (c) => {
  try {
    const user = c.get('user')
    const body = await c.req.json<{
      receipt_id: number
      receipt_item_id?: number
      template_id?: number
      mode?: 'quantity_only' | 'full'  // 기본 'full' (호환)
      items?: Array<{
        template_item_id?: number
        check_item: string
        check_result: string
        value?: string
        notes?: string
      }>
      notes?: string
    }>()

    if (!body.receipt_id) return c.json({ success: false, error: '입고 정보가 필요합니다.' }, 400)

    // 입고건 소유 검증 — 형제 조회(:305 :348 :412)는 entityFilter로 격리돼 있는데 등록만 무검증이던
    //   형제-비대칭 차단(2026-07-29 구조감사). 타법인 입고에 검수 부착 + inspection_status 변경 방지.
    const receiptEf = entityFilter(c)
    const ownedReceipt = await c.env.DB.prepare(
      `SELECT id FROM inventory_receipts WHERE id = ?${receiptEf.clause}`
    ).bind(body.receipt_id, ...receiptEf.params).first()
    if (!ownedReceipt) return c.json({ success: false, error: '입고 정보를 찾을 수 없습니다.' }, 404)

    const mode = body.mode || 'full'

    // Step 1. 수량 부족 판단 (두 모드 공통)
    const { results: receiptItemsSummary } = await c.env.DB.prepare(`
      SELECT SUM(rejected_quantity) as total_rejected
      FROM inventory_receipt_items WHERE receipt_id = ?
    `).bind(body.receipt_id).all()
    const totalRejected = Number((receiptItemsSummary[0] as any)?.total_rejected || 0)
    const hasShortage = totalRejected > 0

    // Step 2. 모드별 결과 판정
    let overallResult: 'PASSED' | 'FAILED' | 'PARTIAL'
    let itemsToInsert: Array<{ template_item_id: number | null; check_item: string; check_result: string; value: string | null; notes: string | null }>

    if (mode === 'quantity_only') {
      // 수량 전용: items 입력 받지 않음. rejected_quantity 만으로 판정
      overallResult = hasShortage ? 'PARTIAL' : 'PASSED'
      itemsToInsert = [{
        template_item_id: null,
        check_item: '수량 확인',
        check_result: hasShortage ? 'FAIL' : 'PASS',
        value: String(totalRejected),
        notes: hasShortage ? `거부 수량 합계 ${totalRejected}` : '전량 정상'
      }]
    } else {
      // 기존 full 모드: items 배열 필수
      if (!body.items?.length) return c.json({ success: false, error: '검수 항목이 필요합니다.' }, 400)
      const hasFail = body.items.some(i => i.check_result === 'FAIL')
      const allPass = body.items.every(i => i.check_result === 'PASS' || i.check_result === 'NA')
      overallResult = allPass ? 'PASSED' : hasFail ? 'FAILED' : 'PARTIAL'
      itemsToInsert = body.items.map(it => ({
        template_item_id: it.template_item_id || null,
        check_item: it.check_item,
        check_result: it.check_result,
        value: it.value || null,
        notes: it.notes || null
      }))
    }

    // FULL 모드 기준 FAIL 있음 OR 수량 부족 → PENDING_REVIEW (기존 로직 유지)
    const hasFail = itemsToInsert.some(i => i.check_result === 'FAIL')
    const inspectionStatus = (hasFail || hasShortage) ? 'PENDING_REVIEW' : 'NORMAL'

    // Step 3. 부모 INSERT
    const result = await c.env.DB.prepare(`
      INSERT INTO inspection_results (receipt_id, receipt_item_id, template_id, inspector_id, overall_result, notes, entity_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      body.receipt_id, body.receipt_item_id || null, body.template_id || null,
      user.id, overallResult, body.notes || null, getEntityId(c) || 1
    ).run()
    const resultId = result.meta.last_row_id

    // Step 4. items + status UPDATE (D1 batch 원자 실행)
    try {
      const stmts = [
        ...itemsToInsert.map(item =>
          c.env.DB.prepare(`
            INSERT INTO inspection_result_items (result_id, template_item_id, check_item, check_result, value, notes)
            VALUES (?, ?, ?, ?, ?, ?)
          `).bind(
            resultId, item.template_item_id, item.check_item,
            item.check_result, item.value, item.notes
          )
        ),
        c.env.DB.prepare(`
          UPDATE inventory_receipts
          SET inspection_status = ?
          WHERE id = ? AND (inspection_status IS NULL OR inspection_status = 'PENDING_REVIEW')
        `).bind(inspectionStatus, body.receipt_id),
      ]
      await c.env.DB.batch(stmts)
    } catch (batchErr) {
      try { await c.env.DB.prepare(`DELETE FROM inspection_results WHERE id = ?`).bind(resultId).run() } catch (_) {}
      throw batchErr
    }

    return c.json({
      success: true,
      data: { id: resultId, overall_result: overallResult, inspection_status: inspectionStatus, mode },
      message: mode === 'quantity_only'
        ? `수량 확인 완료 (${hasShortage ? '부족 감지' : '전량 정상'})`
        : `검수가 완료되었습니다. (${overallResult === 'PASSED' ? '합격' : overallResult === 'FAILED' ? '불합격' : '부분합격'})`
    })
  } catch (error) {
    console.error('inspections result POST error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// GET /results - 검수 결과 목록
inspectionsRouter.get('/results', async (c) => {
  try {
    const receiptId = c.req.query('receipt_id')
    const supplierId = c.req.query('supplier_id')
    // #354: 결과상태·검수일 범위 필터 + 페이지네이션
    const overallResult = c.req.query('overall_result')
    const dateFrom = c.req.query('date_from')
    const dateTo = c.req.query('date_to')
    const page = Math.max(1, parseInt(c.req.query('page') || '1'))
    const limit = Math.min(Math.max(parseInt(c.req.query('limit') || '50'), 1), 200)
    const offset = (page - 1) * limit
    const ef = entityFilter(c, 'ir')

    const buildWhere = () => {
      let w = `WHERE 1=1${ef.clause}`
      const p: any[] = [...ef.params]
      if (receiptId) { w += ' AND ir.receipt_id = ?'; p.push(receiptId) }
      if (supplierId) { w += ' AND rec.supplier_id = ?'; p.push(supplierId) }
      if (overallResult) { w += ' AND ir.overall_result = ?'; p.push(overallResult) }
      if (dateFrom) { w += ' AND DATE(ir.inspected_at) >= ?'; p.push(dateFrom) }
      if (dateTo) { w += ' AND DATE(ir.inspected_at) <= ?'; p.push(dateTo) }
      return { w, p }
    }
    const { w, p } = buildWhere()

    const countRow = await c.env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM inspection_results ir LEFT JOIN inventory_receipts rec ON ir.receipt_id = rec.id ${w}`
    ).bind(...p).first<{ cnt: number }>()
    const total = countRow?.cnt ?? 0

    const sql = `
      SELECT ir.*, u.name as inspector_name,
        rec.receipt_number, rec.supplier as supplier_name, rec.supplier_id
      FROM inspection_results ir
      LEFT JOIN users u ON ir.inspector_id = u.id
      LEFT JOIN inventory_receipts rec ON ir.receipt_id = rec.id
      ${w}
      ORDER BY ir.inspected_at DESC, ir.id DESC LIMIT ? OFFSET ?
    `
    const { results } = await c.env.DB.prepare(sql).bind(...p, limit, offset).all()
    return c.json({
      success: true,
      data: results,
      pagination: { page, limit, total, total_pages: Math.ceil(total / limit) }
    })
  } catch (error) {
    console.error('inspections results GET error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// GET /results/suppliers - 검수 이력에 등장한 공급업체 목록 (#354 드롭다운용)
inspectionsRouter.get('/results/suppliers', async (c) => {
  try {
    const ef = entityFilter(c, 'ir')
    const { results } = await c.env.DB.prepare(`
      SELECT DISTINCT rec.supplier_id, rec.supplier as supplier_name
      FROM inspection_results ir
      JOIN inventory_receipts rec ON ir.receipt_id = rec.id
      WHERE rec.supplier_id IS NOT NULL${ef.clause}
      ORDER BY supplier_name
    `).bind(...ef.params).all()
    return c.json({ success: true, data: results || [] })
  } catch (error) {
    console.error('inspections suppliers GET error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// GET /results/export/csv - 검수 결과 CSV (#354, 현재 필터 기준 전체)
inspectionsRouter.get('/results/export/csv', async (c) => {
  try {
    const receiptId = c.req.query('receipt_id')
    const supplierId = c.req.query('supplier_id')
    const overallResult = c.req.query('overall_result')
    const dateFrom = c.req.query('date_from')
    const dateTo = c.req.query('date_to')
    const ef = entityFilter(c, 'ir')

    let w = `WHERE 1=1${ef.clause}`
    const p: any[] = [...ef.params]
    if (receiptId) { w += ' AND ir.receipt_id = ?'; p.push(receiptId) }
    if (supplierId) { w += ' AND rec.supplier_id = ?'; p.push(supplierId) }
    if (overallResult) { w += ' AND ir.overall_result = ?'; p.push(overallResult) }
    if (dateFrom) { w += ' AND DATE(ir.inspected_at) >= ?'; p.push(dateFrom) }
    if (dateTo) { w += ' AND DATE(ir.inspected_at) <= ?'; p.push(dateTo) }

    const { results } = await c.env.DB.prepare(`
      SELECT ir.inspected_at, rec.receipt_number, rec.supplier as supplier_name,
        u.name as inspector_name, ir.overall_result, ir.notes
      FROM inspection_results ir
      LEFT JOIN users u ON ir.inspector_id = u.id
      LEFT JOIN inventory_receipts rec ON ir.receipt_id = rec.id
      ${w}
      ORDER BY ir.inspected_at DESC, ir.id DESC LIMIT 5001
    `).bind(...p).all()
    const truncated = (results || []).length > 5000  // #372
    const exportRows = truncated ? (results || []).slice(0, 5000) : (results || [])

    const { generateCsv, csvResponse, CSV_TRUNCATION_NOTE } = await import('../utils/csv')
    const labelMap: Record<string, string> = { PASSED: '합격', FAILED: '불합격', PARTIAL: '부분합격' }
    const headers = ['검수일시', '입고번호', '공급업체', '검수자', '결과', '비고']
    const rows = exportRows.map((r: any) => [
      (r.inspected_at || '').slice(0, 16).replace('T', ' '),
      r.receipt_number || '', r.supplier_name || '', r.inspector_name || '',
      labelMap[r.overall_result] || r.overall_result || '', r.notes || ''
    ])
    return csvResponse(c, `검수결과_${kstYmd()}.csv`, generateCsv(headers, rows, { footerNote: truncated ? CSV_TRUNCATION_NOTE : undefined }))
  } catch (error) {
    console.error('inspections CSV export error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// GET /results/:id - 검수 결과 상세
inspectionsRouter.get('/results/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const ef = entityFilter(c, 'ir')  // #445: 단건 cross-tenant read 차단(형제 목록은 ir 격리)
    const result = await c.env.DB.prepare(`
      SELECT ir.*, u.name as inspector_name
      FROM inspection_results ir
      LEFT JOIN users u ON ir.inspector_id = u.id
      WHERE ir.id = ?${ef.clause}
    `).bind(id, ...ef.params).first()

    if (!result) return c.json({ success: false, error: '검수 결과를 찾을 수 없습니다.' }, 404)

    const { results: items } = await c.env.DB.prepare(`
      SELECT id, result_id, template_item_id, check_item, check_result, value, notes, created_at FROM inspection_result_items WHERE result_id = ? ORDER BY id
    `).bind(id).all()

    return c.json({ success: true, data: { ...result, items } })
  } catch (error) {
    console.error('inspections result GET :id error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// GET /supplier-quality/:supplierId - 공급업체별 품질 이력 요약
inspectionsRouter.get('/supplier-quality/:supplierId', async (c) => {
  try {
    const supplierId = c.req.param('supplierId')

    const stats = await c.env.DB.prepare(`
      SELECT
        COUNT(*) as total_inspections,
        SUM(CASE WHEN ir.overall_result = 'PASSED' THEN 1 ELSE 0 END) as passed,
        SUM(CASE WHEN ir.overall_result = 'FAILED' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN ir.overall_result = 'PARTIAL' THEN 1 ELSE 0 END) as partial
      FROM inspection_results ir
      JOIN inventory_receipts rec ON ir.receipt_id = rec.id
      WHERE rec.supplier_id = ?
    `).bind(supplierId).first()

    const { results: recent } = await c.env.DB.prepare(`
      SELECT ir.id, ir.overall_result, ir.inspected_at, ir.notes,
        rec.receipt_number, u.name as inspector_name
      FROM inspection_results ir
      JOIN inventory_receipts rec ON ir.receipt_id = rec.id
      LEFT JOIN users u ON ir.inspector_id = u.id
      WHERE rec.supplier_id = ?
      ORDER BY ir.inspected_at DESC, ir.id DESC
      LIMIT 10
    `).bind(supplierId).all()

    return c.json({ success: true, data: { stats, recent } })
  } catch (error) {
    console.error('supplier-quality error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

export default inspectionsRouter
