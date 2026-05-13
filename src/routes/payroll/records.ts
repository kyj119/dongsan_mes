/**
 * payroll/records.ts — 급여 레코드 CRUD (B)
 * 2026-04-15 분할
 */
import { Hono } from 'hono'
import type { HonoEnv } from '../../types/env'
import { authMiddleware, requireRole } from '../../middleware/auth'

const recordsRouter = new Hono<HonoEnv>()
recordsRouter.use('/*', authMiddleware)

recordsRouter.get('/', async (c) => {
  try {
    const period = c.req.query('period') || ''
    const status = c.req.query('status') || ''

    const clauses: string[] = []
    const params: any[] = []
    if (period) { clauses.push('p.pay_period = ?'); params.push(period) }
    if (status) { clauses.push('p.status = ?'); params.push(status) }
    const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : ''

    const rows = await c.env.DB.prepare(
      `SELECT p.*, e.name as employee_name, e.employee_code, e.department, e.position,
              e.base_salary as employee_base_salary, e.mobile as employee_mobile
       FROM payroll p
       JOIN employees e ON p.employee_id = e.id
       ${where}
       ORDER BY e.department, e.name`
    ).bind(...params).all()

    const items = rows.results || []
    // 응답 포맷 통일: items 키로 반환하되 루트 배열은 backwards compat으로 유지
    return c.json({ success: true, data: { items, list: items, total: items.length } })
  } catch (err: any) {
    console.error('Payroll list error:', err)
    return c.json({ success: false, error: '조회 실패', detail: '서버 오류가 발생했습니다' }, 500)
  }
})

// ============================================================================
// API: 급여 상세
// GET /api/payroll/:id
// ============================================================================
recordsRouter.get('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const row = await c.env.DB.prepare(
    `SELECT p.*, e.name as employee_name, e.employee_code, e.department, e.position
     FROM payroll p JOIN employees e ON p.employee_id = e.id WHERE p.id = ?`
  ).bind(id).first()
  if (!row) return c.json({ success: false, error: '없음' }, 404)
  return c.json({ success: true, data: row })
})

// ============================================================================
// API: 급여 승인
// PATCH /api/payroll/:id/approve
// ============================================================================
recordsRouter.patch('/:id/approve', requireRole('ADMIN', 'MANAGER'), async (c) => {
  const id = Number(c.req.param('id'))
  const user = c.get('user')
  await c.env.DB.prepare(
    `UPDATE payroll SET status='APPROVED', approved_by=?, approved_at=datetime('now'), updated_at=datetime('now') WHERE id=?`
  ).bind(user?.id || null, id).run()
  return c.json({ success: true })
})

// ============================================================================
// API: 급여 지급 처리
// PATCH /api/payroll/:id/pay
// ============================================================================
recordsRouter.patch('/:id/pay', requireRole('ADMIN', 'MANAGER'), async (c) => {
  const id = Number(c.req.param('id'))
  await c.env.DB.prepare(
    `UPDATE payroll SET status='PAID', paid_at=datetime('now'), updated_at=datetime('now') WHERE id=?`
  ).bind(id).run()
  return c.json({ success: true })
})

// ============================================================================
// API: 급여 삭제 (PENDING만)
// DELETE /api/payroll/:id
// ============================================================================
recordsRouter.delete('/:id', requireRole('ADMIN', 'MANAGER'), async (c) => {
  const id = Number(c.req.param('id'))
  const row = await c.env.DB.prepare(`SELECT status FROM payroll WHERE id = ?`).bind(id).first<{ status: string }>()
  if (!row) return c.json({ success: false, error: '없음' }, 404)
  if (row.status !== 'PENDING') return c.json({ success: false, error: 'PENDING 상태만 삭제 가능' }, 400)
  await c.env.DB.prepare(`DELETE FROM payroll WHERE id = ?`).bind(id).run()
  return c.json({ success: true })
})

// ============================================================================
// API: 4대보험 요율 조회
// GET /api/payroll/rates/:year
// ============================================================================

export default recordsRouter
