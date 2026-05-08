import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'

const aiLayoutRouter = new Hono<HonoEnv>()
aiLayoutRouter.use('/*', authMiddleware, requireRole('ADMIN'))

// POST /api/ai-layout — 레이아웃 작업 생성 (브라우저 → MES)
aiLayoutRouter.post('/', async (c) => {
  try {
    const body = await c.req.json<{ analysis_id: number; mode: string }>()
    if (!body.analysis_id || !body.mode) {
      return c.json({ success: false, error: 'analysis_id and mode are required' }, 400)
    }
    if (body.mode !== 'individual' && body.mode !== 'combined') {
      return c.json({ success: false, error: 'mode must be individual or combined' }, 400)
    }

    // 기존 analysis_id 유효성 확인
    const analysis = await c.env.DB.prepare(
      `SELECT id, file_path, groups_json FROM ai_analysis_requests WHERE id = ?`
    ).bind(body.analysis_id).first()
    if (!analysis) {
      return c.json({ success: false, error: 'analysis_id not found' }, 404)
    }

    const result = await c.env.DB.prepare(
      `INSERT INTO ai_layout_requests (analysis_id, mode, status)
       VALUES (?, ?, 'pending')
       RETURNING id, analysis_id, mode, status, created_at`
    ).bind(body.analysis_id, body.mode).first()

    return c.json({ success: true, data: result }, 201)
  } catch (error) {
    console.error('AI Layout error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// GET /api/ai-layout — 목록 조회 (IllustratorAutomat 폴링용)
aiLayoutRouter.get('/', async (c) => {
  try {
    const status = c.req.query('status') || 'pending'
    const { results } = await c.env.DB.prepare(
      `SELECT r.id, r.analysis_id, r.mode, r.status, r.error_message, r.created_at,
              a.file_path, a.groups_json
       FROM ai_layout_requests r
       JOIN ai_analysis_requests a ON r.analysis_id = a.id
       WHERE r.status = ?
       ORDER BY r.created_at ASC LIMIT 5`
    ).bind(status).all()

    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('AI Layout error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// GET /api/ai-layout/:id — 단건 조회 (브라우저 폴링용)
aiLayoutRouter.get('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const row = await c.env.DB.prepare(
      `SELECT id, analysis_id, mode, status, result_json, error_message, created_at, updated_at
       FROM ai_layout_requests WHERE id = ?`
    ).bind(id).first()

    if (!row) return c.json({ success: false, error: 'Not found' }, 404)
    return c.json({ success: true, data: row })
  } catch (error) {
    console.error('AI Layout error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// PATCH /api/ai-layout/:id — 결과 업데이트 (IllustratorAutomat이 호출)
aiLayoutRouter.patch('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json<{
      status?: string
      result_json?: string
      error_message?: string
    }>()

    await c.env.DB.prepare(
      `UPDATE ai_layout_requests
       SET status = COALESCE(?, status),
           result_json = COALESCE(?, result_json),
           error_message = COALESCE(?, error_message),
           updated_at = datetime('now')
       WHERE id = ?`
    ).bind(
      body.status ?? null,
      body.result_json ?? null,
      body.error_message ?? null,
      id
    ).run()

    return c.json({ success: true })
  } catch (error) {
    console.error('AI Layout error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

export default aiLayoutRouter
