// 연차 관리 (Phase B3)
// 결정사항 #15: 근로기준법 준수
//  - 입사 1년 미만: 매월 개근 시 1일 (최대 11일)
//  - 입사 1년차: 15일 일괄 부여
//  - 3년차부터: 2년마다 1일 가산 (3년=16, 5년=17 ... 최대 25)
import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { requirePagePermission } from '../middleware/permissions'
import { entityFilter, getEntityId } from '../utils/entityFilter'
import { markLeaveAttendance, clearLeaveAttendance, enumerateDates } from '../utils/leaveAttendance'
import { calcInclusivePay, loadOvertimeSettings } from './payroll/shared'
import { sendEmail } from '../services/emailProvider'

// ---------- D1 row shapes ----------
interface EmployeeBasicRow {
  id: number; employee_code: string; name: string; department: string
  position: string; hire_date: string; status: string
}
interface EmployeeHireDateRow { id: number; hire_date: string; entity_id?: number }
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
  position_allowance?: number; overtime_daily_hours?: number; overtime_work_days?: number
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

/** B8: 적립/근속 계산용 KST 기준 현재시각(워커 런타임=UTC라 +9h가 KST 벽시계). */
function kstNow(): Date {
  return new Date(Date.now() + 9 * 3600 * 1000)
}

/**
 * C2/B4: start~end(YYYY-MM-DD, 포함) 사이 소정근로일 수 — 토·일 및 공휴일(holidays) 제외.
 * 연차는 달력일이 아닌 소정근로일 기준으로 차감해야 함(근로기준법).
 */
async function countWorkingDays(db: D1Database, start: string, end: string): Promise<number> {
  const dates = enumerateDates(start, end)
  if (dates.length === 0) return 0
  const { results } = await db.prepare(
    `SELECT holiday_date FROM holidays WHERE holiday_date BETWEEN ? AND ?`
  ).bind(dates[0], dates[dates.length - 1]).all<{ holiday_date: string }>()
  const holidaySet = new Set((results || []).map(h => String(h.holiday_date)))
  let n = 0
  for (const d of dates) {
    const dow = new Date(d + 'T00:00:00Z').getUTCDay() // 0=일, 6=토
    if (dow === 0 || dow === 6) continue
    if (holidaySet.has(d)) continue
    n++
  }
  return n
}

/** 'YYYY-MM-DD' + N년 (2/29 → 익년 2/28 보정). 만료일 계산용. */
function addYears(dateStr: string, years: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr || '')
  if (!m) return ''
  const y = parseInt(m[1], 10) + years
  let d = m[3]
  if (m[2] === '02' && d === '29') d = '28'
  return `${y}-${m[2]}-${d}`
}

/** 'YYYY-MM-DD' + N일 */
function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00Z'); if (isNaN(d.getTime())) return ''
  d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10)
}
/** 'YYYY-MM-DD' + N개월 */
function addMonths(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00Z'); if (isNaN(d.getTime())) return ''
  d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10)
}

// 사용촉진 트랙(제61조): ANNUAL=1년이상 연차, MONTHLY_A=월차 1~9개월분, MONTHLY_B=월차 10·11개월분
type PromoSource = 'ANNUAL' | 'MONTHLY_A' | 'MONTHLY_B'
/** 입사일 기준 사용촉진 윈도우 계산(KST). 만료기준일·1차창·2차마감. null=계산불가. */
function promotionWindow(hireDate: string, source: PromoSource, todayStr: string): { base: string; firstStart: string; firstEnd: string; secondEnd: string } | null {
  if (!hireDate || hireDate.length < 10) return null
  const hireMD = hireDate.slice(5) // MM-DD
  if (source === 'ANNUAL') {
    let y = parseInt(todayStr.slice(0, 4), 10) // EXP = today 이후 첫 입사기념일
    if (`${y}-${hireMD}` <= todayStr) y += 1
    const exp = `${y}-${hireMD}`
    return { base: exp, firstStart: addMonths(exp, -6), firstEnd: addDays(addMonths(exp, -6), 10), secondEnd: addMonths(exp, -2) }
  }
  const anniv = addYears(hireDate, 1) // 입사일+1년
  if (source === 'MONTHLY_A') return { base: anniv, firstStart: addMonths(anniv, -3), firstEnd: addDays(addMonths(anniv, -3), 10), secondEnd: addMonths(anniv, -1) }
  return { base: anniv, firstStart: addMonths(anniv, -1), firstEnd: addDays(addMonths(anniv, -1), 5), secondEnd: addDays(anniv, -10) } // MONTHLY_B
}

// 병존: 연차 잔여는 ANNUAL(1년차+) + MONTHLY(1년미만 월차) 합산. 소멸분(expired) 차감.
/** 버킷(ANNUAL|MONTHLY)별 미만료 잔여 합(전 연도). 촉진 대상 일수 산정용. */
async function bucketRemaining(db: D1Database, employeeId: number, bucket: 'ANNUAL' | 'MONTHLY'): Promise<number> {
  const r = await db.prepare(
    `SELECT COALESCE(SUM(accrued+granted_extra+carried_over-used-expired),0) AS rem
     FROM leave_balances WHERE employee_id=? AND leave_type=?`
  ).bind(employeeId, bucket).first<{ rem: number }>()
  return Number(r?.rem ?? 0)
}
/** 연차 잔여 = SUM(accrued+granted_extra+carried_over-used-expired) over ANNUAL+MONTHLY (직원·연도). */
async function annualRemaining(db: D1Database, employeeId: number, year: number): Promise<number> {
  const r = await db.prepare(
    `SELECT COALESCE(SUM(accrued+granted_extra+carried_over-used-expired),0) AS rem
     FROM leave_balances WHERE employee_id=? AND year=? AND leave_type IN ('ANNUAL','MONTHLY')`
  ).bind(employeeId, year).first<{ rem: number }>()
  return Number(r?.rem ?? 0)
}

/** 차감 stmts: 연차=FIFO(MONTHLY 만료임박 먼저→ANNUAL), 병가=SICK 단일행. */
async function buildDeductStmts(db: D1Database, employeeId: number, year: number, deductType: 'ANNUAL' | 'SICK', days: number, entityId: number): Promise<D1PreparedStatement[]> {
  if (deductType === 'SICK') {
    return [db.prepare(`
      INSERT INTO leave_balances (employee_id, year, leave_type, used, entity_id) VALUES (?, ?, 'SICK', ?, ?)
      ON CONFLICT(employee_id, year, leave_type) DO UPDATE SET used = leave_balances.used + excluded.used, updated_at = CURRENT_TIMESTAMP
    `).bind(employeeId, year, days, entityId)]
  }
  const { results } = await db.prepare(
    `SELECT leave_type, (accrued+granted_extra+carried_over-used-expired) AS avail
     FROM leave_balances WHERE employee_id=? AND year=? AND leave_type IN ('ANNUAL','MONTHLY')`
  ).bind(employeeId, year).all<{ leave_type: string; avail: number }>()
  const availMap = new Map(results.map(r => [r.leave_type, Number(r.avail) || 0]))
  const stmts: D1PreparedStatement[] = []
  let need = days
  for (const lt of ['MONTHLY', 'ANNUAL']) { // FIFO: 만료 임박(월차) 먼저
    if (need <= 0) break
    const avail = availMap.get(lt) ?? 0
    if (avail <= 0) continue
    const take = Math.min(avail, need)
    stmts.push(db.prepare(`UPDATE leave_balances SET used=used+?, updated_at=CURRENT_TIMESTAMP WHERE employee_id=? AND year=? AND leave_type=?`).bind(take, employeeId, year, lt))
    need -= take
  }
  if (need > 0) { // 가용 부족분(잔여검증 통과면 0) — ANNUAL 행에 UPSERT
    stmts.push(db.prepare(`
      INSERT INTO leave_balances (employee_id, year, leave_type, used, entity_id) VALUES (?, ?, 'ANNUAL', ?, ?)
      ON CONFLICT(employee_id, year, leave_type) DO UPDATE SET used = leave_balances.used + excluded.used, updated_at = CURRENT_TIMESTAMP
    `).bind(employeeId, year, need, entityId))
  }
  return stmts
}

/** 복원 stmts(역FIFO): 연차=ANNUAL 먼저→MONTHLY, 병가=SICK. used -= days(0 미만 방지). */
async function buildRestoreStmts(db: D1Database, employeeId: number, year: number, deductType: 'ANNUAL' | 'SICK', days: number): Promise<D1PreparedStatement[]> {
  if (deductType === 'SICK') {
    return [db.prepare(`UPDATE leave_balances SET used=MAX(0,used-?), updated_at=CURRENT_TIMESTAMP WHERE employee_id=? AND year=? AND leave_type='SICK'`).bind(days, employeeId, year)]
  }
  const { results } = await db.prepare(
    `SELECT leave_type, used FROM leave_balances WHERE employee_id=? AND year=? AND leave_type IN ('ANNUAL','MONTHLY')`
  ).bind(employeeId, year).all<{ leave_type: string; used: number }>()
  const usedMap = new Map(results.map(r => [r.leave_type, Number(r.used) || 0]))
  const stmts: D1PreparedStatement[] = []
  let give = days
  for (const lt of ['ANNUAL', 'MONTHLY']) { // 역FIFO: ANNUAL 먼저 복원
    if (give <= 0) break
    const u = usedMap.get(lt) ?? 0
    if (u <= 0) continue
    const back = Math.min(u, give)
    stmts.push(db.prepare(`UPDATE leave_balances SET used=used-?, updated_at=CURRENT_TIMESTAMP WHERE employee_id=? AND year=? AND leave_type=?`).bind(back, employeeId, year, lt))
    give -= back
  }
  return stmts
}

/**
 * 적립값을 직원ID→accrued 맵으로 일괄 조회 (#321 N+1 제거). 병존: leaveType별.
 */
async function loadAnnualAccruedMap(
  c: { env: HonoEnv['Bindings'] },
  employeeIds: number[],
  year: number,
  leaveType: 'ANNUAL' | 'MONTHLY' = 'ANNUAL'
): Promise<Map<number, number>> {
  const map = new Map<number, number>()
  if (employeeIds.length === 0) return map
  const placeholders = employeeIds.map(() => '?').join(',')
  const { results } = await c.env.DB.prepare(
    `SELECT employee_id, accrued FROM leave_balances
     WHERE year = ? AND leave_type = ? AND employee_id IN (${placeholders})`
  ).bind(year, leaveType, ...employeeIds).all<{ employee_id: number; accrued: number }>()
  for (const row of results) map.set(row.employee_id, row.accrued || 0)
  return map
}

// ============================================================================
// 잔여 조회
// ============================================================================

// 전체 직원 연차 현황 (관리자/매니저)
leavesRouter.get('/balances', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const year = Number(c.req.query('year') || new Date().getFullYear())
    const department = c.req.query('department') || '' // #346: 부서 필터
    const ef = entityFilter(c, 'e') // employees 기준 격리(병존 집계 서브쿼리라 lb 직접필터 대신 e)
    const deptClause = department ? ' AND e.department = ?' : ''
    const deptParams = department ? [department] : []
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
        COALESCE(lb.expired, 0) as expired,
        (COALESCE(lb.accrued, 0) + COALESCE(lb.granted_extra, 0) + COALESCE(lb.carried_over, 0) - COALESCE(lb.used, 0) - COALESCE(lb.expired, 0)) as remaining
      FROM employees e
      LEFT JOIN (
        SELECT employee_id, SUM(accrued) accrued, SUM(granted_extra) granted_extra,
               SUM(used) used, SUM(carried_over) carried_over, SUM(expired) expired
        FROM leave_balances WHERE year = ? AND leave_type IN ('ANNUAL','MONTHLY')
        GROUP BY employee_id
      ) lb ON lb.employee_id = e.id
      WHERE e.status = 'ACTIVE' AND e.is_deleted = 0${ef.clause}${deptClause}
      ORDER BY e.department, e.name
    `).bind(year, ...ef.params, ...deptParams).all()
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
    // #440: entity 격리 — 형제 /balances와 동일. 미적용 시 타 법인 직원 PII·연차이력 cross-tenant 열람(IDOR)
    const efE = entityFilter(c)
    const emp = await c.env.DB.prepare(
      `SELECT id, employee_code, name, department, position, hire_date, status FROM employees WHERE id = ?${efE.clause}`
    ).bind(employeeId, ...efE.params).first<EmployeeBasicRow>()
    if (!emp) return c.json({ success: false, error: '직원을 찾을 수 없습니다.' }, 404)

    const efB = entityFilter(c)
    const { results: history } = await c.env.DB.prepare(`
      SELECT year, leave_type, accrued, granted_extra, used, carried_over, expired,
        (accrued + granted_extra + carried_over - used - expired) as remaining
      FROM leave_balances
      WHERE employee_id = ?${efB.clause}
      ORDER BY year DESC, leave_type
    `).bind(employeeId, ...efB.params).all()

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
    const today = kstNow() // B8: KST 기준(워커 UTC → +9h 벽시계)
    const currentYear = today.getUTCFullYear()

    const { results: employees } = await c.env.DB.prepare(`
      SELECT id, hire_date, entity_id FROM employees WHERE status = 'ACTIVE' AND is_deleted = 0 AND hire_date IS NOT NULL
    `).all<EmployeeHireDateRow>()

    let processed = 0
    const errors: string[] = []

    // 현재 월차 적립값 일괄 조회(병존: MONTHLY 버킷) — N+1 제거 (#321)
    const accruedMap = await loadAnnualAccruedMap(c, employees.map(e => e.id), currentYear, 'MONTHLY')

    // #416: 직원별 순차 INSERT 2N회(N+1 write) → stmt 누적 후 DB.batch. /grant(sick #321)와 동일 정책(all-or-nothing).
    const stmts: any[] = []
    for (const emp of employees) {
      const expected = calcMonthlyAccrualUpTo(emp.hire_date, today)
      const annual = calcAnnualEntitlement(emp.hire_date, today)
      if (annual >= 15) continue // 1년 이상 → 월차 대상 아님
      if (expected <= 0) continue

      const currentAccrued = accruedMap.get(emp.id) || 0
      const delta = expected - currentAccrued
      if (delta <= 0) continue

      // 병존: 월차는 leave_type='MONTHLY'로 분리 적립. 만료 = 입사일+1년 일괄(D 결정).
      const expire = addYears(emp.hire_date, 1)
      stmts.push(c.env.DB.prepare(`
        INSERT INTO leave_balances (employee_id, year, leave_type, accrued, expire_date, entity_id)
        VALUES (?, ?, 'MONTHLY', ?, ?, ?)
        ON CONFLICT(employee_id, year, leave_type) DO UPDATE SET
          accrued = excluded.accrued, expire_date = excluded.expire_date, updated_at = CURRENT_TIMESTAMP
      `).bind(emp.id, currentYear, expected, expire || null, (emp as any).entity_id || 1))

      stmts.push(c.env.DB.prepare(`
        INSERT INTO leave_accrual_logs (employee_id, year, accrual_type, days, reason, run_by, entity_id)
        VALUES (?, ?, 'MONTHLY', ?, '입사 1년 미만 월차 자동 적립', ?, ?)
      `).bind(emp.id, currentYear, delta, user?.id || null, emp.entity_id || 1))
      processed++
    }

    // 80개 청크 분할 batch (직원당 2 stmt → 청크당 ~40명, Workers subrequest 상한·D1 batch 한도 회피)
    for (let i = 0; i < stmts.length; i += 80) {
      await c.env.DB.batch(stmts.slice(i, i + 80))
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
    const today = kstNow() // B8: KST 기준(워커 UTC → +9h 벽시계)
    const currentYear = today.getUTCFullYear()

    const { results: employees } = await c.env.DB.prepare(`
      SELECT id, hire_date, entity_id FROM employees WHERE status = 'ACTIVE' AND is_deleted = 0 AND hire_date IS NOT NULL
    `).all<EmployeeHireDateRow>()

    let processed = 0
    const errors: string[] = []

    // 현재 적립값 일괄 조회(ANNUAL 버킷) — 직원별 SELECT N+1 제거 (#321)
    const accruedMap = await loadAnnualAccruedMap(c, employees.map(e => e.id), currentYear)
    const todayStr = today.toISOString().slice(0, 10) // KST(+9h) 'YYYY-MM-DD'

    // #416: 직원별 순차 INSERT 2N회(N+1 write) → stmt 누적 후 DB.batch. /grant(sick #321)와 동일 정책(all-or-nothing).
    const stmts: any[] = []
    for (const emp of employees) {
      const annual = calcAnnualEntitlement(emp.hire_date, today)
      if (annual <= 0) continue

      const currentAccrued = accruedMap.get(emp.id) || 0
      if (currentAccrued >= annual) continue

      // 연차 만료 = 직전 입사기념일 + 1년(발생일+1년)
      const hireMD = (emp.hire_date || '').slice(5)
      let annivYear = today.getUTCFullYear()
      if (hireMD && `${annivYear}-${hireMD}` > todayStr) annivYear -= 1
      const expire = hireMD ? addYears(`${annivYear}-${hireMD}`, 1) : ''

      stmts.push(c.env.DB.prepare(`
        INSERT INTO leave_balances (employee_id, year, leave_type, accrued, expire_date, entity_id)
        VALUES (?, ?, 'ANNUAL', ?, ?, ?)
        ON CONFLICT(employee_id, year, leave_type) DO UPDATE SET
          accrued = excluded.accrued, expire_date = excluded.expire_date, updated_at = CURRENT_TIMESTAMP
      `).bind(emp.id, currentYear, annual, expire || null, (emp as any).entity_id || 1))

      stmts.push(c.env.DB.prepare(`
        INSERT INTO leave_accrual_logs (employee_id, year, accrual_type, days, reason, run_by, entity_id)
        VALUES (?, ?, 'YEARLY', ?, '연간 연차 자동 부여 (근로기준법)', ?, ?)
      `).bind(emp.id, currentYear, annual - currentAccrued, user?.id || null, emp.entity_id || 1))
      processed++
    }

    // 80개 청크 분할 batch (직원당 2 stmt → 청크당 ~40명, Workers subrequest 상한·D1 batch 한도 회피)
    for (let i = 0; i < stmts.length; i += 80) {
      await c.env.DB.batch(stmts.slice(i, i + 80))
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
      INSERT INTO leave_balances (employee_id, year, leave_type, granted_extra, entity_id)
      VALUES (?, ?, 'ANNUAL', ?, ?)
      ON CONFLICT(employee_id, year, leave_type) DO UPDATE SET
        granted_extra = leave_balances.granted_extra + excluded.granted_extra,
        updated_at = CURRENT_TIMESTAMP
    `).bind(body.employee_id, body.year, body.days, getEntityId(c)).run()

    await c.env.DB.prepare(`
      INSERT INTO leave_accrual_logs (employee_id, year, accrual_type, days, reason, run_by, entity_id)
      VALUES (?, ?, 'TENURE_BONUS', ?, ?, ?, ?)
    `).bind(body.employee_id, body.year, body.days, body.reason || '별도 부여', user?.id || null, getEntityId(c)).run()

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
    const ef = entityFilter(c, 'lr')
    const clauses: string[] = []
    const params: any[] = []
    if (ef.clause) { clauses.push(ef.clause.replace(/^ AND /, '')); params.push(...ef.params) }
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

leavesRouter.post('/requests', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const user = c.get('user')
    const body = await c.req.json<{
      employee_id: number; leave_type: string; start_date: string; end_date: string;
      days?: number; reason?: string;
    }>()
    if (!body.employee_id || !body.leave_type || !body.start_date || !body.end_date) {
      return c.json({ success: false, error: 'employee_id, leave_type, start_date, end_date 필수' }, 400)
    }

    // C2/B4: 일수는 백엔드가 소정근로일(주말·공휴일 제외) 기준으로 권위적 산정(프론트 값 신뢰 안 함).
    const lt = await c.env.DB.prepare(
      `SELECT deduction_days FROM leave_types WHERE code = ?`
    ).bind(body.leave_type).first<LeaveTypeRow>()
    let days: number
    if (lt && lt.deduction_days < 1) {
      days = lt.deduction_days // 반차/반반차: 1일 내 사용(날짜 무관)
    } else {
      const workingDays = await countWorkingDays(c.env.DB, body.start_date, body.end_date)
      days = workingDays * (lt?.deduction_days ?? 1)
      if (days <= 0) {
        return c.json({ success: false, error: '선택한 기간에 소정근로일이 없습니다(주말·공휴일만 포함).' }, 400)
      }
    }

    const result = await c.env.DB.prepare(`
      INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, days, reason, status, created_by, entity_id)
      VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
    `).bind(
      body.employee_id, body.leave_type, body.start_date, body.end_date,
      days, body.reason || null, user?.id || null, getEntityId(c) || 1
    ).run()

    return c.json({ success: true, data: { id: result.meta.last_row_id, days } })
  } catch (error: any) {
    // #294: 동일 직원·유형·기간의 활성 신청이 이미 있으면 409
    if (error?.message && /UNIQUE constraint failed/i.test(error.message)) {
      return c.json({ success: false, error: '이미 동일한 휴가 신청이 존재합니다.' }, 409)
    }
    console.error('leaves request create error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.', detail: '서버 오류가 발생했습니다' }, 500)
  }
})

leavesRouter.patch('/requests/:id/approve', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const user = c.get('user')
    const id = Number(c.req.param('id'))

    // #356: 타법인 휴가신청 승인 차단 + 차감은 신청 행의 entity로 귀속
    const ef = entityFilter(c, '')
    const req = await c.env.DB.prepare(
      `SELECT id, employee_id, leave_type, start_date, end_date, days, reason, status, approved_by, approved_at, rejection_reason, entity_id FROM leave_requests WHERE id = ?${ef.clause}`
    ).bind(id, ...ef.params).first<LeaveRequestRow & { entity_id: number }>()
    if (!req) return c.json({ success: false, error: '신청을 찾을 수 없습니다.' }, 404)
    if (req.status !== 'PENDING') return c.json({ success: false, error: '이미 처리된 신청입니다.' }, 400)
    const reqEntityId = req.entity_id || getEntityId(c)

    // 차감 대상 판별: leave_types 카테고리 + 반차/반반차 코드
    const lt = await c.env.DB.prepare(
      `SELECT category, deduction_days FROM leave_types WHERE code = ?`
    ).bind(req.leave_type).first<LeaveTypeWithCategoryRow>()

    const year = new Date(req.start_date).getFullYear()
    const isAnnual = lt?.category === 'ANNUAL' || req.leave_type === 'ANNUAL' ||
      ['HALF_AM', 'HALF_PM', 'QUARTER_1', 'QUARTER_2', 'QUARTER_3', 'QUARTER_4'].includes(req.leave_type)
    const isSick = !isAnnual && (lt?.category === 'SICK' || req.leave_type === 'SICK')
    // 차감 대상: 연차계열=ANNUAL, 병가=SICK. 경조(FAMILY)는 차감 없음(규정 일수만큼 유급).
    const deductType = isAnnual ? 'ANNUAL' : (isSick ? 'SICK' : null)

    // B2+병존: 잔여 검증 — 연차=ANNUAL+MONTHLY 합산-소멸, 병가=SICK. 부족 시 승인 거부(음수 방지).
    if (deductType) {
      let remaining: number
      if (deductType === 'ANNUAL') {
        remaining = await annualRemaining(c.env.DB, req.employee_id, year)
      } else {
        const bal = await c.env.DB.prepare(
          `SELECT COALESCE(accrued,0)+COALESCE(granted_extra,0)+COALESCE(carried_over,0)-COALESCE(used,0)-COALESCE(expired,0) AS remaining
           FROM leave_balances WHERE employee_id = ? AND year = ? AND leave_type = 'SICK'`
        ).bind(req.employee_id, year).first<{ remaining: number }>()
        remaining = Number(bal?.remaining ?? 0)
      }
      if (remaining < req.days) {
        return c.json({ success: false, error: `잔여 ${deductType === 'SICK' ? '병가' : '연차'} 부족: 잔여 ${remaining}일 < 신청 ${req.days}일. 먼저 부여(특별 부여/적립)하세요.` }, 400)
      }
    }

    // B7+병존: 잔여 차감(연차 FIFO MONTHLY→ANNUAL) + 상태 변경 원자적 batch.
    const stmts: D1PreparedStatement[] = []
    if (deductType) {
      const deductStmts = await buildDeductStmts(c.env.DB, req.employee_id, year, deductType, req.days, reqEntityId)
      stmts.push(...deductStmts)
    }
    stmts.push(c.env.DB.prepare(`
      UPDATE leave_requests SET status = 'APPROVED', approved_by = ?, approved_at = CURRENT_TIMESTAMP WHERE id = ?${ef.clause}
    `).bind(user?.id || null, id, ...ef.params))
    await c.env.DB.batch(stmts)

    // 큐06: 승인된 휴가를 근태에 마킹(날짜별) — 반차 지각 오판정 방지. 베스트에포트(실패해도 승인은 유지).
    try {
      await markLeaveAttendance(c.env.DB, {
        employeeId: req.employee_id, leaveType: req.leave_type,
        startDate: req.start_date, endDate: req.end_date, entityId: reqEntityId
      })
    } catch (e) {
      console.warn('[leaves] markLeaveAttendance failed (승인은 유지):', e)
    }

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
    const ef = entityFilter(c, '')

    // 큐06: 롤백 대비 — 요청의 직원/기간 확보(반려는 PENDING만이라 마킹은 보통 없으나, 방어적 정리)
    const rj = await c.env.DB.prepare(
      `SELECT employee_id, start_date, end_date FROM leave_requests WHERE id = ?${ef.clause}`
    ).bind(id, ...ef.params).first<{ employee_id: number; start_date: string; end_date: string }>()

    await c.env.DB.prepare(`
      UPDATE leave_requests SET status = 'REJECTED', approved_by = ?, approved_at = CURRENT_TIMESTAMP, rejection_reason = ?
      WHERE id = ? AND status = 'PENDING'${ef.clause}
    `).bind(user?.id || null, body.reason || null, id, ...ef.params).run()

    if (rj) {
      try { await clearLeaveAttendance(c.env.DB, { employeeId: rj.employee_id, startDate: rj.start_date, endDate: rj.end_date }) }
      catch (e) { console.warn('[leaves] clearLeaveAttendance (reject) failed:', e) }
    }

    return c.json({ success: true })
  } catch (error: any) {
    console.error('leaves reject error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.', detail: '서버 오류가 발생했습니다' }, 500)
  }
})

// 신청 취소 (PENDING만)
leavesRouter.delete('/requests/:id', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = Number(c.req.param('id'))
    const ef = entityFilter(c, '')
    // 큐06: 롤백 대비 — 삭제 전 직원/기간 확보(취소 시 휴가 마킹 정리)
    const dr = await c.env.DB.prepare(
      `SELECT employee_id, start_date, end_date FROM leave_requests WHERE id = ?${ef.clause}`
    ).bind(id, ...ef.params).first<{ employee_id: number; start_date: string; end_date: string }>()
    await c.env.DB.prepare(
      `DELETE FROM leave_requests WHERE id = ? AND status = 'PENDING'${ef.clause}`
    ).bind(id, ...ef.params).run()
    if (dr) {
      try { await clearLeaveAttendance(c.env.DB, { employeeId: dr.employee_id, startDate: dr.start_date, endDate: dr.end_date }) }
      catch (e) { console.warn('[leaves] clearLeaveAttendance (delete) failed:', e) }
    }
    return c.json({ success: true })
  } catch (error: any) {
    console.error('leaves cancel error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.', detail: '서버 오류가 발생했습니다' }, 500)
  }
})

// B5: 승인된 휴가 취소 — 잔여 복원 + 근태 마킹 해제(오승인/사용철회 정정).
leavesRouter.patch('/requests/:id/cancel-approved', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const user = c.get('user')
    const id = Number(c.req.param('id'))
    const ef = entityFilter(c, '')
    const req = await c.env.DB.prepare(
      `SELECT id, employee_id, leave_type, start_date, end_date, days, status, entity_id FROM leave_requests WHERE id = ?${ef.clause}`
    ).bind(id, ...ef.params).first<LeaveRequestRow & { entity_id: number }>()
    if (!req) return c.json({ success: false, error: '신청을 찾을 수 없습니다.' }, 404)
    if (req.status !== 'APPROVED') return c.json({ success: false, error: '승인된 신청만 취소할 수 있습니다.' }, 400)

    // 차감 대상 판별(approve와 동일 규칙)
    const lt = await c.env.DB.prepare(
      `SELECT category, deduction_days FROM leave_types WHERE code = ?`
    ).bind(req.leave_type).first<LeaveTypeWithCategoryRow>()
    const isAnnual = lt?.category === 'ANNUAL' || req.leave_type === 'ANNUAL' ||
      ['HALF_AM', 'HALF_PM', 'QUARTER_1', 'QUARTER_2', 'QUARTER_3', 'QUARTER_4'].includes(req.leave_type)
    const isSick = !isAnnual && (lt?.category === 'SICK' || req.leave_type === 'SICK')
    const deductType = isAnnual ? 'ANNUAL' : (isSick ? 'SICK' : null)
    const year = new Date(req.start_date).getFullYear()

    // 잔여 복원(병존 역FIFO: ANNUAL→MONTHLY, 병가=SICK) + 상태 변경을 원자적으로.
    const stmts: D1PreparedStatement[] = []
    if (deductType) {
      const restoreStmts = await buildRestoreStmts(c.env.DB, req.employee_id, year, deductType, req.days)
      stmts.push(...restoreStmts)
    }
    stmts.push(c.env.DB.prepare(`
      UPDATE leave_requests SET status = 'CANCELLED', approved_by = ?, approved_at = CURRENT_TIMESTAMP WHERE id = ?${ef.clause}
    `).bind(user?.id || null, id, ...ef.params))
    await c.env.DB.batch(stmts)

    // 근태 마킹 해제(실출근 기록 있던 날은 NORMAL 복원). 베스트에포트.
    try {
      await clearLeaveAttendance(c.env.DB, { employeeId: req.employee_id, startDate: req.start_date, endDate: req.end_date })
    } catch (e) {
      console.warn('[leaves] clearLeaveAttendance (cancel-approved) failed:', e)
    }

    return c.json({ success: true })
  } catch (error: any) {
    console.error('leaves cancel-approved error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.', detail: '서버 오류가 발생했습니다' }, 500)
  }
})

// ============================================================================
// 사용촉진 (근로기준법 제61조) — 입사일 기준 1·2차 통지 + 소멸
// ============================================================================

// 통지 대상 산정/발송. dryRun=true(기본)=미리보기, false=실발송.
//   채널=이메일(법적 '서면' 유효, email_logs 도달 기록). 알림톡(sendATS)은 바로빌 템플릿 승인 후 추가.
leavesRouter.post('/promotion/run', requireRole('ADMIN'), async (c) => {
  try {
    const user = c.get('user')
    const body = await c.req.json<{ source?: string; stage?: string; dryRun?: boolean }>().catch(() => ({} as { source?: string; stage?: string; dryRun?: boolean }))
    const source = body.source as PromoSource
    const stage = body.stage as 'FIRST' | 'SECOND'
    if (!['ANNUAL', 'MONTHLY_A', 'MONTHLY_B'].includes(source) || !['FIRST', 'SECOND'].includes(stage)) {
      return c.json({ success: false, error: 'source(ANNUAL|MONTHLY_A|MONTHLY_B)·stage(FIRST|SECOND) 필수' }, 400)
    }
    const dryRun = body.dryRun !== false
    const today = kstNow()
    const todayStr = today.toISOString().slice(0, 10)
    const fy = today.getUTCFullYear()
    const bucket: 'ANNUAL' | 'MONTHLY' = source === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY'

    const ef = entityFilter(c, 'e')
    const { results: emps } = await c.env.DB.prepare(
      `SELECT e.id, e.name, e.email, e.mobile, e.phone, e.hire_date, e.department, e.entity_id FROM employees e
       WHERE e.status='ACTIVE' AND e.is_deleted=0 AND e.hire_date IS NOT NULL${ef.clause}`
    ).bind(...ef.params).all<{ id: number; name: string; email: string | null; mobile: string | null; phone: string | null; hire_date: string; department: string | null; entity_id: number }>()

    const eligible: Array<{ employee_id: number; name: string; email: string | null; department: string | null; entity_id: number; remaining: number; expire_base: string }> = []
    for (const e of emps) {
      const w = promotionWindow(e.hire_date, source, todayStr)
      if (!w) continue
      const inWindow = stage === 'FIRST'
        ? (todayStr >= w.firstStart && todayStr <= w.firstEnd)
        : (todayStr > w.firstEnd && todayStr <= w.secondEnd)
      if (!inWindow) continue
      const rem = await bucketRemaining(c.env.DB, e.id, bucket)
      if (rem <= 0) continue
      const dup = await c.env.DB.prepare(
        `SELECT id FROM leave_promotion_notices WHERE employee_id=? AND fiscal_year=? AND source=? AND stage=? AND status='SENT'`
      ).bind(e.id, fy, source, stage).first()
      if (dup) continue
      eligible.push({ employee_id: e.id, name: e.name, email: e.email, department: e.department, entity_id: e.entity_id || 1, remaining: rem, expire_base: w.base })
    }

    if (dryRun) {
      return c.json({ success: true, dryRun: true, source, stage, count: eligible.length, eligible })
    }

    // 실발송: 이메일(서면) + leave_promotion_notices 기록(grant_id=NULL — 옵션B)
    let sent = 0, failed = 0, noContact = 0
    const stageLabel = stage === 'FIRST' ? '1차(사용시기 지정 요청)' : '2차(사용시기 지정 통보)'
    for (const t of eligible) {
      const subject = `[법정 연차사용촉진 ${stageLabel}] 미사용 연차 안내`
      const html = `<div style="font-family:sans-serif;font-size:14px;color:#222">`
        + `<p>${t.name}님,</p>`
        + `<p>근로기준법 제61조에 따라 미사용 연차 사용을 촉진합니다.</p>`
        + `<ul><li>미사용 연차: <b>${t.remaining}일</b></li><li>소멸 예정일: <b>${t.expire_base}</b></li></ul>`
        + (stage === 'FIRST'
          ? `<p>위 미사용 연차의 <b>사용 시기를 지정</b>하여 회신해 주시기 바랍니다(통지 도달일로부터 10일 이내).</p>`
          : `<p>회신이 없어 회사가 사용 시기를 지정해 통보합니다. 지정일에 휴가를 사용하시기 바랍니다.</p>`)
        + `<p style="color:#888;font-size:12px">본 통지는 법정 사용촉진 서면 통지입니다. (자동 발송)</p></div>`
      let channel = 'NONE', status = 'FAILED', ref: string | null = null
      if (t.email) {
        const r = await sendEmail(c.env, c.env.DB, { to: t.email, subject, html },
          { template: `LEAVE_PROMOTION_${stage}`, relatedType: 'leave_promotion', relatedId: t.employee_id, sentBy: user?.id, entityId: t.entity_id })
        channel = 'EMAIL'; status = r.success ? 'SENT' : 'FAILED'; ref = (r.id || r.error || '').slice(0, 200) || null
        if (r.success) sent++; else failed++
      } else {
        noContact++ // 이메일 없음 — 수동 통지 필요
      }
      // 재시도 허용: 기존 비-SENT 동일키 제거 후 기록
      await c.env.DB.prepare(
        `DELETE FROM leave_promotion_notices WHERE employee_id=? AND fiscal_year=? AND source=? AND stage=? AND status<>'SENT'`
      ).bind(t.employee_id, fy, source, stage).run()
      await c.env.DB.prepare(`
        INSERT INTO leave_promotion_notices (employee_id, entity_id, fiscal_year, source, stage, remaining_days, notice_date, delivered_at, channel, message_ref, status, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(t.employee_id, t.entity_id, fy, source, stage, t.remaining, todayStr, status === 'SENT' ? todayStr : null, channel, ref, status, user?.id || null).run()
    }
    return c.json({ success: true, source, stage, total: eligible.length, sent, failed, noContact })
  } catch (error: any) {
    console.error('leaves promotion run error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.', detail: '서버 오류가 발생했습니다' }, 500)
  }
})

// 통지 이력 조회
leavesRouter.get('/promotion', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const year = Number(c.req.query('year') || kstNow().getUTCFullYear())
    const ef = entityFilter(c, 'pn')
    const { results } = await c.env.DB.prepare(`
      SELECT pn.id, pn.employee_id, e.name AS employee_name, e.department, pn.fiscal_year, pn.source, pn.stage,
             pn.remaining_days, pn.notice_date, pn.delivered_at, pn.channel, pn.status
      FROM leave_promotion_notices pn LEFT JOIN employees e ON e.id = pn.employee_id
      WHERE pn.fiscal_year = ?${ef.clause}
      ORDER BY pn.notice_date DESC, pn.id DESC
    `).bind(year, ...ef.params).all()
    return c.json({ success: true, data: results })
  } catch (error: any) {
    console.error('leaves promotion list error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// 소멸 sweep — 만료 경과 + 촉진 적법(2차 통지 존재) 잔여를 소멸. dryRun 기본(미리보기).
//   미이행분은 소멸 제외(수당 산정 유지). commit은 관리자 검토(노무수령거부 이행 포함) 후 실행.
leavesRouter.post('/expire', requireRole('ADMIN'), async (c) => {
  try {
    const user = c.get('user')
    const body = await c.req.json<{ dryRun?: boolean }>().catch(() => ({} as { dryRun?: boolean }))
    const dryRun = body.dryRun !== false
    const todayStr = kstNow().toISOString().slice(0, 10)
    const ef = entityFilter(c, 'lb')
    const { results: rows } = await c.env.DB.prepare(`
      SELECT lb.id, lb.employee_id, lb.year, lb.leave_type, lb.expire_date, lb.entity_id, e.name AS employee_name,
             (lb.accrued+lb.granted_extra+lb.carried_over-lb.used-lb.expired) AS remaining
      FROM leave_balances lb JOIN employees e ON e.id = lb.employee_id
      WHERE lb.leave_type IN ('ANNUAL','MONTHLY') AND lb.expire_date IS NOT NULL AND lb.expire_date < ?
        AND (lb.accrued+lb.granted_extra+lb.carried_over-lb.used-lb.expired) > 0${ef.clause}
    `).bind(todayStr, ...ef.params).all<{ id: number; employee_id: number; year: number; leave_type: string; expire_date: string; entity_id: number; employee_name: string; remaining: number }>()

    const candidates: Array<{ id: number; employee_id: number; employee_name: string; year: number; leave_type: string; expire_date: string; entity_id: number; remaining: number; lawful: boolean }> = []
    for (const r of rows) {
      const sources = r.leave_type === 'ANNUAL' ? ['ANNUAL'] : ['MONTHLY_A', 'MONTHLY_B']
      const ph = sources.map(() => '?').join(',')
      const promo = await c.env.DB.prepare(
        `SELECT COUNT(*) AS cnt FROM leave_promotion_notices WHERE employee_id=? AND stage='SECOND' AND status='SENT' AND source IN (${ph})`
      ).bind(r.employee_id, ...sources).first<{ cnt: number }>()
      candidates.push({ ...r, lawful: Number(promo?.cnt || 0) > 0 })
    }

    if (dryRun) {
      return c.json({ success: true, dryRun: true, total: candidates.length, lawful: candidates.filter(x => x.lawful).length, candidates })
    }

    let expired = 0
    const stmts: D1PreparedStatement[] = []
    for (const r of candidates) {
      if (!r.lawful) continue // 촉진 미이행 → 소멸 제외(수당 산정 유지)
      stmts.push(c.env.DB.prepare(`UPDATE leave_balances SET expired = expired + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(r.remaining, r.id))
      stmts.push(c.env.DB.prepare(`
        INSERT INTO leave_accrual_logs (employee_id, year, accrual_type, days, reason, run_by, entity_id)
        VALUES (?, ?, 'EXPIRE', ?, ?, ?, ?)
      `).bind(r.employee_id, r.year, -r.remaining, `사용촉진 적법 소멸 (${r.leave_type}, 만료 ${r.expire_date})`, user?.id || null, r.entity_id || 1))
      expired++
    }
    for (let i = 0; i < stmts.length; i += 80) await c.env.DB.batch(stmts.slice(i, i + 80))
    return c.json({ success: true, total: candidates.length, expired, skipped_unlawful: candidates.length - expired })
  } catch (error: any) {
    console.error('leaves expire error:', error)
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
      SELECT id, code, name, category, deduction_days, time_from, time_to, is_paid, is_active, sort_order, created_at, updated_at FROM leave_types WHERE is_active = 1 ORDER BY sort_order, id
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
      SELECT id, event_name, paid_days, is_active, sort_order, created_at FROM family_event_rules WHERE is_active = 1 ORDER BY sort_order, id
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
        `SELECT id FROM employees WHERE status = 'ACTIVE' AND is_deleted = 0`
      ).all<EmployeeIdRow>()
      targetIds = results.map(r => r.id)
    }

    // 직원별 entity_id 조회 — 단일 IN 쿼리 1회 (N+1 제거, #321)
    const empEntityMap = new Map<number, number>()
    if (targetIds.length > 0) {
      const placeholders = targetIds.map(() => '?').join(',')
      const { results: empRows } = await c.env.DB.prepare(
        `SELECT id, entity_id FROM employees WHERE id IN (${placeholders})`
      ).bind(...targetIds).all<{ id: number; entity_id: number }>()
      for (const row of empRows) empEntityMap.set(row.id, row.entity_id || 1)
    }

    // INSERT는 batch 1회로 묶음 (per-row try/catch 없음 → 기존 all-or-nothing 동작 유지, #321)
    const sickStmts = targetIds.map(empId =>
      c.env.DB.prepare(`
        INSERT INTO leave_balances (employee_id, year, leave_type, accrued, notes, entity_id)
        VALUES (?, ?, 'SICK', ?, ?, ?)
        ON CONFLICT(employee_id, year, leave_type) DO UPDATE SET
          accrued = excluded.accrued,
          notes = excluded.notes,
          updated_at = CURRENT_TIMESTAMP
      `).bind(empId, year, days, notes || `유급병가 ${days}일 부여`, empEntityMap.get(empId) || 1)
    )
    if (sickStmts.length > 0) await c.env.DB.batch(sickStmts)
    const processed = sickStmts.length

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
    const department = c.req.query('department') || '' // #346: 부서 필터
    const deptClause = department ? ' AND e.department = ?' : ''
    const deptParams = department ? [department] : []
    const ef = entityFilter(c, 'e') // #IDOR: 타 법인 직원 급여/연차 PII 노출 차단(/balances와 동일 격리)

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
        e.position_allowance,
        e.overtime_daily_hours,
        e.overtime_work_days,
        (COALESCE(lb.accrued, 0) + COALESCE(lb.granted_extra, 0) + COALESCE(lb.carried_over, 0)) as total_annual,
        COALESCE(lb.used, 0) as used_annual,
        (COALESCE(lb.accrued, 0) + COALESCE(lb.granted_extra, 0) + COALESCE(lb.carried_over, 0) - COALESCE(lb.used, 0) - COALESCE(lb.expired, 0)) as remaining_annual,
        COALESCE(sick.accrued, 0) as sick_total,
        COALESCE(sick.used, 0) as sick_used,
        (COALESCE(sick.accrued, 0) - COALESCE(sick.used, 0)) as sick_remaining
      FROM employees e
      LEFT JOIN (
        SELECT employee_id, SUM(accrued) accrued, SUM(granted_extra) granted_extra,
               SUM(used) used, SUM(carried_over) carried_over, SUM(expired) expired
        FROM leave_balances WHERE year = ? AND leave_type IN ('ANNUAL','MONTHLY')
        GROUP BY employee_id
      ) lb ON lb.employee_id = e.id
      LEFT JOIN leave_balances sick
        ON sick.employee_id = e.id AND sick.year = ? AND sick.leave_type = 'SICK'
      WHERE e.status = 'ACTIVE' AND e.is_deleted = 0${deptClause}${ef.clause}
      ORDER BY e.department, e.name
    `).bind(year, year, ...deptParams, ...ef.params).all<BalanceRow>()

    // C1: 미사용 연차수당 = 1일 통상임금 × 잔여. 통상임금 = 기본급(통상분) + 직책수당(D3 결정).
    //  - 포괄임금(고정연장>0) 직원: base_salary=포괄총액 → calcInclusivePay로 통상분(regular_base) 분해(payroll와 동일).
    //  - 일반 직원: base_salary가 곧 기본급(통상분).
    //  통상시급 = (통상분 + 직책수당) / 월소정근로시간, 1일 통상임금 = ×8.
    const ot = await loadOvertimeSettings(c.env.DB)
    const baseHours = ot.monthlyWorkHours || 209
    const data = results.map(r => {
      const remaining = Math.max(0, r.remaining_annual || 0)
      const positionAllow = Number(r.position_allowance || 0)
      const fixedOTHours = (Number(r.overtime_daily_hours) || 0) * (Number(r.overtime_work_days) || 22)
      let regularBase = Number(r.base_salary || 0)
      if (fixedOTHours > 0 && regularBase > 0) {
        const inc = calcInclusivePay({
          inclusiveBase: regularBase, baseMonthlyHours: baseHours,
          fixedOTHours, extraOTHours: 0, nightHours: 0, holidayHours: 0,
          overtimeMul: ot.overtimeMul, nightMul: ot.nightMul, holidayMul: ot.holidayMul, holidayOverMul: ot.holidayOverMul,
        })
        regularBase = inc.regular_base
      }
      const ordinaryMonthly = regularBase + positionAllow
      const hourlyRate = ordinaryMonthly > 0 ? Math.round(ordinaryMonthly / baseHours) : 0
      const dailyRate = hourlyRate * 8
      const unusedAllowance = dailyRate * remaining
      return {
        ...r,
        hourly_rate: hourlyRate,
        daily_rate: dailyRate,
        unused_allowance: unusedAllowance
      }
    })

    // #346: 프론트(leaves.js)가 d.employees·d.total_unused_allowance 형태를 기대 — 정합 수정
    const totalUnused = data.reduce((s, r) => s + (r.unused_allowance || 0), 0)
    return c.json({ success: true, data: { employees: data, total_unused_allowance: totalUnused } })
  } catch (error) {
    console.error('src/routes/leaves.ts unused-allowance error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

export default leavesRouter
