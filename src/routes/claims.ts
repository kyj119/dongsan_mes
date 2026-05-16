import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { getEntityId, entityFilter } from '../utils/entityFilter'

const claims = new Hono<HonoEnv>()
claims.use('*', authMiddleware)

// ─── 불량 코드 목록 ──────────────────────────────────────────────────────────
claims.get('/defect-codes', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT d.*, p.name as parent_name
    FROM defect_codes d
    LEFT JOIN defect_codes p ON d.parent_id = p.id
    WHERE d.is_active = 1
    ORDER BY d.sort_order ASC
  `).all()
  return c.json({ success: true, data: results })
})

// ─── 불량 코드 생성 ──────────────────────────────────────────────────────────
claims.post('/defect-codes', requireRole('ADMIN', 'MANAGER'), async (c) => {
  const { code, name, parent_id, category, description, preventive_action } = await c.req.json()
  if (!code || !name || !category) {
    return c.json({ success: false, error: 'code, name, category 필수' }, 400)
  }
  const result = await c.env.DB.prepare(`
    INSERT INTO defect_codes (code, name, parent_id, category, description, preventive_action)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(code, name, parent_id || null, category, description || null, preventive_action || null).run()
  return c.json({ success: true, data: { id: result.meta.last_row_id } })
})

// ─── 클레임 목록 ──────────────────────────────────────────────────────────────
claims.get('/', async (c) => {
  const status = c.req.query('status')
  const clientId = c.req.query('client_id')
  const page = Number(c.req.query('page') || 1)
  const limit = Number(c.req.query('limit') || 50)
  const offset = (page - 1) * limit
  const eFilter = entityFilter(c, 'cc')

  let where = `WHERE 1=1 ${eFilter.clause}`
  const binds: any[] = [...eFilter.params]

  if (status) { where += ' AND cc.status = ?'; binds.push(status) }
  if (clientId) { where += ' AND cc.client_id = ?'; binds.push(clientId) }

  const countRow = await c.env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM customer_claims cc ${where}`
  ).bind(...binds).first<{ cnt: number }>()

  const { results } = await c.env.DB.prepare(`
    SELECT cc.*, cl.client_name, o.order_number
    FROM customer_claims cc
    LEFT JOIN clients cl ON cc.client_id = cl.id
    LEFT JOIN orders o ON cc.order_id = o.id
    ${where}
    ORDER BY cc.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(...binds, limit, offset).all()

  return c.json({ success: true, data: results, pagination: { total: countRow?.cnt || 0, page, limit } })
})

// ─── 클레임 생성 ──────────────────────────────────────────────────────────────
claims.post('/', async (c) => {
  const body = await c.req.json()
  const userId = c.get('user')?.id
  const { order_id, client_id, claim_date, claim_type, description, claimed_amount, quality_issue_id } = body

  if (!order_id || !client_id || !description) {
    return c.json({ success: false, error: 'order_id, client_id, description 필수' }, 400)
  }

  // 번호 생성
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const { results: existing } = await c.env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM customer_claims WHERE claim_number LIKE ?`
  ).bind(`CLM-${today}-%`).all<{ cnt: number }>()
  const seq = (existing[0]?.cnt || 0) + 1
  const claimNumber = `CLM-${today}-${String(seq).padStart(3, '0')}`

  const result = await c.env.DB.prepare(`
    INSERT INTO customer_claims (claim_number, order_id, client_id, claim_date, claim_type, description, claimed_amount, quality_issue_id, entity_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    claimNumber, order_id, client_id,
    claim_date || new Date().toISOString().split('T')[0],
    claim_type || 'DEFECT', description, claimed_amount || 0,
    quality_issue_id || null, getEntityId(c), userId
  ).run()

  return c.json({ success: true, data: { id: result.meta.last_row_id, claim_number: claimNumber } })
})

// ─── 클레임 해결 ──────────────────────────────────────────────────────────────
claims.patch('/:id/resolve', requireRole('ADMIN', 'MANAGER'), async (c) => {
  const id = Number(c.req.param('id'))
  const userId = c.get('user')?.id
  const { resolution_type, resolved_amount, rework_order_id } = await c.req.json()

  await c.env.DB.prepare(`
    UPDATE customer_claims
    SET status = 'RESOLVED', resolution_type = ?, resolved_amount = ?,
        rework_order_id = ?, resolved_by = ?, resolved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(resolution_type, resolved_amount || 0, rework_order_id || null, userId, id).run()

  return c.json({ success: true })
})

// ─── 클레임 분석 ──────────────────────────────────────────────────────────────
claims.get('/analytics', async (c) => {
  const eFilter = entityFilter(c, 'cc')

  // 유형별 건수
  const { results: byType } = await c.env.DB.prepare(`
    SELECT claim_type, COUNT(*) as cnt, COALESCE(SUM(claimed_amount),0) as total_amount
    FROM customer_claims cc WHERE 1=1 ${eFilter.clause}
    GROUP BY claim_type
  `).bind(...eFilter.params).all()

  // 거래처별 TOP 10
  const { results: byClient } = await c.env.DB.prepare(`
    SELECT cc.client_id, cl.client_name, COUNT(*) as cnt, COALESCE(SUM(cc.claimed_amount),0) as total_amount
    FROM customer_claims cc
    LEFT JOIN clients cl ON cc.client_id = cl.id
    WHERE 1=1 ${eFilter.clause}
    GROUP BY cc.client_id ORDER BY cnt DESC LIMIT 10
  `).bind(...eFilter.params).all()

  // 월별 추이 (최근 6개월)
  const { results: monthly } = await c.env.DB.prepare(`
    SELECT strftime('%Y-%m', claim_date) as month, COUNT(*) as cnt, COALESCE(SUM(claimed_amount),0) as total
    FROM customer_claims cc WHERE claim_date >= date('now','-6 months') ${eFilter.clause}
    GROUP BY month ORDER BY month
  `).bind(...eFilter.params).all()

  return c.json({ success: true, data: { byType, byClient, monthly } })
})

export default claims
