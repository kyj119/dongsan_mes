// 연차 관리 (Phase B3)
// 결정사항 #15: 근로기준법 준수
//  - 입사 1년 미만: 매월 개근 시 1일 (최대 11일)
//  - 입사 1년차: 15일 일괄 부여
//  - 3년차부터: 2년마다 1일 가산 (3년=16, 5년=17 ... 최대 25)
import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { requirePagePermission } from '../middleware/permissions'

// ---------- D1 row shapes ----------
interface EmployeeBasicRow {
  id: number; employee_code: string; name: string; department: string
  position: string; hire_date: string; status: string
}
interface EmployeeHireDateRow { id: number; hire_date: string }
interface AccruedRow { accrued: number }
interface LeaveTypeRow { deduction_days: number }
interface LeaveTypeWithCategoryRow { category: string; deduction_days: number }
interface LeaveRequestRow {
  id: number; employee_id: number; leave_type: string
  start_date: string; end_date: string; days: number
  reason: string | null; status: string
  approved_by: number | null; approved_at: string | null
  rejection_reason: string | null
}
interface EmployeeIdRow { id: number }
interface BalanceRow {
  employee_id: number; employee_code: string; name: string; department: string
  position: string; hire_date: string; base_salary: number
  total_annual: number; used_annual: number; remaining_annual: number
  sick_total: number; sick_used: number; sick_remaining: number
}

const leavesRouter = new Hono<HonoEnv>()
leavesRouter.use('/*', authMiddleware, requirePagePermission('/leaves'))

// ============================================================================
// 근로기준법 연차 계산기
// ============================================================================

/** 입사일과 기준일을 받아 해당 시점의 연간 부여 일수를 반환한다. */
function calcAnnualEntitlement(hireDate: string, asOf: Date = new Date()): number {
  const hire = new Date(hireDate)
  if (isNaN(hire.getTime())) return 0
  const years = (asOf.getTime() - hire.getTime()) / (365.25 * 24 * 3600 * 1000)
  if (years < 1) return 0 // 월차로 처리
  if (years < 2) return 15
  // 3년차(만 2년 경과)부터 1일씩 가산, 2년마다 1일
  // 만 2년: 15, 만 3년: 16, 만 5년: 17, 만 7년: 18 ... 최대 25
  const bonus = Math.floor((Math.floor(years) - 1) / 2)
  return Math.min(25, 15 + bonus)
}

/** 입사 1년 미만 직원의 월별 적립 — 매월 개근 시 1일, 최대 11일 */
function calcMonthlyAccrualUpTo(hireDate: string, asOf: Date = new Date()): number {
  const hire = new Date(hireDate)
  if (isNaN(hire.getTime())) return 0
  const months = (asOf.getFullYear() - hire.getFullYear()) * 12 + (asOf.getMonth() - hire.getMonth())
  if (months <= 0) return 0
  return Math.min(11, months)
}

// ============================================================================
// 잔여 조회
// ============================================================================

// 전체 직원 연차 현황 (관리자/매니저)
leavesRouter.get('/balances', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const year = Number(c.req.query('year') || new Date().getFullYear())
    const { results } = await c.env.DB.prepare(`
      SELECT
        e.id as employee_id,
        e.employee_code,
        e.name,
        e.department,
        e.position,
        e.hire_date,
        e.status as employee_status,
        COALESCE(lb.accrued, 0) as accrued,
        COALESCE(lb.granted_extra, 0) as granted_extra,
        COALESCE(lb.used, 0) as used,
        COALESCE(lb.carried_over, 0) as carried_over,
        (COALESCE(lb.accrued, 0) + COALESCE(lb.granted_extra, 0) + COALESCE(lb.carried_over, 0) - COALESCE(lb.used, 0)) as remaining
      FROM employees e
      LEFT JOIN leave_balances lb
        ON lb.employee_id = e.id AND lb.year = ? AND lb.leave_type = 'ANNUAL'
      WHERE e.status = 'ACTIVE'
      ORDER BY e.department, e.name
    `).bind(year).all()
    return c.json({ success: true, data: results, year })
  } catch (error: any) {
    console.error('leaves balances error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.', detail: '서버 오류가 발생했습니다' }, 500)
  }
})

// 직원 본인 연차 현황 (입사일 기준 전체 연도)
leavesRouter.get('/balance/:employeeId', async (c) => {
  try {
    const employeeId = Number(c.req.param('employeeId'))
    const emp = await c.env.DB.prepare(
      `SELECT id, employee_code, name, department, position, hire_date, status FROM employees WHERE id = ?`
    ).bind(employeeId).first<EmployeeBasicRow>()
    if (!emp) return c.json({ success: false, error: '직원을 찾을 수 없습니다.' }, 404)

    const { results: history } = await c.env.DB.prepare(`
      SELECT year, leave_type, accrued, granted_extra, used, carried_over,
        (accrued + granted_extra + carried_over - used) as remaining
      FROM leave_balances
      WHERE employee_id = ?
      ORDER BY year DESC, leave_type
    `).bind(employeeId).all()

    const currentYear = new Date().getFullYear()
    const expectedAnnual = calcAnnualEntitlement(emp.hire_date)
    const expectedMonthly = calcMonthlyAccrualUpTo(emp.hire_date)

    return c.json({
      success: true,
      data: {
        employee: emp,
        current_year: currentYear,
        expected_annual: expectedAnnual,
        expected_monthly_grant: expectedMonthly,
        history,
      },
    })
  } catch (error: any) {
    console.error('leaves balance error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.', detail: '서버 오류가 발생했습니다' }, 500)
  }
})

// ============================================================================
// 연차 적립 (월별/연차)
// ============================================================================

// 월 1회 자동 실행 — 입사 1년 미만 직원에게 월차 1일씩 적립
leavesRouter.post('/accrual/monthly', requireRole('ADMIN'), async (c) => {
  try {
    const user = c.get('user')
    const today = new Date()
    const currentYear = today.getFullYear()

    const { results: employees } = await c.env.DB.prepare(`
      SELECT id, hire_date FROM employees WHERE status = 'ACTIVE' AND hire_date IS NOT NULL
    `).all<EmployeeHireDateRow>()

    let processed = 0
    const errors: string[] = []

    for (const emp of employees) {
      const expected = calcMonthlyAccrualUpTo(emp.hire_date, today)
      const annual = calcAnnualEntitlement(emp.hire_date, today)
      if (annual >= 15) continue // 1년 이상 → 월차 대상 아님
      if (expected <= 0) continue

      // 현재 적립값 확인
      const existing = await c.env.DB.prepare(
        `SELECT accrued FROM leave_balances WHERE employee_id = ? AND year = ? AND leave_type = 'ANNUAL'`
      ).bind(emp.id, currentYear).first<AccruedRow>()

      const currentAccrued = existing?.accrued || 0
      const delta = expected - currentAccrued
      if (delta <= 0) continue

      try {
        await c.env.DB.prepare(`
          INSERT INTO leave_balances (employee_id, year, leave_type, accrued)
          VALUES (?, ?, 'ANNUAL', ?)
          ON CONFLICT(employee_id, year, leave_type) DO UPDATE SET
            accrued = excluded.accrued, updated_at = CURRENT_TIMESTAMP
        `).bind(emp.id, currentYear, expected).run()

        await c.env.DB.prepare(`
          INSERT INTO leave_accrual_logs (employee_id, year, accrual_type, days, reason, run_by)
          VALUES (?, ?, 'MONTHLY', ?, '입사 1년 미만 월차 자동 적립', ?)
        `).bind(emp.id, currentYear, delta, user?.id || null).run()
        processed++
      } catch (e: any) {
        console.error(`Accrual error for emp_id=${emp.id}:`, e)
        errors.push(`emp_id=${emp.id}: 오류가 발생했습니다`)
      }
    }

    return c.json({ success: true, processed, errors })
  } catch (error: any) {
    console.error('leaves accrual monthly error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.', detail: '서버 오류가 발생했습니다' }, 500)
  }
})

// 연 1회 자동 실행 — 1년차 이상 직원에게 연간 부여
leavesRouter.post('/accrual/yearly', requireRole('ADMIN'), async (c) => {
  try {
    const user = c.get('user')
    const today = new Date()
    const currentYear = today.getFullYear()

    const { results: employees } = await c.env.DB.prepare(`
      SELECT id, hire_date FROM employees WHERE status = 'ACTIVE' AND hire_date IS NOT NULL
    `).all<EmployeeHireDateRow>()

    let processed = 0
    const errors: string[] = []

    for (const emp of employees) {
      const annual = calcAnnualEntitlement(emp.hire_date, today)
      if (annual <= 0) continue

      const existing = await c.env.DB.prepare(
        `SELECT accrued FROM leave_balances WHERE employee_id = ? AND year = ? AND leave_type = 'ANNUAL'`
      ).bind(emp.id, currentYear).first<AccruedRow>()

      const currentAccrued = existing?.accrued || 0
      if (currentAccrued >= annual) continue

      try {
        await c.env.DB.prepare(`
          INSERT INTO leave_balances (employee_id, year, leave_type, accrued)
          VALUES (?, ?, 'ANNUAL', ?)
          ON CONFLICT(employee_id, year, leave_type) DO UPDATE SET
            accrued = excluded.accrued, updated_at = CURRENT_TIMESTAMP
        `).bind(emp.id, currentYear, annual).run()

        await c.env.DB.prepare(`
          INSERT INTO leave_accrual_logs (employee_id, year, accrual_type, days, reason, run_by)
          VALUES (?, ?, 'YEARLY', ?, '연간 연차 자동 부여 (근로기준법)', ?)
        `).bind(emp.id, currentYear, annual - currentAccrued, user?.id || null).run()
        processed++
      } catch (e: any) {
        console.error(`Accrual error for emp_id=${emp.id}:`, e)
        errors.push(`emp_id=${emp.id}: 오류가 발생했습니다`)
      }
    }

    return c.json({ success: true, processed, errors })
  } catch (error: any) {
    console.error('leaves accrual yearly error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.', detail: '서버 오류가 발생했습니다' }, 500)
  }
})

// 별도 부여 (관리자가 특별 휴가 등 추가)
leavesRouter.post('/grant', requireRole('ADMIN'), async (c) => {
  try {
    const user = c.get('user')
    const body = await c.req.json<{ employee_id: number; year: number; days: number; reason?: string }>()
    if (!body.employee_id || !body.year || !body.days) {
      return c.json({ success: false, error: 'employee_id, year, days 필수' }, 400)
    }

    await c.env.DB.prepare(`
      INSERT INTO leave_balances (employee_id, year, leave_type, granted_extra)
      VALUES (?, ?, 'ANNUAL', ?)
      ON CONFLICT(employee_id, year, leave_type) DO UPDATE SET
        granted_extra = leave_balances.granted_extra + excluded.granted_extra,
        updated_at = CURRENT_TIMESTAMP
    `).bind(body.employee_id, body.year, body.days).run()

    await c.env.DB.prepare(`
      INSERT INTO leave_accrual_logs (employee_id, year, accrual_type, days, reason, run_by)
      VALUES (?, ?, 'TENURE_BONUS', ?, ?, ?)
    `).bind(body.employee_id, body.year, body.days, body.reason || '별도 부여', user?.id || null).run()

    return c.json({ success: true })
  } catch (error: any) {
    console.error('leaves grant error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.', detail: '서버 오류가 발생했습니다' }, 500)
  }
})

// ============================================================================
// 휴가 신청 / 승인 (1단계 결재)
// ============================================================================

leavesRouter.get('/requests', async (c) => {
  try {
    const { status, employee_id, from, to } = c.req.query()
    const clauses: string[] = []
    const params: any[] = []
    if (status) { clauses.push('lr.status = ?'); params.push(status) }
    if (employee_id) { clauses.push('lr.employee_id = ?'); params.push(Number(employee_id)) }
    if (from) { clauses.push('lr.start_date >= ?'); params.push(from) }
    if (to) { clauses.push('lr.end_date <= ?'); params.push(to) }
    const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : ''

    const { results } = await c.env.DB.prepare(`
      SELECT lr.*, e.name as employee_name, e.employee_code, e.department,
        ap.name as approver_name
      FROM leave_requests lr
      LEFT JOIN employees e ON e.id = lr.employee_id
      LEFT JOIN users ap ON ap.id = lr.approved_by
      ${where}
      ORDER BY lr.created_at DESC
      LIMIT 200
    `).bind(...params).all()

    return c.json({ success: true, data: results })
  } catch (error: any) {
    console.error('leaves requests list error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.', detail: '서버 오류가 발생했습니다' }, 500)
  }
})

leavesRouter.post('/requests', async (c) => {
  try {
    const user = c.get('user')
    const body = await c.req.json<{
      employee_id: number; leave_type: string; start_date: string; end_date: string;
      days?: number; reason?: string;
    }>()
    if (!body.employee_id || !body.leave_type || !body.start_date || !body.end_date) {
      return c.json({ success: false, error: 'employee_id, leave_type, start_date, end_date 필수' }, 400)
    }

    // leave_types에서 deduction_days 조회 — days 미입력 시 자동 계산
    let days = body.days
    if (days == null) {
      const lt = await c.env.DB.prepare(
        `SELECT deduction_days FROM leave_types WHERE code = ?`
      ).bind(body.leave_type).first<LeaveTypeRow>()
      if (lt) {
        // 반차/반반차는 1일 내 사용, 연차는 날짜 차이
        if (lt.deduction_days < 1) {
          days = lt.deduction_days
        } else {
          const start = new Date(body.start_date)
          const end = new Date(body.end_date)
          const diffDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / (86400000)) + 1)
          days = diffDays * lt.deduction_days
        }
      } else {
        days = 1 // fallback
      }
    }

    const result = await c.env.DB.prepare(`
      INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, days, reason, status, created_by)
      VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?)
    `).bind(
      body.employee_id, body.leave_type, body.start_date, body.end_date,
      days, body.reason || null, user?.id || null
    ).run()

    return c.json({ success: true, data: { id: result.meta.last_row_id, days } })
  } catch (error: any) {
    console.error('leaves request create error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.', detail: '서버 오류가 발생했습니다' }, 500)
  }
})

leavesRouter.patch('/requests/:id/approve', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const user = c.get('user')
    const id = Number(c.req.param('id'))

    const req = await c.env.DB.prepare(
      `SELECT * FROM leave_requests WHERE id = ?`
    ).bind(id).first<LeaveRequestRow>()
    if (!req) return c.json({ success: false, error: '신청을 찾을 수 없습니다.' }, 404)
    if (req.status !== 'PENDING') return c.json({ success: false, error: '이미 처리된 신청입니다.' }, 400)

    // 잔여 차감: leave_types에서 카테고리 확인
    const lt = await c.env.DB.prepare(
      `SELECT category, deduction_days FROM leave_types WHERE code = ?`
    ).bind(req.leave_type).first<LeaveTypeWithCategoryRow>()

    const year = new Date(req.start_date).getFullYear()
    if (lt?.category === 'ANNUAL' || req.leave_type === 'ANNUAL' ||
        ['HALF_AM', 'HALF_PM', 'QUARTER_1', 'QUARTER_2', 'QUARTER_3', 'QUARTER_4'].includes(req.leave_type)) {
      // 연차계열: ANNUAL 잔여에서 차감
      await c.env.DB.prepare(`
        INSERT INTO leave_balances (employee_id, year, leave_type, used)
        VALUES (?, ?, 'ANNUAL', ?)
        ON CONFLICT(employee_id, year, leave_type) DO UPDATE SET
          used = leave_balances.used + excluded.used,
          updated_at = CURRENT_TIMESTAMP
      `).bind(req.employee_id, year, req.days).run()
    } else if (lt?.category === 'SICK' || req.leave_type === 'SICK') {
      // 병가: SICK 잔여에서 차감
      await c.env.DB.prepare(`
        INSERT INTO leave_balances (employee_id, year, leave_type, used)
        VALUES (?, ?, 'SICK', ?)
        ON CONFLICT(employee_id, year, leave_type) DO UPDATE SET
          used = leave_balances.used + excluded.used,
          updated_at = CURRENT_TIMESTAMP
      `).bind(req.employee_id, year, req.days).run()
    }
    // 경조휴가(FAMILY)는 별도 잔여 차감 없음 (규정 일수만큼 유급)

    await c.env.DB.prepare(`
      UPDATE leave_requests SET status = 'APPROVED', approved_by = ?, approved_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(user?.id || null, id).run()

    return c.json({ success: true })
  } catch (error: any) {
    console.error('leaves approve error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.', detail: '서버 오류가 발생했습니다' }, 500)
  }
})

leavesRouter.patch('/requests/:id/reject', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const user = c.get('user')
    const id = Number(c.req.param('id'))
    const body: { reason?: string } = await c.req.json<{ reason?: string }>().catch(() => ({}))

    await c.env.DB.prepare(`
      UPDATE leave_requests SET status = 'REJECTED', approved_by = ?, approved_at = CURRENT_TIMESTAMP, rejection_reason = ?
      WHERE id = ? AND status = 'PENDING'
    `).bind(user?.id || null, body.reason || null, id).run()

    return c.json({ success: true })
  } catch (error: any) {
    console.error('leaves reject error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.', detail: '서버 오류가 발생했습니다' }, 500)
  }
})

// 신청 취소 (PENDING만)
leavesRouter.delete('/requests/:id', async (c) => {
  try {
    const id = Number(c.req.param('id'))
    await c.env.DB.prepare(
      `DELETE FROM leave_requests WHERE id = ? AND status = 'PENDING'`
    ).bind(id).run()
    return c.json({ success: true })
  } catch (error: any) {
    console.error('leaves cancel error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.', detail: '서버 오류가 발생했습니다' }, 500)
  }
})

// ============================================================================
// 휴가 유형 관리 (leave_types)
// ============================================================================

// 전체 목록
leavesRouter.get('/types', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT * FROM leave_types WHERE is_active = 1 ORDER BY sort_order, id
    `).all()
    return c.json({ success: true, data: results })
  } catch (error: any) {
    console.error('leave types list error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.', detail: '서버 오류가 발생했습니다' }, 500)
  }
})

// 휴가 유형 수정 (관리자) — 시간대 변경 등
leavesRouter.put('/types/:id', requireRole('ADMIN'), async (c) => {
  try {
    const id = Number(c.req.param('id'))
    const body = await c.req.json<any>()
    const fields: string[] = []
    const params: any[] = []
    for (const key of ['name', 'deduction_days', 'time_from', 'time_to', 'is_paid', 'is_active', 'sort_order']) {
      if (body[key] !== undefined) { fields.push(`${key} = ?`); params.push(body[key]) }
    }
    if (fields.length === 0) return c.json({ success: false, error: '변경할 필드 없음' }, 400)
    fields.push(`updated_at = datetime('now')`)
    params.push(id)
    await c.env.DB.prepare(`UPDATE leave_types SET ${fields.join(', ')} WHERE id = ?`).bind(...params).run()
    return c.json({ success: true })
  } catch (error: any) {
    console.error('leave type update error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.', detail: '서버 오류가 발생했습니다' }, 500)
  }
})

// ============================================================================
// 경조휴가 기준 관리 (family_event_rules)
// ============================================================================

leavesRouter.get('/family-events', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT * FROM family_event_rules WHERE is_active = 1 ORDER BY sort_order, id
    `).all()
    return c.json({ success: true, data: results })
  } catch (error: any) {
    console.error('family events list error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.', detail: '서버 오류가 발생했습니다' }, 500)
  }
})

leavesRouter.put('/family-events/:id', requireRole('ADMIN'), async (c) => {
  try {
    const id = Number(c.req.param('id'))
    const body = await c.req.json<any>()
    const fields: string[] = []
    const params: any[] = []
    for (const key of ['event_name', 'paid_days', 'is_active', 'sort_order']) {
      if (body[key] !== undefined) { fields.push(`${key} = ?`); params.push(body[key]) }
    }
    if (fields.length === 0) return c.json({ success: false, error: '변경할 필드 없음' }, 400)
    params.push(id)
    await c.env.DB.prepare(`UPDATE family_event_rules SET ${fields.join(', ')} WHERE id = ?`).bind(...params).run()
    return c.json({ success: true })
  } catch (error: any) {
    console.error('family event update error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.', detail: '서버 오류가 발생했습니다' }, 500)
  }
})

leavesRouter.post('/family-events', requireRole('ADMIN'), async (c) => {
  try {
    const body = await c.req.json<any>()
    if (!body.event_name || body.paid_days == null) {
      return c.json({ success: false, error: 'event_name, paid_days 필수' }, 400)
    }
    const result = await c.env.DB.prepare(`
      INSERT INTO family_event_rules (event_name, paid_days, sort_order) VALUES (?, ?, ?)
    `).bind(body.event_name, body.paid_days, body.sort_order || 0).run()
    return c.json({ success: true, data: { id: result.meta.last_row_id } })
  } catch (error: any) {
    console.error('family event create error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.', detail: '서버 오류가 발생했습니다' }, 500)
  }
})

// ============================================================================
// 병가 잔여 관리
// ============================================================================

// 병가 일수 설정 (연도별, 직원별 또는 일괄)
leavesRouter.post('/sick-grant', requireRole('ADMIN'), async (c) => {
  try {
    const user = c.get('user')
    const body = await c.req.json<any>()
    const { year, days, employee_ids, notes } = body
    if (!year || days == null) return c.json({ success: false, error: 'year, days 필수' }, 400)

    // employee_ids 없으면 전체 재직중 직원
    let targetIds: number[] = []
    if (Array.isArray(employee_ids) && employee_ids.length > 0) {
      targetIds = employee_ids.map(Number)
    } else {
      const { results } = await c.env.DB.prepare(
        `SELECT id FROM employees WHERE status = 'ACTIVE'`
      ).all<EmployeeIdRow>()
      targetIds = results.map(r => r.id)
    }

    let processed = 0
    for (const empId of targetIds) {
      await c.env.DB.prepare(`
        INSERT INTO leave_balances (employee_id, year, leave_type, accrued, notes)
        VALUES (?, ?, 'SICK', ?, ?)
        ON CONFLICT(employee_id, year, leave_type) DO UPDATE SET
          accrued = excluded.accrued,
          notes = excluded.notes,
          updated_at = CURRENT_TIMESTAMP
      `).bind(empId, year, days, notes || `유급병가 ${days}일 부여`).run()
      processed++
    }

    return c.json({ success: true, data: { processed, year, days } })
  } catch (error: any) {
    console.error('sick grant error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.', detail: '서버 오류가 발생했습니다' }, 500)
  }
})

// ============================================================================
// 미사용 연차수당 조회
// ============================================================================

leavesRouter.get('/unused-allowance', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const year = Number(c.req.query('year') || new Date().getFullYear())

    // 직원별 연차 잔여 + 기본급(일급 계산용)
    const { results } = await c.env.DB.prepare(`
      SELECT
        e.id as employee_id,
        e.employee_code,
        e.name,
        e.department,
        e.position,
        e.hire_date,
        e.base_salary,
        COALESCE(lb.accrued, 0) + COALESCE(lb.granted_extra, 0) + COALESCE(lb.carried_over, 0) as total_annual,
        COALESCE(lb.used, 0) as used_annual,
        (COALESCE(lb.accrued, 0) + COALESCE(lb.granted_extra, 0) + COALESCE(lb.carried_over, 0) - COALESCE(lb.used, 0)) as remaining_annual,
        COALESCE(sick.accrued, 0) as sick_total,
        COALESCE(sick.used, 0) as sick_used,
        (COALESCE(sick.accrued, 0) - COALESCE(sick.used, 0)) as sick_remaining
      FROM employees e
      LEFT JOIN leave_balances lb
        ON lb.employee_id = e.id AND lb.year = ? AND lb.leave_type = 'ANNUAL'
      LEFT JOIN leave_balances sick
        ON sick.employee_id = e.id AND sick.year = ? AND sick.leave_type = 'SICK'
      WHERE e.status = 'ACTIVE'
      ORDER BY e.department, e.name
    `).bind(year, year).all<BalanceRow>()

    // 미사용 연차수당 계산: 기본급 / 209시간 * 8 * 잔여일수
    // (통상임금 시급 = 월급 / 209, 일급 = 시급 * 8)
    const data = results.map(r => {
      const remaining = Math.max(0, r.remaining_annual || 0)
      const baseSalary = r.base_salary || 0
      const hourlyRate = baseSalary > 0 ? Math.round(baseSalary / 209) : 0
      const dailyRate = hourlyRate * 8
      const unusedAllowance = dailyRate * remaining
      return {
        ...r,
        hourly_rate: hourlyRate,
        daily_rate: dailyRate,
        unused_allowance: unusedAllowance
      }
    })

    return c.json({ success: true, data })
  } catch (error) {
    console.error('src/routes/leaves.ts unused-allowance error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

export default leavesRouter
