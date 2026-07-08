// src/routes/workbench.ts — 웹 캔버스 IA 워크벤치 P1: 시안 검수 (그룹 ↔ 품목 매칭)
// spec: docs/archive/superpowers/specs/2026-06-11-web-canvas-ia-workbench.md §5 (ia-editor 마스터에 흡수)
import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { entityFilter, orderVisibilityFilter, getEntityId } from '../utils/entityFilter'
import { validateUpload } from '../utils/uploadValidation'
import { hydrateGroups, hydrateGroupsJson, hydrateCanvasJson } from '../utils/thumbnailStore'

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
    // R2 이관: 썸네일 base64 복원(보드 매칭 화면 무수정)
    await hydrateGroups(c.env, groups as Parameters<typeof hydrateGroups>[1])

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

    // R2 이관: 썸네일/캔버스 렌더 base64 복원(아래 sync map이 g.thumbnail_base64·cj.render_base64를 읽으므로 문자열 단계에서 hydrate)
    for (const r of results) {
      r.groups_json = (await hydrateGroupsJson(c.env, r.groups_json)) ?? null
      r.canvas_json = (await hydrateCanvasJson(c.env, r.canvas_json)) ?? null
    }

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

// ── 시트 네스팅 독립 렌더잡 (P5 출력) — spec §5.5 ──
// 주문 없이 sheet_layout을 SheetLayout.jsx로 직접 렌더(EPS/DXF/JPG). v1: 단일 분석 + 단일 시트.
// render_status: none → queued(사용자) → rendering(에이전트 claim) → done|error.

// POST /api/workbench/sheets/:id/render — 출력 큐잉
workbenchRouter.post('/sheets/:id/render', async (c) => {
  try {
    const id = parseInt(c.req.param('id'), 10)
    if (!id) return c.json({ success: false, error: '잘못된 ID' }, 400)
    const ef = entityFilter(c, 'sheet_layouts')
    const sheet = await c.env.DB.prepare(
      `SELECT id, source_analysis_ids, placements_json, render_status FROM sheet_layouts WHERE id = ?${ef.clause}`
    ).bind(id, ...ef.params).first<{ id: number; source_analysis_ids: string | null; placements_json: string | null; render_status: string }>()
    if (!sheet) return c.json({ success: false, error: '네스팅을 찾을 수 없습니다.' }, 404)

    // 소스 분석: 1개 이상 (멀티소스 임포지션 허용 — 여러 파일의 아트보드를 한 판에)
    let aids: number[] = []
    try { aids = sheet.source_analysis_ids ? JSON.parse(sheet.source_analysis_ids) : [] } catch (_e) { aids = [] }
    aids = (Array.isArray(aids) ? aids : []).filter((n) => Number.isInteger(n))
    if (aids.length === 0) return c.json({ success: false, error: '소스 분석이 없습니다.' }, 400)

    // 단일 판(시트) 제약 유지 — 평판 다중판은 판별로 별도 잡(iaeCanExportSheetsMulti)
    let placements: Array<{ sheet?: number }> = []
    try { placements = sheet.placements_json ? JSON.parse(sheet.placements_json) : [] } catch (_e) { placements = [] }
    if (placements.length === 0) return c.json({ success: false, error: '배치된 조각이 없습니다.' }, 400)
    const sheetIdxs = new Set(placements.map((p) => p.sheet || 0))
    if (sheetIdxs.size > 1) return c.json({ success: false, error: `단일 판만 지원합니다 (현재 ${sheetIdxs.size}판).` }, 400)

    // 각 소스 분석 done 확인
    for (const aid of aids) {
      const an = await c.env.DB.prepare(
        `SELECT status FROM ai_analysis_requests WHERE id = ?`
      ).bind(aid).first<{ status: string }>()
      if (!an || an.status !== 'done') return c.json({ success: false, error: `소스 분석(${aid})이 완료되지 않았습니다.` }, 400)
    }

    await c.env.DB.prepare(
      `UPDATE sheet_layouts SET render_status='queued', render_error=NULL, updated_at=datetime('now') WHERE id = ?`
    ).bind(id).run()
    return c.json({ success: true, data: { id, render_status: 'queued' } })
  } catch (error) {
    console.error('Workbench render queue error:', error)
    return c.json({ success: false, error: '출력 요청 실패' }, 500)
  }
})

// ── 에이전트 heartbeat: 폴링 자체를 last_seen 으로 기록 (settings 키-값) — spec R1 ② ──
// settings.setting_key UNIQUE → ON CONFLICT UPSERT (caps.ts 패턴). 실패해도 폴링은 진행.
async function touchAgentHeartbeat(c: any) {
  try {
    await c.env.DB.prepare(
      `INSERT INTO settings (setting_key, setting_value) VALUES ('ia_agent_last_seen', datetime('now'))
       ON CONFLICT(setting_key) DO UPDATE SET setting_value = datetime('now')`
    ).run()
  } catch (e) { console.error('Workbench heartbeat error:', e) }
}

// ── GET /api/workbench/agent-status — IA 에이전트 온라인 여부 (last_seen<60s) — spec R1 ② ──
workbenchRouter.get('/agent-status', async (c) => {
  try {
    const row = await c.env.DB.prepare(
      `SELECT setting_value FROM settings WHERE setting_key = 'ia_agent_last_seen'`
    ).first<{ setting_value: string | null }>()
    const lastSeen = row?.setting_value ?? null
    // last_seen·now 모두 UTC datetime('now') 문자열 → julianday 차이를 초로 환산
    let online = false
    if (lastSeen) {
      const sec = await c.env.DB.prepare(
        `SELECT (julianday('now') - julianday(?)) * 86400 AS sec`
      ).bind(lastSeen).first<{ sec: number | null }>()
      online = !!(sec && sec.sec != null && sec.sec < 60)
    }
    return c.json({ success: true, data: { online, last_seen: lastSeen } })
  } catch (error) {
    console.error('Workbench agent-status error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// GET /api/workbench/render-queue — 에이전트 폴링 (queued → rendering claim)
workbenchRouter.get('/render-queue', async (c) => {
  try {
    await touchAgentHeartbeat(c)
    const ef = entityFilter(c, 'sheet_layouts')
    const { results } = await c.env.DB.prepare(
      `SELECT id, name, mode, canvas_json, placements_json, item_code, source_analysis_ids
       FROM sheet_layouts WHERE render_status='queued'${ef.clause} ORDER BY id ASC LIMIT 3`
    ).bind(...ef.params).all<{ id: number; name: string; mode: string; canvas_json: string; placements_json: string; item_code: string | null; source_analysis_ids: string | null }>()
    if (!results.length) return c.json({ success: true, data: [] })

    const out: Array<Record<string, unknown>> = []
    for (const r of results) {
      let aids: number[] = []
      try { aids = r.source_analysis_ids ? JSON.parse(r.source_analysis_ids) : [] } catch (_e) { aids = [] }
      aids = (Array.isArray(aids) ? aids : []).filter((n) => Number.isInteger(n))
      // 멀티소스: 모든 aid의 file_path를 sources[]로. source_analysis_id/source_file_path는 첫 소스로 하위호환.
      const sources: Array<{ analysis_id: number; file_path: string }> = []
      for (const aid of aids) {
        const an = await c.env.DB.prepare(`SELECT file_path FROM ai_analysis_requests WHERE id = ?`).bind(aid).first<{ file_path: string | null }>()
        if (an?.file_path) sources.push({ analysis_id: aid, file_path: an.file_path })
      }
      const first = sources.length ? sources[0] : null
      out.push({
        id: r.id, name: r.name, mode: r.mode,
        canvas_json: r.canvas_json, placements_json: r.placements_json,
        item_code: r.item_code,
        source_analysis_id: first?.analysis_id ?? null, source_file_path: first?.file_path ?? null,
        sources
      })
    }
    // claim: queued → rendering (재폴링 중복 처리 방지)
    const ids = results.map((r) => r.id)
    const ph = ids.map(() => '?').join(',')
    await c.env.DB.prepare(`UPDATE sheet_layouts SET render_status='rendering', updated_at=datetime('now') WHERE id IN (${ph}) AND render_status='queued'`).bind(...ids).run()

    return c.json({ success: true, data: out })
  } catch (error) {
    console.error('Workbench render-queue poll error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// PATCH /api/workbench/sheets/:id/render — 에이전트 결과 콜백
workbenchRouter.patch('/sheets/:id/render', async (c) => {
  try {
    const id = parseInt(c.req.param('id'), 10)
    if (!id) return c.json({ success: false, error: '잘못된 ID' }, 400)
    const body = await c.req.json<{ render_status?: string; render_result_json?: unknown; render_error?: string }>()
    const rs = (body.render_status === 'error') ? 'error' : 'done'
    const resultStr = body.render_result_json == null ? null : (typeof body.render_result_json === 'string' ? body.render_result_json : JSON.stringify(body.render_result_json))
    const ef = entityFilter(c)  // #444: 타법인 sheet_layouts 콜백 변조 차단(형제 격리, 콜백만 누락)
    if (rs === 'done') {
      await c.env.DB.prepare(
        `UPDATE sheet_layouts SET render_status='done', status='rendered', render_result_json=?, render_error=NULL, updated_at=datetime('now') WHERE id = ?${ef.clause}`
      ).bind(resultStr, id, ...ef.params).run()
    } else {
      await c.env.DB.prepare(
        `UPDATE sheet_layouts SET render_status='error', render_error=?, updated_at=datetime('now') WHERE id = ?${ef.clause}`
      ).bind(body.render_error ?? '렌더 실패', id, ...ef.params).run()
    }
    return c.json({ success: true })
  } catch (error) {
    console.error('Workbench render callback error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ── Export-first (주문 없이 가공 EPS 추출) — spec 2026-06-25-ia-editor-eps-export.md §3·§5 ──
// 에이전트가 NAS 산출물을 R2로 업로드 → 워커가 R2 blob을 attachment로 서빙(인증=헤더 전용).
// R2 키 규칙: render-outputs/{jobType}/{jobId}/{safeName}  (jobType = sheet | process)

// kind → Content-Type 매핑 (다운로드 attachment 헤더)
const RENDER_CONTENT_TYPES: Record<string, string> = {
  eps: 'application/postscript',
  dxf: 'application/dxf',
  jpg: 'image/jpeg',
}

// result_json 에서 kind 별 R2 키를 꺼낸다 ({eps_r2, dxf_r2, jpg_r2}).
function pickR2Key(resultJson: string | null, kind: string): string | null {
  if (!resultJson) return null
  try {
    const obj = JSON.parse(resultJson)
    const v = obj && obj[`${kind}_r2`]
    return (typeof v === 'string' && v) ? v : null
  } catch (_e) { return null }
}

// W2: result_json 의 R2 산출물(eps/dxf/jpg)을 best-effort 삭제(이력 삭제 시 orphan 방지). 실패는 무시.
async function deleteRenderAssets(c: any, resultJson: string | null): Promise<void> {
  if (!resultJson) return
  let obj: any
  try { obj = JSON.parse(resultJson) } catch (_e) { return }
  for (const kind of ['eps', 'dxf', 'jpg']) {
    const key = obj && obj[`${kind}_r2`]
    if (typeof key === 'string' && key) { try { await c.env.R2_BUCKET.delete(key) } catch (_e) { /* best-effort */ } }
  }
}

// 공통 R2 blob 다운로드 응답 (entity 격리·완료 검증은 호출부에서 수행)
async function serveRenderAsset(c: any, r2Key: string, kind: string) {
  const obj = await c.env.R2_BUCKET.get(r2Key)
  if (!obj) return c.json({ success: false, error: '산출물을 찾을 수 없습니다.' }, 404)
  const filename = r2Key.split('/').pop() || `render.${kind}`
  return new Response(obj.body, {
    headers: {
      'Content-Type': RENDER_CONTENT_TYPES[kind] || 'application/octet-stream',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  })
}

// ── POST /api/workbench/render-asset — 에이전트 산출물 업로드 수신 (multipart) ──
// spec §3.2(A). 에이전트가 EPS/DXF/JPG 를 1개씩 업로드 → R2.put → r2_key 반환.
workbenchRouter.post('/render-asset', async (c) => {
  try {
    const formData = await c.req.formData()
    const file = formData.get('file') as File | null
    if (!file) return c.json({ success: false, error: '파일이 없습니다.' }, 400)

    const jobType = String(formData.get('job_type') || '')
    if (jobType !== 'sheet' && jobType !== 'process') {
      return c.json({ success: false, error: 'job_type은 sheet|process여야 합니다.' }, 400)
    }
    const jobId = parseInt(String(formData.get('job_id') || ''), 10)
    if (!jobId || jobId < 1) return c.json({ success: false, error: '잘못된 job_id' }, 400)
    const kind = String(formData.get('kind') || '')
    if (!['eps', 'dxf', 'jpg'].includes(kind)) {
      return c.json({ success: false, error: 'kind는 eps|dxf|jpg여야 합니다.' }, 400)
    }

    // #444: job 소유 검증 — 타법인 job 산출물 경로(r2Key)에 인젝션/덮어쓰기 차단
    const efJob = entityFilter(c)
    const jobTbl = jobType === 'sheet' ? 'sheet_layouts' : 'ia_process_jobs'
    const ownsJob = await c.env.DB.prepare(`SELECT 1 FROM ${jobTbl} WHERE id = ?${efJob.clause} LIMIT 1`).bind(jobId, ...efJob.params).first()
    if (!ownsJob) return c.json({ success: false, error: '잘못된 job_id' }, 404)

    // 확장자·크기 검증 (eps/dxf/jpg, 50MB)
    const v = validateUpload(file, {
      maxBytes: 50 * 1024 * 1024,
      allowedMimePrefixes: ['image/', 'application/postscript', 'application/dxf', 'application/octet-stream'],
      allowedExts: ['eps', 'dxf', 'jpg', 'jpeg'],
    })
    if (!v.ok) return c.json({ success: false, error: v.error }, 400)

    // 키 sanitize (path traversal / 키 인젝션 방어) — files/analyze 패턴 재사용
    const safeName = (file.name || `render.${kind}`).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200)
    const r2Key = `render-outputs/${jobType}/${jobId}/${safeName}`
    await c.env.R2_BUCKET.put(r2Key, file.stream(), {
      httpMetadata: { contentType: file.type || RENDER_CONTENT_TYPES[kind] || 'application/octet-stream' },
    })

    return c.json({ success: true, data: { r2_key: r2Key } })
  } catch (error) {
    console.error('Workbench render-asset upload error:', error)
    return c.json({ success: false, error: '산출물 업로드 실패' }, 500)
  }
})

// ── GET /api/workbench/sheets/:id/download?kind=eps|dxf|jpg — 네스팅 산출물 다운로드 ──
// spec §3.2(B)·§4. entity 격리 SELECT → render_result_json[kind+'_r2'] → R2.get → attachment.
workbenchRouter.get('/sheets/:id/download', async (c) => {
  try {
    const id = parseInt(c.req.param('id'), 10)
    if (!id) return c.json({ success: false, error: '잘못된 ID' }, 400)
    const kind = String(c.req.query('kind') || '')
    if (!['eps', 'dxf', 'jpg'].includes(kind)) {
      return c.json({ success: false, error: 'kind는 eps|dxf|jpg여야 합니다.' }, 400)
    }

    const ef = entityFilter(c, 'sheet_layouts')
    const row = await c.env.DB.prepare(
      `SELECT render_status, render_result_json FROM sheet_layouts WHERE id = ?${ef.clause}`
    ).bind(id, ...ef.params).first<{ render_status: string; render_result_json: string | null }>()
    if (!row || row.render_status !== 'done') {
      return c.json({ success: false, error: '완료된 출력이 없습니다.' }, 404)
    }
    const r2Key = pickR2Key(row.render_result_json, kind)
    if (!r2Key) return c.json({ success: false, error: '해당 포맷 산출물이 없습니다.' }, 404)
    return serveRenderAsset(c, r2Key, kind)
  } catch (error) {
    console.error('Workbench sheet download error:', error)
    return c.json({ success: false, error: '다운로드 실패' }, 500)
  }
})

// ── GET /api/workbench/process/:id/download?kind=eps|dxf|jpg — 단일 가공 산출물 다운로드 ──
// spec §3.2(B)·§5. ia_process_jobs.result_json[kind+'_r2'] → R2.get → attachment.
workbenchRouter.get('/process/:id/download', async (c) => {
  try {
    const id = parseInt(c.req.param('id'), 10)
    if (!id) return c.json({ success: false, error: '잘못된 ID' }, 400)
    const kind = String(c.req.query('kind') || '')
    if (!['eps', 'dxf', 'jpg'].includes(kind)) {
      return c.json({ success: false, error: 'kind는 eps|dxf|jpg여야 합니다.' }, 400)
    }

    const ef = entityFilter(c, 'ia_process_jobs')
    const row = await c.env.DB.prepare(
      `SELECT status, result_json FROM ia_process_jobs WHERE id = ?${ef.clause}`
    ).bind(id, ...ef.params).first<{ status: string; result_json: string | null }>()
    if (!row || row.status !== 'done') {
      return c.json({ success: false, error: '완료된 가공이 없습니다.' }, 404)
    }
    const r2Key = pickR2Key(row.result_json, kind)
    if (!r2Key) return c.json({ success: false, error: '해당 포맷 산출물이 없습니다.' }, 404)
    return serveRenderAsset(c, r2Key, kind)
  } catch (error) {
    console.error('Workbench process download error:', error)
    return c.json({ success: false, error: '다운로드 실패' }, 500)
  }
})

// ── 단일 가공 렌더잡 (ia_process_jobs) — spec §5.2 ──
// 주문 없이 단일 그룹을 ProcessOrderItem.jsx로 가공. /sheets/:id/render 계열을 복제.
// status: queued(사용자) → rendering(에이전트 claim) → done | error.

// POST /api/workbench/process — 가공 큐잉
workbenchRouter.post('/process', async (c) => {
  try {
    const body = await c.req.json<{
      analysis_id?: number; group_index?: number
      target_w_cm?: number; target_h_cm?: number
      finishing?: unknown; trim?: unknown; rotate90?: unknown
      scale_factor?: number; rotation?: number
      real_size?: boolean
      preview_only?: boolean
      offset?: unknown; punching?: unknown; annotation?: unknown
    }>()
    const analysisId = parseInt(String(body.analysis_id ?? ''), 10)
    if (!analysisId) return c.json({ success: false, error: 'analysis_id가 필요합니다.' }, 400)
    const gi = body.group_index
    if (typeof gi !== 'number' || gi < 0 || !Number.isInteger(gi)) {
      return c.json({ success: false, error: 'group_index는 0 이상의 정수여야 합니다.' }, 400)
    }

    // analysis 소유(entity) + status='done' 검증
    const ef = entityFilter(c, 'ai_analysis_requests')
    const an = await c.env.DB.prepare(
      `SELECT id, status FROM ai_analysis_requests WHERE id = ?${ef.clause}`
    ).bind(analysisId, ...ef.params).first<{ id: number; status: string }>()
    if (!an) return c.json({ success: false, error: '분석을 찾을 수 없습니다.' }, 404)
    if (an.status !== 'done') return c.json({ success: false, error: '소스 분석이 완료되지 않았습니다.' }, 400)

    // ⑥ 회전 정규화: rotation(0/90/180/270) 우선, 없으면 rotate90 boolean → 90/0 매핑
    const rotation = [0, 90, 180, 270].includes(body.rotation as number)
      ? (body.rotation as number)
      : (body.rotate90 ? 90 : 0)
    const params = {
      target_w_cm: (typeof body.target_w_cm === 'number') ? body.target_w_cm : null,
      target_h_cm: (typeof body.target_h_cm === 'number') ? body.target_h_cm : null,
      finishing: body.finishing ?? null,
      trim: body.trim ?? null,
      rotate90: body.rotate90 ?? false,
      // ⑤ 파일배율(1/N): 1 이상 숫자만 허용, 아니면 1 — jsx/에이전트가 scaleFactor 키로 읽음
      scale_factor: (typeof body.scale_factor === 'number' && body.scale_factor >= 1) ? body.scale_factor : 1,
      // 실물 저장: 축소본(1/N)을 ×N 확대해 EPS를 실물 크기로 저장(RIP 100% 출력). 미지정=false=현행 축소 저장.
      real_size: !!body.real_size,
      rotation,
      // ③ 미리보기 잡: 실렌더 JPG만 콜백(EPS/DXF 스킵), 이력 목록에서 제외 — spec R1 ③
      preview_only: !!body.preview_only,
      // R3a-2 고급 후가공 패스스루(도련 offset·펀칭·주석): 값 검증은 jsx가 처리 — null 허용
      offset: body.offset ?? null,
      punching: body.punching ?? null,
      annotation: body.annotation ?? null,
    }
    const user = c.get('user')
    const created = await c.env.DB.prepare(`
      INSERT INTO ia_process_jobs
        (analysis_id, group_index, params_json, status, entity_id, created_by, updated_at)
      VALUES (?, ?, ?, 'queued', ?, ?, datetime('now'))
      RETURNING id
    `).bind(
      analysisId, gi, JSON.stringify(params), getEntityId(c), user?.id ?? null,
    ).first<{ id: number }>()
    return c.json({ success: true, data: { id: created?.id ?? null } })
  } catch (error) {
    console.error('Workbench process queue error:', error)
    return c.json({ success: false, error: '가공 요청 실패' }, 500)
  }
})

// GET /api/workbench/process-queue — 에이전트 폴링 (queued → rendering claim)
workbenchRouter.get('/process-queue', async (c) => {
  try {
    await touchAgentHeartbeat(c)
    // W2: 미리보기(preview_only) 잡은 일회성 → 1시간 경과분 자동 정리(D1 비대 방지). 에이전트 폴 주기에 편승.
    try {
      await c.env.DB.prepare(
        `DELETE FROM ia_process_jobs WHERE params_json LIKE '%"preview_only":true%' AND updated_at < datetime('now','-1 hour')`
      ).run()
    } catch (_e) { /* 정리는 best-effort */ }
    const ef = entityFilter(c, 'j')
    const { results } = await c.env.DB.prepare(`
      SELECT j.id, j.analysis_id, j.group_index, j.params_json, ar.file_path AS source_file_path
      FROM ia_process_jobs j
      LEFT JOIN ai_analysis_requests ar ON ar.id = j.analysis_id
      WHERE j.status='queued'${ef.clause}
      ORDER BY j.id ASC
      LIMIT 3
    `).bind(...ef.params).all<{
      id: number; analysis_id: number; group_index: number
      params_json: string; source_file_path: string | null
    }>()
    if (!results.length) return c.json({ success: true, data: [] })

    // claim: queued → rendering (재폴링 중복 처리 방지)
    const ids = results.map((r) => r.id)
    const ph = ids.map(() => '?').join(',')
    await c.env.DB.prepare(
      `UPDATE ia_process_jobs SET status='rendering', updated_at=datetime('now') WHERE id IN (${ph}) AND status='queued'`
    ).bind(...ids).run()

    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('Workbench process-queue poll error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// GET /api/workbench/process?limit=N — 가공 이력 목록 (entity 격리, created_at desc) — spec P1 ③
// 영속 재다운로드 보드용. result_meta(width/height/has_*·jpg_base64 썸네일)는 result_json에서 추출.
workbenchRouter.get('/process', async (c) => {
  try {
    const limit = Math.min(parseInt(c.req.query('limit') || '12', 10) || 12, 50)
    const ef = entityFilter(c, 'ia_process_jobs')
    const { results } = await c.env.DB.prepare(`
      SELECT id, status, group_index, analysis_id, error_message, created_at, result_json
      FROM ia_process_jobs
      WHERE 1=1${ef.clause}
        AND (params_json IS NULL OR params_json NOT LIKE '%"preview_only":true%')
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `).bind(...ef.params, limit).all<{
      id: number; status: string; group_index: number; analysis_id: number
      error_message: string | null; created_at: string; result_json: string | null
    }>()

    const data = results.map((r) => {
      let result_meta: {
        width_cm: number | null; height_cm: number | null
        has_eps: boolean; has_dxf: boolean; has_jpg: boolean; jpg_base64: string | null
      } | null = null
      if (r.result_json) {
        try {
          const obj = JSON.parse(r.result_json)
          result_meta = {
            width_cm: (obj && obj.width_cm != null) ? Number(obj.width_cm) : null,
            height_cm: (obj && obj.height_cm != null) ? Number(obj.height_cm) : null,
            has_eps: !!(obj && obj.eps_r2),
            has_dxf: !!(obj && obj.dxf_r2),
            has_jpg: !!(obj && obj.jpg_r2),
            jpg_base64: (obj && obj.jpg_base64) ? String(obj.jpg_base64) : null,
          }
        } catch (_e) { result_meta = null }
      }
      return {
        id: r.id, status: r.status, group_index: r.group_index, analysis_id: r.analysis_id,
        error_message: r.error_message, created_at: r.created_at, result_meta,
      }
    })

    return c.json({ success: true, data })
  } catch (error) {
    console.error('Workbench process list error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// GET /api/workbench/process/:id — 프론트 폴링 (entity 격리)
workbenchRouter.get('/process/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'), 10)
    if (!id) return c.json({ success: false, error: '잘못된 ID' }, 400)
    const ef = entityFilter(c, 'ia_process_jobs')
    const row = await c.env.DB.prepare(
      `SELECT id, status, error_message, result_json FROM ia_process_jobs WHERE id = ?${ef.clause}`
    ).bind(id, ...ef.params).first<{ id: number; status: string; error_message: string | null; result_json: string | null }>()
    if (!row) return c.json({ success: false, error: '가공 작업을 찾을 수 없습니다.' }, 404)
    return c.json({ success: true, data: row })
  } catch (error) {
    console.error('Workbench process get error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// PATCH /api/workbench/process/:id — 에이전트 결과 콜백
workbenchRouter.patch('/process/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'), 10)
    if (!id) return c.json({ success: false, error: '잘못된 ID' }, 400)
    const body = await c.req.json<{ status?: string; result_json?: unknown; error_message?: string }>()
    const status = (body.status === 'error') ? 'error' : 'done'
    const resultStr = body.result_json == null ? null : (typeof body.result_json === 'string' ? body.result_json : JSON.stringify(body.result_json))
    const ef = entityFilter(c)  // #444: 타법인 ia_process_jobs 콜백 변조 차단(형제 격리, 콜백만 누락)
    if (status === 'done') {
      await c.env.DB.prepare(
        `UPDATE ia_process_jobs SET status='done', result_json=?, error_message=NULL, updated_at=datetime('now') WHERE id = ?${ef.clause}`
      ).bind(resultStr, id, ...ef.params).run()
    } else {
      await c.env.DB.prepare(
        `UPDATE ia_process_jobs SET status='error', error_message=?, updated_at=datetime('now') WHERE id = ?${ef.clause}`
      ).bind(body.error_message ?? '가공 실패', id, ...ef.params).run()
    }
    return c.json({ success: true })
  } catch (error) {
    console.error('Workbench process callback error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ── POST /api/workbench/process/:id/retry — 실패/멈춘 가공 재큐잉 — spec R1 ② ──
// entity 격리 소유 검증 후 status가 error|rendering 이면 queued 로 되돌리고 결과/오류 초기화.
// (rendering=에이전트 claim 후 타임아웃/유실 회복, error=가공 실패 재시도). done/queued 는 400.
workbenchRouter.post('/process/:id/retry', async (c) => {
  try {
    const id = parseInt(c.req.param('id'), 10)
    if (!id) return c.json({ success: false, error: '잘못된 ID' }, 400)
    const ef = entityFilter(c, 'ia_process_jobs')
    const row = await c.env.DB.prepare(
      `SELECT id, status FROM ia_process_jobs WHERE id = ?${ef.clause}`
    ).bind(id, ...ef.params).first<{ id: number; status: string }>()
    if (!row) return c.json({ success: false, error: '가공 작업을 찾을 수 없습니다.' }, 404)
    if (row.status !== 'error' && row.status !== 'rendering') {
      return c.json({ success: false, error: `재시도 불가 상태입니다 (${row.status}).` }, 400)
    }
    await c.env.DB.prepare(
      `UPDATE ia_process_jobs SET status='queued', result_json=NULL, error_message=NULL, updated_at=datetime('now') WHERE id = ?`
    ).bind(id).run()
    return c.json({ success: true, data: { id, status: 'queued' } })
  } catch (error) {
    console.error('Workbench process retry error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ── POST /api/workbench/process/clear — 완료·실패 가공 이력 일괄 삭제 (W2: 누적 정리) ──
// entity 격리. status IN (done,error)만 삭제(queued/rendering=진행 중 보존). R2 산출물도 best-effort 삭제.
workbenchRouter.post('/process/clear', async (c) => {
  try {
    const ef = entityFilter(c, 'ia_process_jobs')
    const { results } = await c.env.DB.prepare(
      `SELECT id, result_json FROM ia_process_jobs WHERE status IN ('done','error')${ef.clause}`
    ).bind(...ef.params).all<{ id: number; result_json: string | null }>()
    for (const r of results) { await deleteRenderAssets(c, r.result_json) }
    // status 조건 DELETE(IN(ids) 미사용 → D1 바인드 한도 무관). SELECT~DELETE 사이 신규 done은 다음 정리로.
    await c.env.DB.prepare(
      `DELETE FROM ia_process_jobs WHERE status IN ('done','error')${ef.clause}`
    ).bind(...ef.params).run()
    return c.json({ success: true, data: { deleted: results.length } })
  } catch (error) {
    console.error('Workbench process clear error:', error)
    return c.json({ success: false, error: '이력 삭제 실패' }, 500)
  }
})

export default workbenchRouter
