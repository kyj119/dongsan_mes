/**
 * payroll/year-end.ts — 연말정산 (D)
 * 2026-04-15 분할
 */
import { Hono } from 'hono'
import type { HonoEnv } from '../../types/env'
import { authMiddleware, requireRole } from '../../middleware/auth'

const yearEndRouter = new Hono<HonoEnv>()
yearEndRouter.use('/*', authMiddleware)

// 연말정산 전용 헬퍼 (원본 1554~1589)
// ── 연말정산 계산 헬퍼 ──

// 근로소득공제 (2026년 세법 기준)
function calcEarnedIncomeDeduction(grossTaxable: number): number {
  if (grossTaxable <= 5000000) return Math.floor(grossTaxable * 0.7)
  if (grossTaxable <= 15000000) return 3500000 + Math.floor((grossTaxable - 5000000) * 0.4)
  if (grossTaxable <= 45000000) return 7500000 + Math.floor((grossTaxable - 15000000) * 0.15)
  if (grossTaxable <= 100000000) return 12000000 + Math.floor((grossTaxable - 45000000) * 0.05)
  return Math.min(14750000 + Math.floor((grossTaxable - 100000000) * 0.02), 20000000)
}

// 종합소득세 세율표 (2026년 기준)
function calcIncomeTax(taxableIncome: number): number {
  if (taxableIncome <= 14000000) return Math.floor(taxableIncome * 0.06)
  if (taxableIncome <= 50000000) return 840000 + Math.floor((taxableIncome - 14000000) * 0.15)
  if (taxableIncome <= 88000000) return 6240000 + Math.floor((taxableIncome - 50000000) * 0.24)
  if (taxableIncome <= 150000000) return 15360000 + Math.floor((taxableIncome - 88000000) * 0.35)
  if (taxableIncome <= 300000000) return 37060000 + Math.floor((taxableIncome - 150000000) * 0.38)
  if (taxableIncome <= 500000000) return 94060000 + Math.floor((taxableIncome - 300000000) * 0.40)
  if (taxableIncome <= 1000000000) return 174060000 + Math.floor((taxableIncome - 500000000) * 0.42)
  return 384060000 + Math.floor((taxableIncome - 1000000000) * 0.45)
}

// 근로소득세액공제
function calcEarnedTaxCredit(calculatedTax: number, grossTaxable: number): number {
  let credit: number
  if (calculatedTax <= 1300000) {
    credit = Math.floor(calculatedTax * 0.55)
  } else {
    credit = 715000 + Math.floor((calculatedTax - 1300000) * 0.30)
  }
  // 한도
  if (grossTaxable <= 33000000) return Math.min(credit, 740000)
  if (grossTaxable <= 70000000) return Math.min(credit, 660000)
  return Math.min(credit, 500000)
}

// 연말정산 라우트 (원본 1214~1552)
yearEndRouter.get('/year-end/:employeeId', async (c) => {
  try {
    const employeeId = Number(c.req.param('employeeId'))
    const year = Number(c.req.query('year') || new Date().getFullYear())
    if (!employeeId) return c.json({ success: false, error: 'employeeId 필요' }, 400)

    const emp = await c.env.DB.prepare(
      `SELECT id, name, employee_code, department, position, hire_date, rrn, phone,
              dependents_count, children_under_20_count, base_salary
       FROM employees WHERE id = ?`
    ).bind(employeeId).first<any>()
    if (!emp) return c.json({ success: false, error: '직원 없음' }, 404)

    // 해당 연도 급여 집계 (PAID 또는 APPROVED)
    const agg = await c.env.DB.prepare(
      `SELECT
        COUNT(*) as months,
        COALESCE(SUM(total_salary), 0) as total_salary,
        COALESCE(SUM(taxable_pay), 0) as taxable_pay,
        COALESCE(SUM(base_salary), 0) as total_base,
        COALESCE(SUM(overtime_pay + night_pay + holiday_pay), 0) as total_overtime,
        COALESCE(SUM(bonus), 0) as total_bonus,
        COALESCE(SUM(annual_leave_pay), 0) as total_annual_leave,
        COALESCE(SUM(meal_allowance + transportation_allowance + other_allowance), 0) as total_allowances,
        COALESCE(SUM(nontax_meal + nontax_transport + nontax_childcare), 0) as total_nontax,
        COALESCE(SUM(national_pension), 0) as sum_national_pension,
        COALESCE(SUM(health_insurance), 0) as sum_health_insurance,
        COALESCE(SUM(long_term_care_insurance), 0) as sum_long_term_care,
        COALESCE(SUM(employment_insurance), 0) as sum_employment_insurance,
        COALESCE(SUM(income_tax), 0) as sum_income_tax,
        COALESCE(SUM(local_tax), 0) as sum_local_tax,
        COALESCE(SUM(total_deduction), 0) as sum_total_deduction,
        COALESCE(SUM(net_pay), 0) as sum_net_pay,
        MIN(pay_period) as first_period,
        MAX(pay_period) as last_period
       FROM payroll
       WHERE employee_id = ? AND pay_period LIKE ?
       AND status IN ('PAID', 'APPROVED', 'PENDING')`
    ).bind(employeeId, `${year}-%`).first<any>()

    // 월별 상세
    const monthly = await c.env.DB.prepare(
      `SELECT pay_period, total_salary, taxable_pay, total_deduction, net_pay,
              national_pension, health_insurance, long_term_care_insurance,
              employment_insurance, income_tax, local_tax, status
       FROM payroll
       WHERE employee_id = ? AND pay_period LIKE ?
       ORDER BY pay_period`
    ).bind(employeeId, `${year}-%`).all()

    return c.json({
      success: true,
      data: {
        employee: emp,
        year,
        summary: agg,
        monthly: monthly.results || [],
      },
    })
  } catch (err: any) {
    console.error('Payroll summary error:', err)
    return c.json({ success: false, error: '조회 실패', detail: '서버 오류가 발생했습니다' }, 500)
  }
})

// ============================================================================
// API: 연말정산 정산 데이터 조회 (저장된 settlement)
// GET /api/payroll/year-end-settlement/:employeeId?year=
// ============================================================================
yearEndRouter.get('/year-end-settlement/:employeeId', async (c) => {
  try {
    const employeeId = Number(c.req.param('employeeId'))
    const year = Number(c.req.query('year') || new Date().getFullYear())
    if (!employeeId) return c.json({ success: false, error: 'employeeId 필요' }, 400)

    const settlement = await c.env.DB.prepare(
      `SELECT * FROM year_end_settlements WHERE employee_id = ? AND year = ?`
    ).bind(employeeId, year).first<any>()

    if (!settlement) return c.json({ success: true, data: null })

    const items = await c.env.DB.prepare(
      `SELECT * FROM year_end_deduction_items WHERE settlement_id = ? ORDER BY category, id`
    ).bind(settlement.id).all()

    return c.json({ success: true, data: { settlement, items: items.results || [] } })
  } catch (err: any) {
    console.error('Payroll settlement details error:', err)
    return c.json({ success: false, error: '조회 실패', detail: '서버 오류가 발생했습니다' }, 500)
  }
})

// ============================================================================
// API: 연말정산 계산 + 저장 (UPSERT)
// POST /api/payroll/year-end-settlement/:employeeId
// body: { year, deduction_items: [...], dependents_count, additional_aged, ... }
// ============================================================================
yearEndRouter.post('/year-end-settlement/:employeeId', async (c) => {
  try {
    const employeeId = Number(c.req.param('employeeId'))
    const body = await c.req.json<any>()
    const year = Number(body.year || new Date().getFullYear())
    if (!employeeId) return c.json({ success: false, error: 'employeeId 필요' }, 400)

    // 1) 급여 집계 (기납부세액)
    const agg = await c.env.DB.prepare(
      `SELECT
        COALESCE(SUM(total_salary), 0) as total_salary,
        COALESCE(SUM(nontax_meal + nontax_transport + nontax_childcare), 0) as total_nontax,
        COALESCE(SUM(taxable_pay), 0) as taxable_pay,
        COALESCE(SUM(national_pension), 0) as sum_national_pension,
        COALESCE(SUM(health_insurance), 0) as sum_health_insurance,
        COALESCE(SUM(long_term_care_insurance), 0) as sum_long_term_care,
        COALESCE(SUM(employment_insurance), 0) as sum_employment_insurance,
        COALESCE(SUM(income_tax), 0) as sum_income_tax,
        COALESCE(SUM(local_tax), 0) as sum_local_tax
       FROM payroll
       WHERE employee_id = ? AND pay_period LIKE ?
       AND status IN ('PAID', 'APPROVED', 'PENDING')`
    ).bind(employeeId, `${year}-%`).first<any>()

    const totalSalary = Number(agg?.total_salary || 0)
    const totalNontax = Number(agg?.total_nontax || 0)
    const grossTaxable = totalSalary - totalNontax
    const prepaidIncomeTax = Number(agg?.sum_income_tax || 0)
    const prepaidLocalTax = Number(agg?.sum_local_tax || 0)

    // 2) 근로소득공제 계산 (2026년 기준)
    const earnedIncomeDeduction = calcEarnedIncomeDeduction(grossTaxable)

    // 근로소득금액 = 총급여 - 비과세 - 근로소득공제
    const earnedIncome = Math.max(0, grossTaxable - earnedIncomeDeduction)

    // 3) 인적공제
    const dependentsCount = Number(body.dependents_count || 1)
    const basicDeduction = dependentsCount * 1500000
    const additionalAged = Number(body.additional_aged || 0) * 1000000
    const additionalDisabled = Number(body.additional_disabled || 0) * 2000000
    const additionalSingleParent = Number(body.additional_single_parent || 0)  // 50만 or 100만 직접 입력

    // 4) 특별소득공제 (직원 제출 서류 기반)
    const insuranceDeduction = Math.min(Number(body.insurance_deduction || 0), 1000000)
    const medicalDeduction = Math.max(0, Number(body.medical_deduction || 0) - Math.floor(grossTaxable * 0.03))
    const educationDeduction = Number(body.education_deduction || 0)
    const housingDeduction = Number(body.housing_deduction || 0)
    const donationDeduction = Number(body.donation_deduction || 0)

    // 국민연금 공제 (전액 공제)
    const nationalPensionDeduction = Number(agg?.sum_national_pension || 0)

    // 5) 기타소득공제
    const pensionSaving = Math.min(Number(body.pension_saving || 0), 4000000)
    const creditCardDeduction = Number(body.credit_card_deduction || 0)

    // 6) 과세표준
    const totalDeductions = basicDeduction + additionalAged + additionalDisabled + additionalSingleParent
      + insuranceDeduction + medicalDeduction + educationDeduction + housingDeduction + donationDeduction
      + nationalPensionDeduction + pensionSaving + creditCardDeduction
    const taxableIncome = Math.max(0, earnedIncome - totalDeductions)

    // 7) 산출세액 (세율표)
    const calculatedTax = calcIncomeTax(taxableIncome)

    // 8) 세액공제
    const earnedTaxCredit = calcEarnedTaxCredit(calculatedTax, grossTaxable)
    const childTaxCredit = Number(body.child_tax_credit || 0)
    // 보장성보험료 세액공제 (12%), 의료비 (15%), 교육비 (15%), 기부금 (15%/30%)
    const insurancePremiumCredit = Math.floor(insuranceDeduction * 0.12)
    const medicalCredit = Math.floor(medicalDeduction * 0.15)
    const educationCredit = Math.floor(educationDeduction * 0.15)
    const donationCredit = Math.floor(donationDeduction * 0.15)
    const pensionContributionCredit = Math.floor(nationalPensionDeduction * 0.12)
    // 표준세액공제: 특별공제를 안 받는 경우 13만원 (여기서는 특별공제 0이면 적용)
    const hasSpecialDeductions = insuranceDeduction + medicalDeduction + educationDeduction + housingDeduction + donationDeduction > 0
    const standardTaxCredit = hasSpecialDeductions ? 0 : 130000

    const totalTaxCredits = earnedTaxCredit + childTaxCredit + insurancePremiumCredit
      + medicalCredit + educationCredit + donationCredit + pensionContributionCredit + standardTaxCredit

    // 9) 결정세액
    const determinedTax = Math.max(0, calculatedTax - totalTaxCredits)
    const determinedLocalTax = Math.floor(determinedTax * 0.1)

    // 10) 차감징수(환급)세액
    const refundIncomeTax = prepaidIncomeTax - determinedTax
    const refundLocalTax = prepaidLocalTax - determinedLocalTax
    const refundTotal = refundIncomeTax + refundLocalTax

    // 11) UPSERT
    const now = new Date().toISOString()
    const existing = await c.env.DB.prepare(
      `SELECT id FROM year_end_settlements WHERE employee_id = ? AND year = ?`
    ).bind(employeeId, year).first<any>()

    let settlementId: number
    if (existing) {
      await c.env.DB.prepare(
        `UPDATE year_end_settlements SET
          status = 'CALCULATED', total_salary = ?, total_nontax = ?, gross_taxable = ?,
          earned_income_deduction = ?, basic_deduction = ?, dependents_count = ?,
          additional_aged = ?, additional_disabled = ?, additional_single_parent = ?,
          insurance_deduction = ?, medical_deduction = ?, education_deduction = ?,
          housing_deduction = ?, donation_deduction = ?,
          pension_saving = ?, credit_card_deduction = ?,
          taxable_income = ?, calculated_tax = ?,
          earned_tax_credit = ?, child_tax_credit = ?,
          pension_contribution_credit = ?, insurance_premium_credit = ?,
          medical_credit = ?, education_credit = ?, donation_credit = ?, standard_tax_credit = ?,
          determined_tax = ?, determined_local_tax = ?,
          prepaid_income_tax = ?, prepaid_local_tax = ?,
          refund_income_tax = ?, refund_local_tax = ?, refund_total = ?,
          notes = ?, calculated_at = ?, updated_at = ?
        WHERE id = ?`
      ).bind(
        totalSalary, totalNontax, grossTaxable,
        earnedIncomeDeduction, basicDeduction, dependentsCount,
        Number(body.additional_aged || 0), Number(body.additional_disabled || 0), additionalSingleParent,
        insuranceDeduction, medicalDeduction, educationDeduction,
        housingDeduction, donationDeduction,
        pensionSaving, creditCardDeduction,
        taxableIncome, calculatedTax,
        earnedTaxCredit, childTaxCredit,
        pensionContributionCredit, insurancePremiumCredit,
        medicalCredit, educationCredit, donationCredit, standardTaxCredit,
        determinedTax, determinedLocalTax,
        prepaidIncomeTax, prepaidLocalTax,
        refundIncomeTax, refundLocalTax, refundTotal,
        body.notes || null, now, now,
        existing.id
      ).run()
      settlementId = existing.id
    } else {
      const ins = await c.env.DB.prepare(
        `INSERT INTO year_end_settlements (
          employee_id, year, status, total_salary, total_nontax, gross_taxable,
          earned_income_deduction, basic_deduction, dependents_count,
          additional_aged, additional_disabled, additional_single_parent,
          insurance_deduction, medical_deduction, education_deduction,
          housing_deduction, donation_deduction,
          pension_saving, credit_card_deduction,
          taxable_income, calculated_tax,
          earned_tax_credit, child_tax_credit,
          pension_contribution_credit, insurance_premium_credit,
          medical_credit, education_credit, donation_credit, standard_tax_credit,
          determined_tax, determined_local_tax,
          prepaid_income_tax, prepaid_local_tax,
          refund_income_tax, refund_local_tax, refund_total,
          notes, calculated_at
        ) VALUES (?, ?, 'CALCULATED', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        employeeId, year, totalSalary, totalNontax, grossTaxable,
        earnedIncomeDeduction, basicDeduction, dependentsCount,
        Number(body.additional_aged || 0), Number(body.additional_disabled || 0), additionalSingleParent,
        insuranceDeduction, medicalDeduction, educationDeduction,
        housingDeduction, donationDeduction,
        pensionSaving, creditCardDeduction,
        taxableIncome, calculatedTax,
        earnedTaxCredit, childTaxCredit,
        pensionContributionCredit, insurancePremiumCredit,
        medicalCredit, educationCredit, donationCredit, standardTaxCredit,
        determinedTax, determinedLocalTax,
        prepaidIncomeTax, prepaidLocalTax,
        refundIncomeTax, refundLocalTax, refundTotal,
        body.notes || null, now
      ).run()
      settlementId = Number(ins.meta?.last_row_id || 0)
    }

    // 공제 증빙 항목 저장 (기존 삭제 후 재삽입)
    if (body.deduction_items && Array.isArray(body.deduction_items)) {
      await c.env.DB.prepare(`DELETE FROM year_end_deduction_items WHERE settlement_id = ?`).bind(settlementId).run()
      for (const item of body.deduction_items) {
        await c.env.DB.prepare(
          `INSERT INTO year_end_deduction_items (settlement_id, category, sub_category, description, amount, deductible_amount)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).bind(settlementId, item.category, item.sub_category || null, item.description || null, Number(item.amount || 0), Number(item.deductible_amount || 0)).run()
      }
    }

    return c.json({
      success: true,
      data: {
        settlement_id: settlementId,
        summary: {
          grossTaxable, earnedIncomeDeduction, earnedIncome,
          totalDeductions, taxableIncome, calculatedTax,
          totalTaxCredits, determinedTax, determinedLocalTax,
          prepaidIncomeTax, prepaidLocalTax,
          refundIncomeTax, refundLocalTax, refundTotal,
        }
      }
    })
  } catch (err: any) {
    console.error('Payroll settlement create error:', err)
    return c.json({ success: false, error: '정산 실패', detail: '서버 오류가 발생했습니다' }, 500)
  }
})

// ============================================================================
// API: 연말정산 확정 (CONFIRMED 상태로 변경)
// PUT /api/payroll/year-end-settlement/:settlementId/confirm
// ============================================================================
yearEndRouter.put('/year-end-settlement/:settlementId/confirm', async (c) => {
  try {
    const settlementId = Number(c.req.param('settlementId'))
    const user = c.get('user')
    const now = new Date().toISOString()
    await c.env.DB.prepare(
      `UPDATE year_end_settlements SET status = 'CONFIRMED', confirmed_by = ?, confirmed_at = ?, updated_at = ? WHERE id = ?`
    ).bind(user?.id || null, now, now, settlementId).run()
    return c.json({ success: true })
  } catch (err: any) {
    console.error('Payroll settlement confirm error:', err)
    return c.json({ success: false, error: '확정 실패', detail: '서버 오류가 발생했습니다' }, 500)
  }
})

// ============================================================================
// API: 연말정산 직원 목록 (관리자용 — 전체 직원 정산 현황)
// GET /api/payroll/year-end-list?year=
// ============================================================================
yearEndRouter.get('/year-end-list', async (c) => {
  try {
    const year = Number(c.req.query('year') || new Date().getFullYear())
    const rows = await c.env.DB.prepare(
      `SELECT e.id, e.name, e.employee_code, e.department, e.position,
              y.id as settlement_id, y.status, y.total_salary, y.determined_tax,
              y.prepaid_income_tax, y.refund_total, y.calculated_at
       FROM employees e
       LEFT JOIN year_end_settlements y ON e.id = y.employee_id AND y.year = ?
       WHERE e.status = 'ACTIVE'
       ORDER BY e.department, e.name`
    ).bind(year).all()
    return c.json({ success: true, data: rows.results || [] })
  } catch (err: any) {
    console.error('Payroll settlement list error:', err)
    return c.json({ success: false, error: '조회 실패', detail: '서버 오류가 발생했습니다' }, 500)
  }
})

export default yearEndRouter
