/**
 * payroll/year-end.ts — 연말정산 (D)
 * 2026-04-15 분할
 */
import { Hono } from 'hono'
import type { HonoEnv } from '../../types/env'
import { authMiddleware, requireRole } from '../../middleware/auth'
import { entityFilter, getEntityId } from '../../utils/entityFilter'
import { decryptPII } from '../../utils/crypto'
import { kstYear } from '../../utils/kstDate'
import { calcYearEndSettlement } from './year-end-calc'

const yearEndRouter = new Hono<HonoEnv>()
// 연말정산(직원 급여·정산 데이터)은 전 라우트 ADMIN/MANAGER 전용
yearEndRouter.use('/*', authMiddleware, requireRole('ADMIN', 'MANAGER'))

// 연말정산 산식(근로소득공제·세율표·세액공제) = ./year-end-calc.ts (순수 함수 · test:calc 게이트)

// 연말정산 라우트 (원본 1214~1552)
yearEndRouter.get('/year-end/:employeeId', async (c) => {
  try {
    const employeeId = Number(c.req.param('employeeId'))
    const year = Number(c.req.query('year') || kstYear())
    if (!employeeId) return c.json({ success: false, error: 'employeeId 필요' }, 400)

    // #IDOR: 자법인 직원만 (ADMIN=entityId 0 → bypass). 형제 라우트(:144 settlement·:399 list)와 정합.
    const yeEf = entityFilter(c)
    const emp = await c.env.DB.prepare(
      `SELECT id, name, employee_code, department, position, hire_date, resident_number, phone,
              dependents_count, children_under_20_count, base_salary
       FROM employees WHERE id = ?${yeEf.clause}`
    ).bind(employeeId, ...yeEf.params).first<any>()
    if (!emp) return c.json({ success: false, error: '직원 없음' }, 404)

    // #397: employees에 rrn 컬럼 없음 → resident_number(암호화) 복호화 후 rrn 필드로 반환(프론트 maskRrn 호환).
    // ADMIN은 원본, 그 외는 마스킹(hr.ts:667 패턴). 암호화 ciphertext 비노출.
    if (emp.resident_number) {
      const piiKey = c.env.JWT_SECRET
      if (!piiKey) throw new Error('PII encryption key (JWT_SECRET) is not configured')
      const decrypted = await decryptPII(String(emp.resident_number), piiKey)
      const user = c.get('user')
      emp.rrn = user?.role === 'ADMIN'
        ? decrypted
        : (decrypted.length >= 7 ? decrypted.slice(0, 6) + '-*******' : '******-*******')
    } else {
      emp.rrn = null
    }
    delete emp.resident_number

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
       ORDER BY pay_period, id`
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
    const year = Number(c.req.query('year') || kstYear())
    if (!employeeId) return c.json({ success: false, error: 'employeeId 필요' }, 400)

    const efSet = entityFilter(c, '')
    const settlement = await c.env.DB.prepare(
      `SELECT id, employee_id, year, status, total_salary, total_nontax, gross_taxable, earned_income_deduction, basic_deduction, dependents_count, additional_aged, additional_disabled, additional_single_parent, insurance_deduction, medical_deduction, education_deduction, housing_deduction, donation_deduction, pension_saving, credit_card_deduction, taxable_income, calculated_tax, earned_tax_credit, child_tax_credit, pension_contribution_credit, insurance_premium_credit, medical_credit, education_credit, donation_credit, standard_tax_credit, determined_tax, determined_local_tax, prepaid_income_tax, prepaid_local_tax, refund_income_tax, refund_local_tax, refund_total, notes, calculated_at, confirmed_by, confirmed_at, created_at, updated_at FROM year_end_settlements WHERE employee_id = ? AND year = ?${efSet.clause}`
    ).bind(employeeId, year, ...efSet.params).first<any>()

    if (!settlement) return c.json({ success: true, data: null })

    const items = await c.env.DB.prepare(
      `SELECT id, settlement_id, category, sub_category, description, amount, deductible_amount, created_at FROM year_end_deduction_items WHERE settlement_id = ? ORDER BY category, id`
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
yearEndRouter.post('/year-end-settlement/:employeeId', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const employeeId = Number(c.req.param('employeeId'))
    const body = await c.req.json<any>()
    const year = Number(body.year || kstYear())
    if (!employeeId) return c.json({ success: false, error: 'employeeId 필요' }, 400)

    // #553: 자법인 직원만 계산·저장 (형제 GET :61-67과 정합 — cross-tenant 급여 열람·확정 정산 덮어쓰기 차단)
    // 이후 쿼리는 employee_id 스코프라 이 소유게이트가 보안 경계 (payroll.entity_id는 DEFAULT 1 신뢰불가 — 필터 시 정상 행 누락)
    const yeEf = entityFilter(c)
    const empOwn = await c.env.DB.prepare(
      `SELECT id, entity_id FROM employees WHERE id = ?${yeEf.clause}`
    ).bind(employeeId, ...yeEf.params).first<{ id: number; entity_id: number }>()
    if (!empOwn) return c.json({ success: false, error: '직원 없음' }, 404)

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

    // 2)~10) 산식 = year-end-calc.ts (순수 함수, test:calc 게이트).
    //   ★ 보험료·의료비·교육비·기부금은 세액공제만, 국민연금은 소득공제만, 연금저축은 세액공제 — 이중공제 금지.
    const dependentsCount = Number(body.dependents_count || 1)
    const r = calcYearEndSettlement({
      totalSalary, totalNontax,
      nationalPension: Number(agg?.sum_national_pension || 0),
      prepaidIncomeTax, prepaidLocalTax,
      dependentsCount,
      additionalAged: Number(body.additional_aged || 0),
      additionalDisabled: Number(body.additional_disabled || 0),
      additionalSingleParent: Number(body.additional_single_parent || 0),  // 50만 or 100만 직접 입력
      insurance: Number(body.insurance_deduction || 0),
      medical: Number(body.medical_deduction || 0),
      education: Number(body.education_deduction || 0),
      housing: Number(body.housing_deduction || 0),
      donation: Number(body.donation_deduction || 0),
      pensionSaving: Number(body.pension_saving || 0),
      creditCard: Number(body.credit_card_deduction || 0),
      childTaxCredit: Number(body.child_tax_credit || 0),
    })
    const {
      earnedIncomeDeduction, earnedIncome, totalDeductions, totalTaxCredits,
      basicDeduction, additionalSingleParent,
      insuranceDeduction, medicalDeduction, educationDeduction, housingDeduction, donationDeduction,
      pensionSaving, creditCardDeduction, taxableIncome, calculatedTax,
      earnedTaxCredit, childTaxCredit, pensionContributionCredit, insurancePremiumCredit,
      medicalCredit, educationCredit, donationCredit, standardTaxCredit,
      determinedTax, determinedLocalTax, refundIncomeTax, refundLocalTax, refundTotal,
    } = r

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
          notes, calculated_at, entity_id
        ) VALUES (?, ?, 'CALCULATED', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
        // #553: 귀속=직원의 entity (호출자 entity 사용 시 전체모드 ADMIN이 타법인 직원 정산을 1번 법인으로 오귀속)
        body.notes || null, now, empOwn.entity_id || getEntityId(c) || 1
      ).run()
      settlementId = Number(ins.meta?.last_row_id || 0)
    }

    // 공제 증빙 항목 저장 (기존 삭제 후 재삽입)
    if (body.deduction_items && Array.isArray(body.deduction_items)) {
      // #350 DELETE + INSERT 루프 → 단일 batch (원자 교체, deduction_items 소량)
      const deductStmts: D1PreparedStatement[] = [
        c.env.DB.prepare(`DELETE FROM year_end_deduction_items WHERE settlement_id = ?`).bind(settlementId)
      ]
      for (const item of body.deduction_items) {
        deductStmts.push(c.env.DB.prepare(
          `INSERT INTO year_end_deduction_items (settlement_id, category, sub_category, description, amount, deductible_amount)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).bind(settlementId, item.category, item.sub_category || null, item.description || null, Number(item.amount || 0), Number(item.deductible_amount || 0)))
      }
      await c.env.DB.batch(deductStmts)
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
yearEndRouter.put('/year-end-settlement/:settlementId/confirm', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const settlementId = Number(c.req.param('settlementId'))
    const user = c.get('user')
    const now = new Date().toISOString()
    const ef = entityFilter(c)  // #452: 타법인 연말정산 확정 차단
    await c.env.DB.prepare(
      `UPDATE year_end_settlements SET status = 'CONFIRMED', confirmed_by = ?, confirmed_at = ?, updated_at = ? WHERE id = ?${ef.clause}`
    ).bind(user?.id || null, now, now, settlementId, ...ef.params).run()
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
    const year = Number(c.req.query('year') || kstYear())
    const ef = entityFilter(c, 'y')
    const rows = await c.env.DB.prepare(
      `SELECT e.id, e.name, e.employee_code, e.department, e.position,
              y.id as settlement_id, y.status, y.total_salary, y.determined_tax,
              y.prepaid_income_tax, y.refund_total, y.calculated_at
       FROM employees e
       LEFT JOIN year_end_settlements y ON e.id = y.employee_id AND y.year = ?
       WHERE e.status = 'ACTIVE'${ef.clause}
       ORDER BY e.department, e.name`
    ).bind(year, ...ef.params).all()
    return c.json({ success: true, data: rows.results || [] })
  } catch (err: any) {
    console.error('Payroll settlement list error:', err)
    return c.json({ success: false, error: '조회 실패', detail: '서버 오류가 발생했습니다' }, 500)
  }
})

export default yearEndRouter
