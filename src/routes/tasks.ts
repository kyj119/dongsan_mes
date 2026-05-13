import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware } from '../middleware/auth'

/**
 * Task Manager API (WORKFLOW_PROPOSAL §C, Step 4 roadmap)
 * ----------------------------------------------------------------------------
 * A generic work queue consumed by the Windows-side agents
 * (IllustratorAutomat, EdgeAgent).
 *
 * Task types:
 *   AI_PROCESS   — IllustratorAutomat: run ExtractGroups.jsx / ProcessOrderItem.jsx.
 *   NAS_UPLOAD   — IllustratorAutomat: copy EPS to Z:\orders\{cat}\{y}\{m}\{order}\.
 *   RIP_MONITOR  — EdgeAgent: watch Preview/ + Print.log for a specific card.
 *   MANUAL       — requires human action from the /tasks admin page.
 *
 * Lifecycle:
 *   PENDING → (agent claims) → PROCESSING → COMPLETED
 *                                       ↳ FAILED (auto-retry while retry_count < max_retries)
 *                                       ↳ CANCELLED
 */
const tasksRouter = new Hono<HonoEnv>()

tasksRouter.use('/*', authMiddleware)

// Migration 0018 narrowed the allowed set: NAS_UPLOAD and RIP_MONITOR were
// removed because the real-world failure modes don't benefit from a queue.
const VALID_TYPES = ['AI_PROCESS', 'MANUAL'] as const
const VALID_STATUSES = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED'] as const

// GET /api/tasks — list with filters
tasksRouter.get('/', async (c) => {
  try {
    const { type = '', status = '', order_id = '', card_id = '', limit = '100' } = c.req.query()

    let query = `
      SELECT t.*, o.order_number, c.card_number
      FROM tasks t
      LEFT JOIN orders o ON t.order_id = o.id
      LEFT JOIN cards c ON t.card_id = c.id
      WHERE 1=1
    `
    const params: any[] = []
    if (type) { query += ' AND t.type = ?'; params.push(type) }
    if (status) { query += ' AND t.status = ?'; params.push(status) }
    if (order_id) { query += ' AND t.order_id = ?'; params.push(parseInt(order_id)) }
    if (card_id) { query += ' AND t.card_id = ?'; params.push(parseInt(card_id)) }

    query += ' ORDER BY t.created_at DESC LIMIT ?'
    params.push(Math.min(parseInt(limit), 500))

    const { results } = await c.env.DB.prepare(query).bind(...params).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// GET /api/tasks/:id
tasksRouter.get('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const row = await c.env.DB.prepare(`
      SELECT t.*, o.order_number, c.card_number
      FROM tasks t
      LEFT JOIN orders o ON t.order_id = o.id
      LEFT JOIN cards c ON t.card_id = c.id
      WHERE t.id = ?
    `).bind(id).first()
    if (!row) return c.json({ success: false, error: 'Task not found' }, 404)
    return c.json({ success: true, data: row })
  } catch (error) {
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// POST /api/tasks — create a task (typically called from other routes)
tasksRouter.post('/', async (c) => {
  try {
    const user = c.get('user')
    if (!user) return c.json({ success: false, error: 'Unauthorized' }, 401)

    const body = await c.req.json<{
      type: string
      order_id?: number
      card_id?: number
      ref_table?: string
      ref_id?: number
      input_payload?: any
      max_retries?: number
    }>()

    if (!VALID_TYPES.includes(body.type as typeof VALID_TYPES[number])) {
      return c.json({ success: false, error: `Invalid type. Must be one of ${VALID_TYPES.join(', ')}` }, 400)
    }

    const payload = body.input_payload !== undefined
      ? (typeof body.input_payload === 'string' ? body.input_payload : JSON.stringify(body.input_payload))
      : null

    const row = await c.env.DB.prepare(`
      INSERT INTO tasks (type, status, order_id, card_id, ref_table, ref_id, input_payload, max_retries, created_by)
      VALUES (?, 'PENDING', ?, ?, ?, ?, ?, COALESCE(?, 3), ?)
      RETURNING *
    `).bind(
      body.type,
      body.order_id ?? null,
      body.card_id ?? null,
      body.ref_table ?? null,
      body.ref_id ?? null,
      payload,
      body.max_retries ?? null,
      user.id
    ).first()

    return c.json({ success: true, data: row })
  } catch (error) {
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// POST /api/tasks/claim — agents pull a batch of PENDING tasks and atomically
// flip them to PROCESSING. Returns the claimed rows.
tasksRouter.post('/claim', async (c) => {
  try {
    const body = await c.req.json<{ type?: string; limit?: number }>().catch(() => ({} as { type?: string; limit?: number }))
    const type = body.type ?? c.req.query('type') ?? ''
    const limit = Math.min(body.limit ?? 5, 20)

    if (!type || !VALID_TYPES.includes(type as typeof VALID_TYPES[number])) {
      return c.json({ success: false, error: 'type is required and must be valid' }, 400)
    }

    // Find candidates. D1 doesn't support FOR UPDATE; use updated_at check to
    // reduce claim collisions between agents.
    const { results } = await c.env.DB.prepare(`
      SELECT id FROM tasks
      WHERE type = ? AND status = 'PENDING' AND retry_count < max_retries
      ORDER BY created_at ASC
      LIMIT ?
    `).bind(type, limit).all<{ id: number }>()

    if (!results || results.length === 0) {
      return c.json({ success: true, data: [] })
    }

    const ids = results.map((r) => r.id)
    const placeholders = ids.map(() => '?').join(',')
    await c.env.DB.prepare(`
      UPDATE tasks
      SET status = 'PROCESSING',
          started_at = datetime('now'),
          last_attempt_at = datetime('now'),
          updated_at = datetime('now')
      WHERE id IN (${placeholders}) AND status = 'PENDING'
    `).bind(...ids).run()

    const { results: claimed } = await c.env.DB.prepare(`
      SELECT t.*, o.order_number, c.card_number
      FROM tasks t
      LEFT JOIN orders o ON t.order_id = o.id
      LEFT JOIN cards c ON t.card_id = c.id
      WHERE t.id IN (${placeholders})
    `).bind(...ids).all()

    return c.json({ success: true, data: claimed })
  } catch (error) {
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// PATCH /api/tasks/:id — update status/result/error (agents call this after work)
tasksRouter.patch('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json<{
      status?: string
      output_payload?: any
      error_message?: string | null
    }>()

    if (body.status && !VALID_STATUSES.includes(body.status as typeof VALID_STATUSES[number])) {
      return c.json({ success: false, error: 'Invalid status' }, 400)
    }

    const existing = await c.env.DB.prepare(
      'SELECT retry_count, max_retries FROM tasks WHERE id = ?'
    ).bind(id).first<{ retry_count: number; max_retries: number }>()
    if (!existing) return c.json({ success: false, error: 'Task not found' }, 404)

    const output = body.output_payload !== undefined
      ? (typeof body.output_payload === 'string' ? body.output_payload : JSON.stringify(body.output_payload))
      : null

    // If an agent reports FAILED and retries remain, auto-requeue to PENDING.
    let finalStatus = body.status ?? null
    let incrementRetry = false
    let completedAt: string | null = null

    if (body.status === 'FAILED') {
      incrementRetry = true
      const newCount = (existing.retry_count ?? 0) + 1
      if (newCount < (existing.max_retries ?? 3)) {
        finalStatus = 'PENDING' // requeue
      }
    } else if (body.status === 'COMPLETED' || body.status === 'CANCELLED') {
      completedAt = new Date().toISOString().replace('T', ' ').replace('Z', '').split('.')[0]
    }

    await c.env.DB.prepare(`
      UPDATE tasks
      SET status = COALESCE(?, status),
          output_payload = COALESCE(?, output_payload),
          error_message = ?,
          retry_count = retry_count + ?,
          last_attempt_at = datetime('now'),
          completed_at = COALESCE(?, completed_at),
          updated_at = datetime('now')
      WHERE id = ?
    `).bind(
      finalStatus,
      output,
      body.error_message ?? null,
      incrementRetry ? 1 : 0,
      completedAt,
      id
    ).run()

    return c.json({ success: true })
  } catch (error) {
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// POST /api/tasks/:id/retry — manual retry from the /tasks admin UI
tasksRouter.post('/:id/retry', async (c) => {
  try {
    const id = c.req.param('id')
    const row = await c.env.DB.prepare('SELECT status FROM tasks WHERE id = ?').bind(id).first<{ status: string }>()
    if (!row) return c.json({ success: false, error: 'Task not found' }, 404)

    await c.env.DB.prepare(`
      UPDATE tasks
      SET status = 'PENDING',
          error_message = NULL,
          updated_at = datetime('now')
      WHERE id = ?
    `).bind(id).run()

    return c.json({ success: true, message: 'Task requeued' })
  } catch (error) {
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// GET /api/tasks/stats — summary for the admin dashboard header
tasksRouter.get('/_/stats', async (c) => {
  try {
    const stats = await c.env.DB.prepare(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'PENDING')    AS pending,
        COUNT(*) FILTER (WHERE status = 'PROCESSING') AS processing,
        COUNT(*) FILTER (WHERE status = 'FAILED')     AS failed,
        COUNT(*) FILTER (WHERE status = 'COMPLETED' AND completed_at > datetime('now', '-24 hours')) AS completed_24h
      FROM tasks
    `).first()
    return c.json({ success: true, data: stats })
  } catch (error) {
    // D1/SQLite FILTER clauses might not be supported everywhere; fall back to
    // a CASE-based query if the above throws.
    try {
      const stats = await c.env.DB.prepare(`
        SELECT
          SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) AS pending,
          SUM(CASE WHEN status = 'PROCESSING' THEN 1 ELSE 0 END) AS processing,
          SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) AS failed,
          SUM(CASE WHEN status = 'COMPLETED' AND completed_at > datetime('now', '-24 hours') THEN 1 ELSE 0 END) AS completed_24h
        FROM tasks
      `).first()
      return c.json({ success: true, data: stats })
    } catch (fallbackError) {
      return c.json({
        success: false,
        error: fallbackError instanceof Error ? fallbackError.message : 'Unknown error'
      }, 500)
    }
  }
})

export default tasksRouter
