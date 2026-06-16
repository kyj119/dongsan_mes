// src/routes/workbench.ts — 웹 캔버스 IA 워크벤치 P1: 시안 검수 (그룹 ↔ 품목 매칭)
// spec: docs/superpowers/specs/2026-06-11-web-canvas-ia-workbench.md §5
import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { entityFilter, orderVisibilityFilter, getEntityId } from '../utils/entityFilter'
import { validateUpload } from '../utils/uploadValidation'

const workbenchRouter = new Hono<HonoEnv>()

workbenchRouter.use('/*', authMiddleware, requireRole('ADMIN', 'MANAGER', 'DESIGNER'))

// ── GET /api/workbench/orders — AI 분석이 있는 최근 주문 목록 (검수 대상) ──
workbenchRouter.get('/orders', async (c) => {
  try {
    const q = (c.req.query('q') || '').trim()
    const limit = Math.min(parseInt(c.req.query('limit') || '50', 10) || 50, 200)
    const ef = orderVisibilityFilter(c, 'o')

    let where = `o.ai_analysis_id IS NOT NULL`
    const params: unknown[] = []
    if (q) {
      where += ` AND (o.order_number LIKE ? OR cl.client_name LIKE ?)`
      params.push(`%${q}%`, `%${q}%`)
    }

    const { results } = await c.env.DB.prepare(`
      SELECT o.id, o.order_number, o.created_at, o.status, o.ai_analysis_id,
             cl.client_name as client_name,
             (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) as item_count,
             (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id AND oi.ai_group_index IS NOT NULL) as matched_count,
             ar.status as analysis_status
      FROM orders o
      LEFT JOIN clients cl ON cl.id = o.client_id
      LEFT JOIN ai_analysis_requests ar ON ar.id = o.ai_analysis_id
      WHERE ${where}${ef.clause}
      ORDER BY o.created_at DESC
      LIMIT ?
    `).bind(...params, ...ef.params, limit).all()

    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('Workbench orders error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ── GET /api/workbench/analyses/:orderId — 그룹 썸네일 + 품목 매칭 현황 ──
workbenchRouter.get('/analyses/:orderId', async (c) => {
  try {
    const orderId = parseInt(c.req.param('orderId'), 10)
    if (!orderId) return c.json({ success: false, error: '잘못된 주문 ID' }, 400)

    const ef = orderVisibilityFilter(c, 'o')
    const order = await c.env.DB.prepare(`
      SELECT o.id, o.order_number, o.ai_analysis_id, o.ai_file_path,
             cl.client_name as client_name
      FROM orders o
      LEFT JOIN clients cl ON cl.id = o.client_id
      WHERE o.id = ?${ef.clause}
    `).bind(orderId, ...ef.params).first<{
      id: number; order_number: string; ai_analysis_id: number | null
      ai_file_path: string | null; client_name: string | null
    }>()
    if (!order) return c.json({ success: false, error: '주문을 찾을 수 없습니다.' }, 404)
    if (!order.ai_analysis_id) return c.json({ success: false, error: 'AI 분석이 없는 주문입니다.' }, 400)

    const analysis = await c.env.DB.prepare(
      `SELECT id, status, groups_json, error_message FROM ai_analysis_requests WHERE id = ?`
    ).bind(order.ai_analysis_id).first<{
      id: number; status: string; groups_json: string | null; error_message: string | null
    }>()

    let groups: unknown[] = []
    try { groups = analysis?.groups_json ? JSON.parse(analysis.groups_json) : [] } catch (_e) { groups = [] }

    const { results: items } = await c.env.DB.prepare(`
      SELECT oi.id, oi.item_name, oi.category_name, oi.width, oi.height,
             oi.quantity, oi.ai_group_index
      FROM order_items oi
      WHERE oi.order_id = ?
      ORDER BY oi.id
    `).bind(orderId).all()

    return c.json({
      success: true,
      data: {
        order: { id: order.id, order_number: order.order_number, client_name: order.client_name, ai_file_path: order.ai_file_path },
        analysis: { id: analysis?.id, status: analysis?.status, error_message: analysis?.error_message },
        groups,
        items,
      },
    })
  } catch (error) {
    console.error('Workbench analyses error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ── PUT /api/workbench/match — 품목 ↔ 그룹 매칭 수정 ──
workbenchRouter.put('/match', async (c) => {
  try {
    const body = await c.req.json<{ order_item_id: number; ai_group_index: number | null }>()
    if (!body.order_item_id) return c.json({ success: false, error: 'order_item_id가 필요합니다.' }, 400)
    const gi = body.ai_group_index
    if (gi !== null && (typeof gi !== 'number' || gi < 0 || !Number.isInteger(gi))) {
      return c.json({ success: false, error: 'ai_group_index는 null 또는 0 이상의 정수여야 합니다.' }, 400)
    }

    // 품목 → 부모 주문 entity 검증 (IDOR 가드)
    const ef = orderVisibilityFilter(c, 'o')
    const item = await c.env.DB.prepare(`
      SELECT oi.id, o.ai_analysis_id
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE oi.id = ?${ef.clause}
    `).bind(body.order_item_id, ...ef.params).first<{ id: number; ai_analysis_id: number | null }>()
    if (!item) return c.json({ success: false, error: '품목을 찾을 수 없습니다.' }, 404)

    // 그룹 인덱스 범위 검증 (분석 결과 내 존재 여부)
    if (gi !== null && item.ai_analysis_id) {
      const analysis = await c.env.DB.prepare(
        `SELECT groups_json FROM ai_analysis_requests WHERE id = ?`
      ).bind(item.ai_analysis_id).first<{ groups_json: string | null }>()
      let count = 0
      try { count = analysis?.groups_json ? JSON.parse(analysis.groups_json).length : 0 } catch (_e) { count = 0 }
      if (gi >= count) {
        return c.json({ success: false, error: `그룹 인덱스 범위 초과 (0~${count - 1})` }, 400)
      }
    }

    await c.env.DB.prepare(
      `UPDATE order_items SET ai_group_index = ? WHERE id = ?`
    ).bind(gi, body.order_item_id).run()

    return c.json({ success: true, data: { order_item_id: body.order_item_id, ai_group_index: gi } })
  } catch (error) {
    console.error('Workbench match error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ── GET /api/workbench/archives — 원본 아카이브 목록 (정리 보드 표시) ──
// spec: docs/superpowers/specs/2026-06-16-ia-editor-nesting-intake.md §6.1·7
// IA가 가공 시 보존한 고객 원본(Z:\원본\…)의 기록. 작업 EPS는 auto_process_jobs 참조.
workbenchRouter.get('/archives', async (c) => {
  try {
    const q = (c.req.query('q') || '').trim()
    const orderId = parseInt(c.req.query('order_id') || '', 10) || 0
    const limit = Math.min(parseInt(c.req.query('limit') || '50', 10) || 50, 200)
    const ef = entityFilter(c, 'oa')

    let where = '1=1'
    const params: unknown[] = []
    if (orderId) { where += ' AND oa.order_id = ?'; params.push(orderId) }
    if (q) {
      where += ' AND (oa.original_filename LIKE ? OR o.order_number LIKE ? OR cl.client_name LIKE ?)'
      params.push(`%${q}%`, `%${q}%`, `%${q}%`)
    }

    const { results } = await c.env.DB.prepare(`
      SELECT oa.id, oa.order_id, oa.ai_analysis_id, oa.archive_path, oa.original_filename,
             oa.file_ext, oa.thumbnail_base64, oa.status, oa.archived_at,
             o.order_number, cl.client_name as client_name
      FROM original_archives oa
      LEFT JOIN orders o ON o.id = oa.order_id
      LEFT JOIN clients cl ON cl.id = o.client_id
      WHERE ${where}${ef.clause}
      ORDER BY oa.archived_at DESC
      LIMIT ?
    `).bind(...params, ...ef.params, limit).all()

    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('Workbench archives error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ── POST /api/workbench/files/analyze — 편집기 업로드 파일 분석 큐잉 (ExtractGroups) ──
// spec: docs/superpowers/specs/2026-06-16-ia-editor-nesting-intake.md §5.1·7
// /api/ai-analysis/upload(ADMIN 전용)과 동일 흐름이나 워크벤치 역할(DESIGNER 포함) 게이트를 통과.
// 업로드 → ai_analysis_requests(pending) → IA 에이전트가 GET /api/ai-analysis?status=pending 으로 픽업.
workbenchRouter.post('/files/analyze', async (c) => {
  try {
    const formData = await c.req.formData()
    const file = formData.get('file') as File | null
    if (!file) return c.json({ success: false, error: '파일이 없습니다.' }, 400)

    // #357 패턴: 크기·확장자 검증 (AI/EPS/PDF/이미지, 50MB)
    const v = validateUpload(file, {
      maxBytes: 50 * 1024 * 1024,
      allowedMimePrefixes: ['image/', 'application/pdf', 'application/postscript', 'application/octet-stream'],
      allowedExts: ['ai', 'eps', 'pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'psd', 'tif', 'tiff'],
    })
    if (!v.ok) return c.json({ success: false, error: v.error }, 400)

    // 분석 요청 생성 (entity_id 격리)
    const created = await c.env.DB.prepare(
      `INSERT INTO ai_analysis_requests (file_path, status, entity_id) VALUES (?, 'pending', ?)
       RETURNING id`
    ).bind(file.name, getEntityId(c)).first<{ id: number }>()
    if (!created) return c.json({ success: false, error: '분석 요청 생성 실패' }, 500)
    const analysisId = created.id

    // R2 업로드 (키 sanitize: path traversal / 키 인젝션 방어)
    const safeName = (file.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200)
    const r2Key = `sources/${analysisId}/${safeName}`
    await c.env.R2_BUCKET.put(r2Key, file.stream(), {
      httpMetadata: { contentType: file.type || 'application/octet-stream' },
    })
    await c.env.DB.prepare(`UPDATE ai_analysis_requests SET file_path = ? WHERE id = ?`)
      .bind(`r2://${r2Key}`, analysisId).run()

    return c.json({ success: true, data: { id: analysisId, filename: file.name, status: 'pending' } })
  } catch (error) {
    console.error('Workbench analyze error:', error)
    return c.json({ success: false, error: '업로드/분석 요청 실패' }, 500)
  }
})

// ── GET /api/workbench/files — 편집기 데이터원: 업로드 분석 파일 + 그룹 썸네일 ──
// spec: §5.1·7. 브라우저가 세션 업로드 id(?ids=1,2,3)를 넘기면 entity 격리하여 그룹 요약 반환.
workbenchRouter.get('/files', async (c) => {
  try {
    const idsParam = (c.req.query('ids') || '').trim()
    const ids = idsParam
      ? idsParam.split(',').map((s) => parseInt(s, 10)).filter((n) => Number.isInteger(n) && n > 0).slice(0, 80)
      : []
    if (ids.length === 0) return c.json({ success: true, data: [] })

    const ef = entityFilter(c, 'ai_analysis_requests')
    const placeholders = ids.map(() => '?').join(',')
    const { results } = await c.env.DB.prepare(`
      SELECT id, file_path, status, groups_json, canvas_json, error_message, created_at, updated_at
      FROM ai_analysis_requests
      WHERE id IN (${placeholders})${ef.clause}
      ORDER BY id ASC
    `).bind(...ids, ...ef.params).all<{
      id: number; file_path: string | null; status: string
      groups_json: string | null; canvas_json: string | null; error_message: string | null
      created_at: string; updated_at: string
    }>()

    const data = results.map((r) => {
      type G = { index: number; name: string; thumbnail_base64: string | null; width_mm: number | null; height_mm: number | null; canvas_x_pt: number | null; canvas_y_pt: number | null; canvas_w_pt: number | null; canvas_h_pt: number | null }
      let groups: G[] = []
      try {
        const parsed = r.groups_json ? JSON.parse(r.groups_json) : []
        if (Array.isArray(parsed)) {
          groups = parsed.map((g: any, idx: number) => ({
            index: (g && g.index != null) ? g.index : idx,
            name: (g && g.name) ? String(g.name) : '',
            thumbnail_base64: (g && g.thumbnail_base64) ? String(g.thumbnail_base64) : null,
            width_mm: (g && g.width_mm != null) ? Number(g.width_mm) : null,
            height_mm: (g && g.height_mm != null) ? Number(g.height_mm) : null,
            canvas_x_pt: (g && g.canvas_x_pt != null) ? Number(g.canvas_x_pt) : null,
            canvas_y_pt: (g && g.canvas_y_pt != null) ? Number(g.canvas_y_pt) : null,
            canvas_w_pt: (g && g.canvas_w_pt != null) ? Number(g.canvas_w_pt) : null,
            canvas_h_pt: (g && g.canvas_h_pt != null) ? Number(g.canvas_h_pt) : null,
          }))
        }
      } catch (_e) { groups = [] }
      let canvas: { w_pt: number | null; h_pt: number | null; w_mm: number | null; h_mm: number | null; render_base64: string | null } | null = null
      try {
        if (r.canvas_json) {
          const cj = JSON.parse(r.canvas_json)
          canvas = {
            w_pt: cj.w_pt != null ? Number(cj.w_pt) : null,
            h_pt: cj.h_pt != null ? Number(cj.h_pt) : null,
            w_mm: cj.w_mm != null ? Number(cj.w_mm) : null,
            h_mm: cj.h_mm != null ? Number(cj.h_mm) : null,
            render_base64: cj.render_base64 ? String(cj.render_base64) : null,
          }
        }
      } catch (_e) { canvas = null }
      const fp = r.file_path || ''
      const filename = fp.replace(/^r2:\/\//, '').split('/').pop() || fp || `#${r.id}`
      return {
        id: r.id, filename, status: r.status,
        error_message: r.error_message, group_count: groups.length, groups, canvas,
      }
    })

    return c.json({ success: true, data })
  } catch (error) {
    console.error('Workbench files error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ── POST /api/workbench/archive — IA 원본 아카이브 완료 보고 ──
// spec: docs/superpowers/specs/2026-06-16-ia-editor-nesting-intake.md §5.1·6·7·8
// IA(Program.cs)가 가공 시 고객 원본을 Z:\원본\…에 보존한 뒤 호출. order_number로 주문을 resolve해
// order_id·ai_analysis_id·entity_id를 채운다. 동일 archive_path 재보고는 멱등 처리(중복 행 방지).
workbenchRouter.post('/archive', async (c) => {
  try {
    const body = await c.req.json<{
      order_number?: string
      order_id?: number
      ai_analysis_id?: number
      order_ai_file_id?: number
      archive_path: string
      original_filename?: string
      file_ext?: string
      thumbnail_base64?: string
      status?: string
    }>()

    if (!body.archive_path || typeof body.archive_path !== 'string') {
      return c.json({ success: false, error: 'archive_path가 필요합니다.' }, 400)
    }
    const status = body.status === 'failed' ? 'failed' : 'archived'

    let orderId: number | null = body.order_id ?? null
    let aiAnalysisId: number | null = body.ai_analysis_id ?? null
    let entityId: number | null = null

    // order_number(우선) 또는 order_id로 주문 resolve → order_id·ai_analysis_id·entity_id 보강
    let ord: { id: number; ai_analysis_id: number | null; entity_id: number | null } | null = null
    if (body.order_number) {
      ord = await c.env.DB.prepare(
        `SELECT id, ai_analysis_id, entity_id FROM orders WHERE order_number = ? ORDER BY id DESC LIMIT 1`
      ).bind(body.order_number).first()
    } else if (orderId) {
      ord = await c.env.DB.prepare(
        `SELECT id, ai_analysis_id, entity_id FROM orders WHERE id = ?`
      ).bind(orderId).first()
    }
    if (ord) {
      orderId = ord.id
      if (aiAnalysisId == null) aiAnalysisId = ord.ai_analysis_id
      if (ord.entity_id != null) entityId = ord.entity_id
    }

    // 주문에서 entity를 못 구하면 분석에서 (주문 미연결 인입 파일 대비)
    if (entityId == null && aiAnalysisId) {
      const an = await c.env.DB.prepare(
        `SELECT entity_id FROM ai_analysis_requests WHERE id = ?`
      ).bind(aiAnalysisId).first<{ entity_id: number | null }>()
      if (an?.entity_id != null) entityId = an.entity_id
    }
    if (entityId == null) entityId = 1

    // 동일 archive_path 멱등 (재처리·다중품목 공유 원본 중복 행 방지)
    const dup = await c.env.DB.prepare(
      `SELECT id FROM original_archives WHERE archive_path = ? LIMIT 1`
    ).bind(body.archive_path).first<{ id: number }>()
    if (dup) return c.json({ success: true, data: { id: dup.id, deduped: true } })

    const created = await c.env.DB.prepare(`
      INSERT INTO original_archives
        (order_id, ai_analysis_id, order_ai_file_id, archive_path, original_filename, file_ext, thumbnail_base64, status, entity_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id
    `).bind(
      orderId, aiAnalysisId, body.order_ai_file_id ?? null,
      body.archive_path, body.original_filename ?? null, body.file_ext ?? null,
      body.thumbnail_base64 ?? null, status, entityId,
    ).first<{ id: number }>()

    return c.json({ success: true, data: { id: created?.id ?? null, order_id: orderId, ai_analysis_id: aiAnalysisId, entity_id: entityId, status } })
  } catch (error) {
    console.error('Workbench archive error:', error)
    return c.json({ success: false, error: '아카이브 기록 실패' }, 500)
  }
})

// ── 시트 네스팅 (sheet_layouts) CRUD — IA 편집기 P3 ──
// spec: docs/superpowers/specs/2026-06-16-ia-editor-nesting-intake.md §5.4·6·7·12
// 자동배치(shelfBinPack)는 브라우저에서 수행, 서버는 결과 좌표·메타를 entity 격리 보존.
// 실제 출력(EPS/DXF/JPG)은 SheetLayout.jsx(P5). canvas_json/placements_json은 JSON 문자열.
function strOrJson(v: unknown): string | null {
  if (v == null) return null
  return typeof v === 'string' ? v : JSON.stringify(v)
}

// POST /api/workbench/sheets — 네스팅 결과 생성
workbenchRouter.post('/sheets', async (c) => {
  try {
    const body = await c.req.json<{
      name?: string; mode?: string; canvas_json?: unknown; placements_json?: unknown
      item_code?: string; source_analysis_ids?: unknown; sheet_count?: number; efficiency?: number
    }>()
    const mode = body.mode === 'flatbed' ? 'flatbed' : 'roll'
    const name = (body.name || '').trim() || `네스팅 ${mode === 'flatbed' ? '평판' : '롤'}`
    const user = c.get('user')
    const created = await c.env.DB.prepare(`
      INSERT INTO sheet_layouts
        (name, mode, canvas_json, placements_json, item_code, source_analysis_ids, sheet_count, efficiency, status, entity_id, created_by, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, datetime('now'))
      RETURNING id
    `).bind(
      name, mode,
      strOrJson(body.canvas_json) || '{}',
      strOrJson(body.placements_json) || '[]',
      body.item_code ?? null,
      strOrJson(body.source_analysis_ids),
      Number.isInteger(body.sheet_count) ? body.sheet_count! : 1,
      (typeof body.efficiency === 'number') ? body.efficiency : null,
      getEntityId(c), user?.id ?? null,
    ).first<{ id: number }>()
    return c.json({ success: true, data: { id: created?.id ?? null, name, mode } })
  } catch (error) {
    console.error('Workbench sheets create error:', error)
    return c.json({ success: false, error: '네스팅 저장 실패' }, 500)
  }
})

// GET /api/workbench/sheets — 목록 (entity 격리)
workbenchRouter.get('/sheets', async (c) => {
  try {
    const limit = Math.min(parseInt(c.req.query('limit') || '50', 10) || 50, 200)
    const ef = entityFilter(c, 'sheet_layouts')
    const { results } = await c.env.DB.prepare(`
      SELECT id, name, mode, item_code, sheet_count, efficiency, status, created_at, updated_at
      FROM sheet_layouts
      WHERE 1=1${ef.clause}
      ORDER BY id DESC
      LIMIT ?
    `).bind(...ef.params, limit).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('Workbench sheets list error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// GET /api/workbench/sheets/:id — 단건 (placements 포함)
workbenchRouter.get('/sheets/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'), 10)
    if (!id) return c.json({ success: false, error: '잘못된 ID' }, 400)
    const ef = entityFilter(c, 'sheet_layouts')
    const row = await c.env.DB.prepare(
      `SELECT * FROM sheet_layouts WHERE id = ?${ef.clause}`
    ).bind(id, ...ef.params).first()
    if (!row) return c.json({ success: false, error: '네스팅을 찾을 수 없습니다.' }, 404)
    return c.json({ success: true, data: row })
  } catch (error) {
    console.error('Workbench sheet get error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// PUT /api/workbench/sheets/:id — 수정 (placements·canvas·name·item_code·status)
workbenchRouter.put('/sheets/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'), 10)
    if (!id) return c.json({ success: false, error: '잘못된 ID' }, 400)
    const ef = entityFilter(c, 'sheet_layouts')
    // 소유(entity) 검증
    const own = await c.env.DB.prepare(
      `SELECT id FROM sheet_layouts WHERE id = ?${ef.clause}`
    ).bind(id, ...ef.params).first<{ id: number }>()
    if (!own) return c.json({ success: false, error: '네스팅을 찾을 수 없습니다.' }, 404)

    const body = await c.req.json<{
      name?: string; canvas_json?: unknown; placements_json?: unknown
      item_code?: string; sheet_count?: number; efficiency?: number; status?: string
    }>()
    const sets: string[] = ['updated_at = datetime(\'now\')']
    const vals: unknown[] = []
    if (body.name !== undefined) { sets.push('name = ?'); vals.push(String(body.name)) }
    if (body.canvas_json !== undefined) { sets.push('canvas_json = ?'); vals.push(strOrJson(body.canvas_json) || '{}') }
    if (body.placements_json !== undefined) { sets.push('placements_json = ?'); vals.push(strOrJson(body.placements_json) || '[]') }
    if (body.item_code !== undefined) { sets.push('item_code = ?'); vals.push(body.item_code ?? null) }
    if (body.sheet_count !== undefined) { sets.push('sheet_count = ?'); vals.push(Number.isInteger(body.sheet_count) ? body.sheet_count : 1) }
    if (body.efficiency !== undefined) { sets.push('efficiency = ?'); vals.push(typeof body.efficiency === 'number' ? body.efficiency : null) }
    if (body.status !== undefined && ['draft', 'rendered', 'ordered'].includes(body.status)) { sets.push('status = ?'); vals.push(body.status) }

    await c.env.DB.prepare(`UPDATE sheet_layouts SET ${sets.join(', ')} WHERE id = ?`).bind(...vals, id).run()
    return c.json({ success: true })
  } catch (error) {
    console.error('Workbench sheet update error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// DELETE /api/workbench/sheets/:id
workbenchRouter.delete('/sheets/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'), 10)
    if (!id) return c.json({ success: false, error: '잘못된 ID' }, 400)
    const ef = entityFilter(c, 'sheet_layouts')
    const own = await c.env.DB.prepare(
      `SELECT id FROM sheet_layouts WHERE id = ?${ef.clause}`
    ).bind(id, ...ef.params).first<{ id: number }>()
    if (!own) return c.json({ success: false, error: '네스팅을 찾을 수 없습니다.' }, 404)
    await c.env.DB.prepare(`DELETE FROM sheet_layouts WHERE id = ?`).bind(id).run()
    return c.json({ success: true })
  } catch (error) {
    console.error('Workbench sheet delete error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

export default workbenchRouter
