// ============================================================================
// BOM/MRP 라우트 — 자재명세서 + 자재소요계획
// ============================================================================

import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { runMrpCalculation } from '../utils/mrpCalculator'

const bom = new Hono<HonoEnv>()
bom.use('*', authMiddleware)
bom.use('*', requireRole('ADMIN', 'MANAGER'))

// ─── BOM CRUD ─────────────────────────────────────────────────────────────────

// GET / — BOM 목록
bom.get('/', async (c) => {
  try {
    const { category, item_id } = c.req.query()
    let query = `
      SELECT b.*, i.item_name as item_display_name, ic.category_name as item_category_name
      FROM bom_items b
      LEFT JOIN items i ON b.item_id = i.id
      LEFT JOIN item_categories ic ON i.category_id = ic.id
      WHERE b.is_active = 1
    `
    const params: any[] = []

    if (category) {
      query += ` AND b.category_name = ?`
      params.push(category)
    }
    if (item_id) {
      query += ` AND b.item_id = ?`
      params.push(Number(item_id))
    }
    query += ` ORDER BY COALESCE(b.category_name, ''), b.material_name`

    const stmt = params.length > 0 ? c.env.DB.prepare(query).bind(...params) : c.env.DB.prepare(query)
    const { results } = await stmt.all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('src/routes/bom.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// POST / — BOM 항목 추가
bom.post('/', async (c) => {
  try {
    const body = await c.req.json()
    const { item_id, category_name, material_item_id, material_name, usage_per_sqm, usage_unit, waste_factor, notes } = body
    const user = c.get('user')

    if (!material_item_id || !material_name) {
      return c.json({ success: false, error: '원재료 정보가 필요합니다.' }, 400)
    }
    if (!item_id && !category_name) {
      return c.json({ success: false, error: '품목 또는 카테고리를 지정해주세요.' }, 400)
    }

    const result = await c.env.DB.prepare(`
      INSERT INTO bom_items (item_id, category_name, material_item_id, material_name, usage_per_sqm, usage_unit, waste_factor, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      item_id || null,
      category_name || null,
      material_item_id,
      material_name,
      usage_per_sqm || 0,
      usage_unit || 'M',
      waste_factor || 1.0,
      notes || null,
      user?.id
    ).run()

    return c.json({ success: true, data: { id: result.meta?.last_row_id } })
  } catch (error) {
    console.error('src/routes/bom.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// PUT /:id — BOM 수정
bom.put('/:id', async (c) => {
  try {
    const id = Number(c.req.param('id'))
    const body = await c.req.json()
    const { item_id, category_name, material_item_id, material_name, usage_per_sqm, usage_unit, waste_factor, notes } = body

    await c.env.DB.prepare(`
      UPDATE bom_items SET item_id = ?, category_name = ?, material_item_id = ?, material_name = ?,
        usage_per_sqm = ?, usage_unit = ?, waste_factor = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      item_id || null, category_name || null, material_item_id, material_name,
      usage_per_sqm || 0, usage_unit || 'M', waste_factor || 1.0, notes || null, id
    ).run()

    return c.json({ success: true })
  } catch (error) {
    console.error('src/routes/bom.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// DELETE /:id — BOM 비활성화
bom.delete('/:id', async (c) => {
  try {
    const id = Number(c.req.param('id'))
    await c.env.DB.prepare(
      `UPDATE bom_items SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(id).run()
    return c.json({ success: true })
  } catch (error) {
    console.error('src/routes/bom.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// GET /by-item/:itemId — 품목별 BOM
bom.get('/by-item/:itemId', async (c) => {
  try {
    const itemId = Number(c.req.param('itemId'))
    const { results } = await c.env.DB.prepare(
      `SELECT * FROM bom_items WHERE item_id = ? AND is_active = 1 ORDER BY material_name`
    ).bind(itemId).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('src/routes/bom.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// GET /by-category/:cat — 카테고리별 BOM
bom.get('/by-category/:cat', async (c) => {
  try {
    const cat = c.req.param('cat')
    const { results } = await c.env.DB.prepare(
      `SELECT * FROM bom_items WHERE category_name = ? AND is_active = 1 ORDER BY material_name`
    ).bind(cat).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('src/routes/bom.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// GET /categories — BOM에 사용 가능한 카테고리 목록
bom.get('/categories', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      `SELECT id, category_name, category_code FROM item_categories WHERE is_active = 1 ORDER BY sort_order, category_name`
    ).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('src/routes/bom.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// GET /materials — 원재료 (재고 품목) 목록
bom.get('/materials', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT inv.id, inv.item_id, inv.quantity, inv.safe_stock,
             i.item_name, i.unit, ic.category_name
      FROM inventory inv
      JOIN items i ON inv.item_id = i.id
      LEFT JOIN item_categories ic ON i.category_id = ic.id
      WHERE 1=1
      ORDER BY i.item_name
    `).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('src/routes/bom.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ─── MRP ──────────────────────────────────────────────────────────────────────

// POST /mrp/run — MRP 실행
bom.post('/mrp/run', async (c) => {
  try {
    const body = await c.req.json()
    const user = c.get('user')

    const result = await runMrpCalculation(c.env.DB, {
      dateFrom: body.date_from,
      dateTo: body.date_to,
      orderId: body.order_id ? Number(body.order_id) : undefined,
      runBy: user?.id,
      runType: body.run_type || 'MANUAL',
    })

    return c.json({ success: true, data: result })
  } catch (error) {
    console.error('src/routes/bom.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// GET /mrp/runs — MRP 실행 이력
bom.get('/mrp/runs', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT mr.*, u.name as run_by_name
      FROM mrp_runs mr
      LEFT JOIN users u ON mr.run_by = u.id
      ORDER BY mr.created_at DESC
      LIMIT 50
    `).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('src/routes/bom.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// GET /mrp/runs/:id — MRP 결과 상세
bom.get('/mrp/runs/:id', async (c) => {
  try {
    const id = Number(c.req.param('id'))
    const run = await c.env.DB.prepare(
      `SELECT mr.*, u.name as run_by_name FROM mrp_runs mr LEFT JOIN users u ON mr.run_by = u.id WHERE mr.id = ?`
    ).bind(id).first()
    if (!run) return c.json({ success: false, error: '실행 이력을 찾을 수 없습니다.' }, 404)

    const { results } = await c.env.DB.prepare(
      `SELECT * FROM mrp_results WHERE run_id = ? ORDER BY shortfall DESC, material_name`
    ).bind(id).all()

    return c.json({ success: true, data: { run, results } })
  } catch (error) {
    console.error('src/routes/bom.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// POST /mrp/runs/:id/create-pr — 부족 자재 → PR 자동 생성
bom.post('/mrp/runs/:id/create-pr', async (c) => {
  try {
    const runId = Number(c.req.param('id'))
    const user = c.get('user')

    // 부족 자재 조회
    const { results: shortfalls } = await c.env.DB.prepare(
      `SELECT * FROM mrp_results WHERE run_id = ? AND shortfall > 0`
    ).bind(runId).all() as { results: any[] }

    if (shortfalls.length === 0) {
      return c.json({ success: false, error: '부족 자재가 없습니다.' }, 400)
    }

    // PR 번호 생성
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const { results: existingPRs } = await c.env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM purchase_requests WHERE request_number LIKE ?`
    ).bind(`PR-${today}-%`).all()
    const seq = ((existingPRs[0] as any)?.cnt || 0) + 1
    const requestNumber = `PR-${today}-${String(seq).padStart(3, '0')}`

    // PR 생성
    const prResult = await c.env.DB.prepare(`
      INSERT INTO purchase_requests (request_number, requester_id, urgency, status, reason, notes)
      VALUES (?, ?, 'NORMAL', 'PENDING', ?, ?)
    `).bind(
      requestNumber,
      user?.id,
      `MRP 자동 생성 (실행 #${runId})`,
      `MRP 실행 결과 부족 자재 ${shortfalls.length}건`
    ).run()

    const prId = prResult.meta?.last_row_id as number

    // PR 품목 추가
    for (let i = 0; i < shortfalls.length; i++) {
      const s = shortfalls[i]
      // inventory에서 item_id 조회
      const inv = await c.env.DB.prepare(
        `SELECT item_id FROM inventory WHERE id = ?`
      ).bind(s.material_item_id).first() as { item_id: number } | null

      await c.env.DB.prepare(`
        INSERT INTO purchase_request_items (request_id, item_id, item_name, quantity, unit, sort_order, notes)
        VALUES (?, ?, ?, ?, 'EA', ?, ?)
      `).bind(
        prId,
        inv?.item_id || null,
        s.material_name,
        Math.ceil(s.shortfall),
        i,
        `MRP 부족량: ${s.shortfall.toFixed(2)}`
      ).run()

      // MRP 결과에 PR ID 기록
      await c.env.DB.prepare(
        `UPDATE mrp_results SET auto_pr_id = ? WHERE id = ?`
      ).bind(prId, s.id).run()
    }

    // MRP 실행 기록 업데이트
    await c.env.DB.prepare(
      `UPDATE mrp_runs SET auto_pr_created = auto_pr_created + 1 WHERE id = ?`
    ).bind(runId).run()

    return c.json({ success: true, data: { prId, requestNumber, itemCount: shortfalls.length } })
  } catch (error) {
    console.error('src/routes/bom.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

export default bom
