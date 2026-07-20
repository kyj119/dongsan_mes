/**
 * payroll/records.ts — 급여 레코드 CRUD (B)
 * 2026-04-15 분할
 */
import { Hono } from 'hono'
import type { HonoEnv } from '../../types/env'
import { authMiddleware, requireRole } from '../../middleware/auth'
import { getEntityId, entityFilter } from '../../utils/entityFilter'

const recordsRouter = new Hono<HonoEnv>()
// 급여 레코드(급여·공제·연락처 PII)는 전 라우트 ADMIN/MANAGER 전용
recordsRouter.use('/*', authMiddleware, requireRole('ADMIN', 'MANAGER'))

recordsRouter.get('/', async (c) => {
  try {
    const period = c.req.query('period') || ''
    const status = c.req.query('status') || ''
    // 방어적 상한: 급여 PII 전량 반환 방지 (기본 500, cap 1000)
    const limit = Math.min(Math.max(parseInt(c.req.query('limit') || '500'), 1), 1000)
    const offset = Math.max(parseInt(c.req.query('offset') || '0'), 0)

    const clauses: string[] = ['e.is_deleted = 0']
    const params: any[] = []
    if (period) { clauses.push('p.pay_period = ?'); params.push(period) }
    if (status) { clauses.push('p.status = ?'); params.push(status) }
    const entityId = getEntityId(c)
    if (entityId !== 0) { clauses.push('p.entity_id = ?'); params.push(entityId) }
    const where = 'WHERE ' + clauses.join(' AND ')

    const countRow = await c.env.DB.prepare(
      `SELECT COUNT(*) as count FROM payroll p JOIN employees e ON p.employee_id = e.id ${where}`
    ).bind(...params).first<{ count: number }>()
    const count = countRow?.count ?? 0

    const rows = await c.env.DB.prepare(
      `SELECT p.*, e.name as employee_name, e.employee_code, e.department, e.position,
              e.base_salary as employee_base_salary, e.mobile as employee_mobile,
              ent.name as entity_name
       FROM payroll p
       JOIN employees e ON p.employee_id = e.id
       LEFT JOIN entities ent ON ent.id = p.entity_id
       ${where}
       ORDER BY e.department, e.name
       LIMIT ${limit} OFFSET ${offset}`
    ).bind(...params).all()

    const items = rows.results || []
    // 응답 포맷 통일: items 키로 반환하되 루트 배열은 backwards compat으로 유지
    return c.json({ success: true, data: { items, list: items, total: items.length, count, limit, offset } })
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
  const efP = entityFilter(c, 'p')
  const row = await c.env.DB.prepare(
    `SELECT p.*, e.name as employee_name, e.employee_code, e.department, e.position,
            ent.name as entity_name
     FROM payroll p JOIN employees e ON p.employee_id = e.id
     LEFT JOIN entities ent ON ent.id = p.entity_id WHERE p.id = ?${efP.clause}`
  ).bind(id, ...efP.params).first()
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
  const ef = entityFilter(c)
  // 급여확정 잠금: PENDING → APPROVED 만 허용 (PAID/APPROVED 재승인·역전이 차단)
  const cur = await c.env.DB.prepare(`SELECT status FROM payroll WHERE id=?${ef.clause}`).bind(id, ...ef.params).first<{ status: string }>()
  if (!cur) return c.json({ success: false, error: '없음' }, 404)
  if (cur.status !== 'PENDING') return c.json({ success: false, error: `승인 불가: 현재 상태 ${cur.status} (대기 상태만 승인 가능)` }, 400)
  await c.env.DB.prepare(
    `UPDATE payroll SET status='APPROVED', approved_by=?, approved_at=datetime('now'), updated_at=datetime('now') WHERE id=?${ef.clause} AND status='PENDING'`
  ).bind(user?.id || null, id, ...ef.params).run()
  return c.json({ success: true })
})

// ============================================================================
// API: 급여 지급 처리
// PATCH /api/payroll/:id/pay
// ============================================================================
recordsRouter.patch('/:id/pay', requireRole('ADMIN', 'MANAGER'), async (c) => {
  const id = Number(c.req.param('id'))
  const ef = entityFilter(c)
  // 급여확정 잠금: APPROVED → PAID 만 허용 (미승인 건너뜀·재지급 차단)
  const cur = await c.env.DB.prepare(`SELECT status FROM payroll WHERE id=?${ef.clause}`).bind(id, ...ef.params).first<{ status: string }>()
  if (!cur) return c.json({ success: false, error: '없음' }, 404)
  if (cur.status !== 'APPROVED') return c.json({ success: false, error: `지급 불가: 현재 상태 ${cur.status} (승인 상태만 지급 가능)` }, 400)
  await c.env.DB.prepare(
    `UPDATE payroll SET status='PAID', paid_at=datetime('now'), updated_at=datetime('now') WHERE id=?${ef.clause} AND status='APPROVED'`
  ).bind(id, ...ef.params).run()
  return c.json({ success: true })
})

// ============================================================================
// API: 급여명세서 직원 공개(교부)
// POST /api/payroll/publish  body: { pay_period: 'YYYY-MM' }
// 해당 월 급여 전건에 published_at 세팅(셀프 노출 게이트) + 교부 증빙 로그 upsert.
// 상태(PENDING/APPROVED/PAID) 무관 — 교부는 상태와 독립(사용자 결정). 재교부 허용.
// ============================================================================
recordsRouter.post('/publish', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({} as any))
    const period = String(body.pay_period || '').trim()
    if (!/^\d{4}-\d{2}$/.test(period)) return c.json({ success: false, error: 'pay_period(YYYY-MM) 형식이 필요합니다.' }, 400)
    const user = c.get('user')
    const ef = entityFilter(c)
    const { results: targets } = await c.env.DB.prepare(
      `SELECT id, employee_id, entity_id FROM payroll WHERE pay_period = ?${ef.clause}`
    ).bind(period, ...ef.params).all<{ id: number; employee_id: number; entity_id: number | null }>()
    if (!targets || targets.length === 0) return c.json({ success: false, error: '해당 월 급여 내역이 없습니다.' }, 404)

    // 원자성: published_at UPDATE + 교부 증빙 로그 INSERT를 단일 db.batch로 처리.
    // D1은 cross-statement 트랜잭션이 없어 분리 실행 시 부분 교부(노출됐는데 증빙 누락) 위험.
    // 단일 batch면 실패 시 전체 롤백 → 미교부·무증빙 상태 유지. 각 문은 개별 prepared(bind ~5개 <100).
    const stmts = [
      c.env.DB.prepare(
        `UPDATE payroll SET published_at = datetime('now'), updated_at = datetime('now') WHERE pay_period = ?${ef.clause}`
      ).bind(period, ...ef.params),
      ...targets.map((t) => c.env.DB.prepare(
        `INSERT INTO payslip_issuance_logs (payroll_id, employee_id, entity_id, pay_period, issued_at, issued_by)
         VALUES (?, ?, ?, ?, datetime('now'), ?)
         ON CONFLICT(payroll_id) DO UPDATE SET issued_at = datetime('now'), issued_by = excluded.issued_by`
      ).bind(t.id, t.employee_id, t.entity_id ?? null, period, user?.id ?? null)),
    ]
    await c.env.DB.batch(stmts)

    return c.json({ success: true, data: { published: targets.length, pay_period: period } })
  } catch (err: any) {
    console.error('Payroll publish error:', err)
    return c.json({ success: false, error: '교부 처리 실패' }, 500)
  }
})

// ============================================================================
// API: 급여명세서 교부 취소 (노출 게이트만 닫음 — 증빙 로그는 보존)
// POST /api/payroll/unpublish  body: { pay_period: 'YYYY-MM' }
// ============================================================================
recordsRouter.post('/unpublish', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({} as any))
    const period = String(body.pay_period || '').trim()
    if (!/^\d{4}-\d{2}$/.test(period)) return c.json({ success: false, error: 'pay_period(YYYY-MM) 형식이 필요합니다.' }, 400)
    const ef = entityFilter(c)
    const res = await c.env.DB.prepare(
      `UPDATE payroll SET published_at = NULL, updated_at = datetime('now') WHERE pay_period = ?${ef.clause}`
    ).bind(period, ...ef.params).run()
    return c.json({ success: true, data: { unpublished: res.meta?.changes ?? 0, pay_period: period } })
  } catch (err: any) {
    console.error('Payroll unpublish error:', err)
    return c.json({ success: false, error: '교부 취소 실패' }, 500)
  }
})

// ============================================================================
// API: 급여 삭제 (PENDING만)
// DELETE /api/payroll/:id
// ============================================================================
recordsRouter.delete('/:id', requireRole('ADMIN', 'MANAGER'), async (c) => {
  const id = Number(c.req.param('id'))
  const ef = entityFilter(c)
  const row = await c.env.DB.prepare(`SELECT status FROM payroll WHERE id = ?${ef.clause}`).bind(id, ...ef.params).first<{ status: string }>()
  if (!row) return c.json({ success: false, error: '없음' }, 404)
  if (row.status !== 'PENDING') return c.json({ success: false, error: 'PENDING 상태만 삭제 가능' }, 400)
  await c.env.DB.prepare(`DELETE FROM payroll WHERE id = ?${ef.clause}`).bind(id, ...ef.params).run()
  return c.json({ success: true })
})

// ============================================================================
// API: 4대보험 요율 조회
// GET /api/payroll/rates/:year
// ============================================================================

export default recordsRouter
