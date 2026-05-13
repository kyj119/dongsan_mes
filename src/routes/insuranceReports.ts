import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'

const insuranceReportsRouter = new Hono<HonoEnv>()

insuranceReportsRouter.use('*', authMiddleware)
insuranceReportsRouter.use('*', requireRole('ADMIN', 'MANAGER'))

// ============================================================================
// GET /api/insurance-reports?year=&month=
// 신고서 목록 조회
// ============================================================================
insuranceReportsRouter.get('/', async (c) => {
  try {
    const year = Number(c.req.query('year') || new Date().getFullYear())
    const month = c.req.query('month')

    let sql = `SELECT id, year, month, report_type, status, employee_count, total_national_pension, total_health_insurance, total_long_term_care, total_employment_insurance, total_industrial_accident, employer_national_pension, employer_health_insurance, employer_long_term_care, employer_employment_insurance, grand_total_employee, grand_total_employer, grand_total, submitted_at, confirmed_by, confirmed_at, created_at, updated_at FROM insurance_reports WHERE year = ?`
    const params: any[] = [year]

    if (month) {
      sql += ` AND month = ?`
      params.push(Number(month))
    }
    sql += ` ORDER BY month DESC, report_type`

    const rows = await c.env.DB.prepare(sql).bind(...params).all()
    return c.json({ success: true, data: rows.results || [] })
  } catch (err: any) {
    console.error('Insurance reports GET error:', err)
    return c.json({ success: false, error: '조회 실패', detail: '서버 오류가 발생했습니다' }, 500)
  }
})

// ============================================================================
// GET /api/insurance-reports/annual-summary?year=
// 연간 4대보험 요약 (월별 집계)
// ⚠️ /:id 보다 먼저 등록해야 'annual-summary'가 :id에 매칭되지 않음
// ============================================================================
insuranceReportsRouter.get('/annual-summary', async (c) => {
  try {
    const year = Number(c.req.query('year') || new Date().getFullYear())
    const rows = await c.env.DB.prepare(
      `SELECT month, employee_count, grand_total_employee, grand_total_employer, grand_total, status
       FROM insurance_reports
       WHERE year = ? AND report_type = 'MONTHLY'
       ORDER BY month`
    ).bind(year).all()
    return c.json({ success: true, data: rows.results || [] })
  } catch (err: any) {
    console.error('Insurance reports annual-summary error:', err)
    return c.json({ success: false, error: '조회 실패', detail: '서버 오류가 발생했습니다' }, 500)
  }
})

// ============================================================================
// GET /api/insurance-reports/:id
// 신고서 상세 (직원별 내역 포함)
// ============================================================================
insuranceReportsRouter.get('/:id', async (c) => {
  try {
    const id = Number(c.req.param('id'))
    const report = await c.env.DB.prepare(`SELECT id, year, month, report_type, status, employee_count, total_national_pension, total_health_insurance, total_long_term_care, total_employment_insurance, total_industrial_accident, employer_national_pension, employer_health_insurance, employer_long_term_care, employer_employment_insurance, grand_total_employee, grand_total_employer, grand_total, submitted_at, confirmed_by, confirmed_at, created_at, updated_at FROM insurance_reports WHERE id = ?`).bind(id).first<any>()
    if (!report) return c.json({ success: false, error: '신고서 없음' }, 404)

    const details = await c.env.DB.prepare(
      `SELECT id, report_id, employee_id, employee_name, rrn, base_salary, national_pension, health_insurance, long_term_care, employment_insurance, employer_national_pension, employer_health_insurance, employer_long_term_care, employer_employment_insurance, employer_industrial_accident FROM insurance_report_details WHERE report_id = ? ORDER BY employee_name`
    ).bind(id).all()

    return c.json({ success: true, data: { report, details: details.results || [] } })
  } catch (err: any) {
    console.error('Insurance reports GET :id error:', err)
    return c.json({ success: false, error: '조회 실패', detail: '서버 오류가 발생했습니다' }, 500)
  }
})

// ============================================================================
// POST /api/insurance-reports/generate
// body: { year, month }
// 급여 데이터 기반으로 월별 4대보험 신고서 자동 생성
// ============================================================================
insuranceReportsRouter.post('/generate', async (c) => {
  try {
    const body = await c.req.json<any>()
    const year = Number(body.year || new Date().getFullYear())
    const month = Number(body.month)
    if (!month || month < 1 || month > 12) return c.json({ success: false, error: '월(1~12) 필수' }, 400)

    const payPeriod = `${year}-${String(month).padStart(2, '0')}`

    // 해당 월 급여 데이터 조회 (PAID/APPROVED/PENDING)
    const payrolls = await c.env.DB.prepare(
      `SELECT p.employee_id, p.base_salary, p.taxable_pay,
              p.national_pension, p.health_insurance, p.long_term_care_insurance,
              p.employment_insurance,
              COALESCE(p.employer_national_pension, p.national_pension) as employer_np,
              COALESCE(p.employer_health_insurance, p.health_insurance) as employer_hi,
              COALESCE(p.employer_long_term_care, p.long_term_care_insurance) as employer_ltc,
              COALESCE(p.employer_employment_insurance, 0) as employer_ei,
              COALESCE(p.employer_industrial_accident, 0) as employer_ia,
              e.name, e.rrn, e.employee_code
       FROM payroll p
       JOIN employees e ON p.employee_id = e.id
       WHERE p.pay_period = ?
       AND p.status IN ('PAID', 'APPROVED', 'PENDING')
       ORDER BY e.name`
    ).bind(payPeriod).all()

    const rows = payrolls.results || []
    if (!rows.length) return c.json({ success: false, error: `${payPeriod} 급여 데이터가 없습니다` }, 400)

    // 기존 MONTHLY 신고서가 있으면 삭제 후 재생성
    const existing = await c.env.DB.prepare(
      `SELECT id FROM insurance_reports WHERE year = ? AND month = ? AND report_type = 'MONTHLY'`
    ).bind(year, month).first<any>()

    if (existing) {
      await c.env.DB.prepare(`DELETE FROM insurance_report_details WHERE report_id = ?`).bind(existing.id).run()
      await c.env.DB.prepare(`DELETE FROM insurance_reports WHERE id = ?`).bind(existing.id).run()
    }

    // 합계 계산
    let totals = {
      np: 0, hi: 0, ltc: 0, ei: 0,
      enp: 0, ehi: 0, eltc: 0, eei: 0, eia: 0
    }

    rows.forEach((r: any) => {
      totals.np += Number(r.national_pension || 0)
      totals.hi += Number(r.health_insurance || 0)
      totals.ltc += Number(r.long_term_care_insurance || 0)
      totals.ei += Number(r.employment_insurance || 0)
      totals.enp += Number(r.employer_np || 0)
      totals.ehi += Number(r.employer_hi || 0)
      totals.eltc += Number(r.employer_ltc || 0)
      totals.eei += Number(r.employer_ei || 0)
      totals.eia += Number(r.employer_ia || 0)
    })

    const grandEmployee = totals.np + totals.hi + totals.ltc + totals.ei
    const grandEmployer = totals.enp + totals.ehi + totals.eltc + totals.eei + totals.eia
    const now = new Date().toISOString()

    // 마스터 INSERT
    const ins = await c.env.DB.prepare(
      `INSERT INTO insurance_reports (
        year, month, report_type, status, employee_count,
        total_national_pension, total_health_insurance, total_long_term_care,
        total_employment_insurance, total_industrial_accident,
        employer_national_pension, employer_health_insurance, employer_long_term_care,
        employer_employment_insurance,
        grand_total_employee, grand_total_employer, grand_total,
        created_at, updated_at
      ) VALUES (?, ?, 'MONTHLY', 'DRAFT', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      year, month, rows.length,
      totals.np, totals.hi, totals.ltc, totals.ei, totals.eia,
      totals.enp, totals.ehi, totals.eltc, totals.eei,
      grandEmployee, grandEmployer, grandEmployee + grandEmployer,
      now, now
    ).run()

    const reportId = Number(ins.meta?.last_row_id || 0)

    // 직원별 상세 INSERT
    for (const r of rows as any[]) {
      await c.env.DB.prepare(
        `INSERT INTO insurance_report_details (
          report_id, employee_id, employee_name, rrn, base_salary,
          national_pension, health_insurance, long_term_care, employment_insurance,
          employer_national_pension, employer_health_insurance, employer_long_term_care,
          employer_employment_insurance, employer_industrial_accident
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        reportId, r.employee_id, r.name, r.rrn || '', Number(r.base_salary || 0),
        Number(r.national_pension || 0), Number(r.health_insurance || 0),
        Number(r.long_term_care_insurance || 0), Number(r.employment_insurance || 0),
        Number(r.employer_np || 0), Number(r.employer_hi || 0),
        Number(r.employer_ltc || 0), Number(r.employer_ei || 0), Number(r.employer_ia || 0)
      ).run()
    }

    return c.json({
      success: true,
      data: {
        report_id: reportId,
        employee_count: rows.length,
        grand_total_employee: grandEmployee,
        grand_total_employer: grandEmployer,
        grand_total: grandEmployee + grandEmployer,
      }
    })
  } catch (err: any) {
    console.error('Insurance reports generate error:', err)
    return c.json({ success: false, error: '생성 실패', detail: '서버 오류가 발생했습니다' }, 500)
  }
})

// ============================================================================
// PUT /api/insurance-reports/:id/submit
// 신고서 제출 완료 상태로 변경
// ============================================================================
insuranceReportsRouter.put('/:id/submit', async (c) => {
  try {
    const id = Number(c.req.param('id'))
    const now = new Date().toISOString()
    await c.env.DB.prepare(
      `UPDATE insurance_reports SET status = 'SUBMITTED', submitted_at = ?, updated_at = ? WHERE id = ?`
    ).bind(now, now, id).run()
    return c.json({ success: true })
  } catch (err: any) {
    console.error('Insurance reports submit error:', err)
    return c.json({ success: false, error: '상태 변경 실패', detail: '서버 오류가 발생했습니다' }, 500)
  }
})

// ============================================================================
// PUT /api/insurance-reports/:id/confirm
// 신고서 확정
// ============================================================================
insuranceReportsRouter.put('/:id/confirm', async (c) => {
  try {
    const id = Number(c.req.param('id'))
    const user = c.get('user')
    const now = new Date().toISOString()
    await c.env.DB.prepare(
      `UPDATE insurance_reports SET status = 'CONFIRMED', confirmed_by = ?, confirmed_at = ?, updated_at = ? WHERE id = ?`
    ).bind(user?.id || null, now, now, id).run()
    return c.json({ success: true })
  } catch (err: any) {
    console.error('Insurance reports confirm error:', err)
    return c.json({ success: false, error: '확정 실패', detail: '서버 오류가 발생했습니다' }, 500)
  }
})

export { insuranceReportsRouter }
