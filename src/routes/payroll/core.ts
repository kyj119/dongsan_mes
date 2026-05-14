/**
 * payroll/core.ts — 급여 계산 (A)
 * 2026-04-15 분할
 */
import { Hono } from 'hono'
import type { HonoEnv } from '../../types/env'
import { authMiddleware, requireRole } from '../../middleware/auth'

import {
  getSettings,
  calcOvertimePay,
  loadOvertimeSettings,
  calcDeductions,
  loadEmployeeDefaults,
} from './shared'
import { getEntityId, entityFilter } from '../../utils/entityFilter'

const coreRouter = new Hono<HonoEnv>()
coreRouter.use('/*', authMiddleware)

// A: 급여 계산 — 원본 라인 357-700 + 800-1013
coreRouter.post('/preview', async (c) => {
  try {
    const body = await c.req.json<any>()
    const employeeId = Number(body.employee_id)
    const payPeriod = String(body.pay_period || '') // YYYY-MM
    if (!employeeId || !payPeriod) return c.json({ success: false, error: 'employee_id, pay_period 필요' }, 400)

    const emp = await c.env.DB.prepare(
      `SELECT id, name, base_salary, hourly_rate, overtime_daily_hours, overtime_work_days,
              dependents_count, children_under_20_count, income_tax_table_option
       FROM employees WHERE id = ?`
    ).bind(employeeId).first<any>()
    if (!emp) return c.json({ success: false, error: '직원 없음' }, 404)

    // 직원 고정수당/4대보험 토글 기본값 로드
    const empDefaults = await loadEmployeeDefaults(c.env.DB, employeeId)

    const settings = await getSettings(c.env.DB, [
      'payroll_meal_allowance_nontax_max',
      'payroll_transport_allowance_nontax_max',
      'payroll_childcare_allowance_nontax_max',
    ])
    const mealMax = Number(settings.payroll_meal_allowance_nontax_max || 200000)
    const transMax = Number(settings.payroll_transport_allowance_nontax_max || 200000)
    const childMax = Number(settings.payroll_childcare_allowance_nontax_max || 200000)

    const base_salary = Number(body.base_salary ?? emp.base_salary ?? 0)

    // 고정연장시간: overtime_daily_hours × overtime_work_days (기본 0)
    const fixedOvertimeHours = (Number(emp.overtime_daily_hours) || 0) * (Number(emp.overtime_work_days) || 22)
    // body.overtime_hours 입력 시 수동 오버라이드, 없으면 고정연장시간 자동 적용
    const overtime_hours = body.overtime_hours != null ? Number(body.overtime_hours) : fixedOvertimeHours
    const night_hours = Number(body.night_hours || 0)
    const holiday_hours = Number(body.holiday_hours || 0)
    const otSettings = await loadOvertimeSettings(c.env.DB)
    const ot = calcOvertimePay({
      baseSalary: base_salary,
      monthlyWorkHours: otSettings.monthlyWorkHours,
      overtimeHours: overtime_hours,
      nightHours: night_hours,
      holidayHours: holiday_hours,
      overtimeMul: otSettings.overtimeMul,
      nightMul: otSettings.nightMul,
      holidayMul: otSettings.holidayMul,
      holidayOverMul: otSettings.holidayOverMul,
    })

    // body에 금액이 명시적으로 있으면 그것을 우선, 아니면 자동계산값 사용
    const overtime_pay = body.overtime_pay != null ? Number(body.overtime_pay) : ot.overtime_pay
    const night_pay = body.night_pay != null ? Number(body.night_pay) : ot.night_pay
    const holiday_pay = body.holiday_pay != null ? Number(body.holiday_pay) : ot.holiday_pay

    const annual_leave_pay = Number(body.annual_leave_pay || 0)
    // 고정상여: body.bonus가 없으면 employees.special_bonus_fixed 사용
    const bonus = body.bonus != null ? Number(body.bonus) : Number(empDefaults.special_bonus_fixed || 0)
    // 기타수당: body.other_allowance가 없으면 직책수당+차량유지비+기타수당_고정 합
    const fixedOtherAllowanceDefault =
      empDefaults.position_allowance +
      empDefaults.vehicle_allowance +
      empDefaults.other_allowance_fixed
    const other_allowance = body.other_allowance != null ? Number(body.other_allowance) : fixedOtherAllowanceDefault

    // 식대: body.meal이 없으면 employees.meal_allowance_fixed 사용
    const meal_total = body.meal != null ? Number(body.meal) : Number(empDefaults.meal_allowance_fixed || 0)
    const transport_total = Number(body.transport || 0)
    const childcare_total = Number(body.childcare || 0)

    // 비과세/과세 분리
    const nontax_meal = Math.min(meal_total, mealMax)
    const nontax_transport = Math.min(transport_total, transMax)
    const nontax_childcare = Math.min(childcare_total, childMax)
    const tax_meal = meal_total - nontax_meal
    const tax_transport = transport_total - nontax_transport
    const tax_childcare = childcare_total - nontax_childcare

    const total_salary =
      base_salary + overtime_pay + night_pay + holiday_pay + annual_leave_pay + bonus +
      meal_total + transport_total + childcare_total + other_allowance

    const taxable_pay =
      base_salary + overtime_pay + night_pay + holiday_pay + annual_leave_pay + bonus +
      tax_meal + tax_transport + tax_childcare + other_allowance

    const dependents = Math.max(1, Number(emp.dependents_count || 1))
    const taxOption = String(emp.income_tax_table_option || '100')
    const year = Number(payPeriod.slice(0, 4)) || new Date().getFullYear()

    const deductions = await calcDeductions(c.env.DB, {
      taxablePay: taxable_pay,
      dependents,
      taxOption,
      year,
      applyNationalPension: empDefaults.insurance_apply_national_pension,
      applyHealth: empDefaults.insurance_apply_health,
      applyLongTermCare: empDefaults.insurance_apply_long_term_care,
      applyEmployment: empDefaults.insurance_apply_employment,
      applyIndustrialAccident: empDefaults.insurance_apply_industrial_accident,
    })

    // 고정 공제 기본값: body.other_deduction 없으면 상조회비+기타공제_고정 합
    const fixedOtherDeductionDefault = empDefaults.mutual_aid_fee + empDefaults.other_deduction_fixed
    const preview_other_deduction = body.other_deduction != null ? Number(body.other_deduction) : fixedOtherDeductionDefault
    const net_pay = total_salary - deductions.total_deduction - preview_other_deduction

    return c.json({
      success: true,
      data: {
        employee: { id: emp.id, name: emp.name },
        pay_period: payPeriod,
        employee_defaults: empDefaults,
        earnings: {
          base_salary, overtime_pay, night_pay, holiday_pay, annual_leave_pay, bonus,
          meal_total, transport_total, childcare_total, other_allowance,
          nontax_meal, nontax_transport, nontax_childcare,
          total_salary, taxable_pay,
        },
        other_deduction: preview_other_deduction,
        overtime: {
          hourly_wage: ot.hourly_wage,
          monthly_work_hours: otSettings.monthlyWorkHours,
          overtime_hours, night_hours, holiday_hours,
          auto_overtime_pay: ot.overtime_pay,
          auto_night_pay: ot.night_pay,
          auto_holiday_pay: ot.holiday_pay,
        },
        deductions,
        net_pay,
      },
    })
  } catch (err: any) {
    console.error('Payroll preview error:', err)
    return c.json({ success: false, error: 'preview 실패', detail: '서버 오류가 발생했습니다' }, 500)
  }
})

// ============================================================================
// API: 급여 저장 (PENDING 상태)
// POST /api/payroll/save
// ============================================================================
coreRouter.post('/save', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const body = await c.req.json<any>()
    const employeeId = Number(body.employee_id)
    const payPeriod = String(body.pay_period || '')
    const payDateInput = String(body.pay_date || '')
    if (!employeeId || !payPeriod) return c.json({ success: false, error: 'employee_id, pay_period 필요' }, 400)

    const user = c.get('user')

    // 1) 직원 + 설정 로드
    const emp = await c.env.DB.prepare(
      `SELECT id, base_salary, hourly_rate, overtime_daily_hours, overtime_work_days,
              dependents_count, income_tax_table_option
       FROM employees WHERE id = ?`
    ).bind(employeeId).first<any>()
    if (!emp) return c.json({ success: false, error: '직원 없음' }, 404)

    // 직원 고정수당/4대보험 토글 기본값
    const empDefaults = await loadEmployeeDefaults(c.env.DB, employeeId)

    const settings = await getSettings(c.env.DB, [
      'payroll_meal_allowance_nontax_max',
      'payroll_transport_allowance_nontax_max',
      'payroll_childcare_allowance_nontax_max',
      'payroll_pay_day',
    ])
    const mealMax = Number(settings.payroll_meal_allowance_nontax_max || 200000)
    const transMax = Number(settings.payroll_transport_allowance_nontax_max || 200000)
    const childMax = Number(settings.payroll_childcare_allowance_nontax_max || 200000)
    const payDay = Number(settings.payroll_pay_day || 10)

    // 지급일 자동 산정 (payPeriod 다음달 payDay)
    let pay_date = payDateInput
    if (!pay_date) {
      const [yy, mm] = payPeriod.split('-').map(Number)
      const next = new Date(yy, mm, payDay) // mm이 0-base 다음달
      pay_date = next.toISOString().slice(0, 10)
    }

    const base_salary = Number(body.base_salary ?? emp.base_salary ?? 0)

    // 고정연장시간: overtime_daily_hours × overtime_work_days (기본 0)
    const fixedOvertimeHours = (Number(emp.overtime_daily_hours) || 0) * (Number(emp.overtime_work_days) || 22)
    // body.overtime_hours 입력 시 수동 오버라이드, 없으면 고정연장시간 자동 적용
    const overtime_hours_in = body.overtime_hours != null ? Number(body.overtime_hours) : fixedOvertimeHours
    const night_hours_in = Number(body.night_hours || 0)
    const holiday_hours_in = Number(body.holiday_hours || 0)
    const otSettings = await loadOvertimeSettings(c.env.DB)
    const ot = calcOvertimePay({
      baseSalary: base_salary,
      monthlyWorkHours: otSettings.monthlyWorkHours,
      overtimeHours: overtime_hours_in,
      nightHours: night_hours_in,
      holidayHours: holiday_hours_in,
      overtimeMul: otSettings.overtimeMul,
      nightMul: otSettings.nightMul,
      holidayMul: otSettings.holidayMul,
      holidayOverMul: otSettings.holidayOverMul,
    })

    const overtime_pay = body.overtime_pay != null ? Number(body.overtime_pay) : ot.overtime_pay
    const night_pay = body.night_pay != null ? Number(body.night_pay) : ot.night_pay
    const holiday_pay = body.holiday_pay != null ? Number(body.holiday_pay) : ot.holiday_pay
    const annual_leave_pay = Number(body.annual_leave_pay || 0)
    // 고정상여 기본값: employees.special_bonus_fixed
    const bonus = body.bonus != null ? Number(body.bonus) : Number(empDefaults.special_bonus_fixed || 0)
    // 기타수당 기본값: 직책수당+차량유지비+기타수당_고정
    const fixedOtherAllowanceDefault =
      empDefaults.position_allowance +
      empDefaults.vehicle_allowance +
      empDefaults.other_allowance_fixed
    const other_allowance = body.other_allowance != null ? Number(body.other_allowance) : fixedOtherAllowanceDefault

    // 식대 기본값: employees.meal_allowance_fixed
    const meal_total = body.meal != null ? Number(body.meal) : Number(empDefaults.meal_allowance_fixed || 0)
    const transport_total = Number(body.transport || 0)
    const childcare_total = Number(body.childcare || 0)
    const nontax_meal = Math.min(meal_total, mealMax)
    const nontax_transport = Math.min(transport_total, transMax)
    const nontax_childcare = Math.min(childcare_total, childMax)
    const meal_allowance = meal_total
    const transportation_allowance = transport_total

    const total_salary =
      base_salary + overtime_pay + night_pay + holiday_pay + annual_leave_pay + bonus +
      meal_total + transport_total + childcare_total + other_allowance

    const taxable_pay = total_salary - nontax_meal - nontax_transport - nontax_childcare

    const dependents = Math.max(1, Number(emp.dependents_count || 1))
    const taxOption = String(emp.income_tax_table_option || '100')
    const year = Number(payPeriod.slice(0, 4)) || new Date().getFullYear()

    const d = await calcDeductions(c.env.DB, {
      taxablePay: taxable_pay, dependents, taxOption, year,
      applyNationalPension: empDefaults.insurance_apply_national_pension,
      applyHealth: empDefaults.insurance_apply_health,
      applyLongTermCare: empDefaults.insurance_apply_long_term_care,
      applyEmployment: empDefaults.insurance_apply_employment,
      applyIndustrialAccident: empDefaults.insurance_apply_industrial_accident,
    })

    const work_days = Number(body.work_days || 0)
    const overtime_hours = overtime_hours_in
    const absent_days = Number(body.absent_days || 0)
    const late_count = Number(body.late_count || 0)
    const leave_used_days = Number(body.leave_used_days || 0)
    // 고정 공제 기본값: 상조회비 + 기타공제_고정
    const fixedOtherDeductionDefault = empDefaults.mutual_aid_fee + empDefaults.other_deduction_fixed
    const other_deduction = body.other_deduction != null ? Number(body.other_deduction) : fixedOtherDeductionDefault

    const total_deduction = d.total_deduction + other_deduction
    const net_pay = total_salary - total_deduction
    const notes = String(body.notes || '')

    // UPSERT — 동일 employee+period 있으면 update
    await c.env.DB.prepare(
      `INSERT INTO payroll (
        employee_id, pay_period, pay_date,
        base_salary, overtime_pay, night_pay, holiday_pay,
        meal_allowance, transportation_allowance, other_allowance,
        annual_leave_pay, bonus,
        nontax_meal, nontax_transport, nontax_childcare, taxable_pay,
        total_salary,
        national_pension, health_insurance, long_term_care_insurance,
        employment_insurance, income_tax, local_tax, other_deduction,
        employer_national_pension, employer_health_insurance, employer_long_term_care,
        employer_employment_insurance, employer_industrial_accident,
        total_deduction, net_pay,
        work_days, overtime_hours, absent_days, late_count, leave_used_days,
        status, notes, created_by, entity_id, created_at, updated_at
      ) VALUES (
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?,
        ?, ?, ?, ?,
        ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?,
        ?, ?,
        ?, ?, ?, ?, ?,
        'PENDING', ?, ?, ?, datetime('now'), datetime('now')
      )
      ON CONFLICT(employee_id, pay_period) DO UPDATE SET
        pay_date=excluded.pay_date,
        base_salary=excluded.base_salary,
        overtime_pay=excluded.overtime_pay,
        night_pay=excluded.night_pay,
        holiday_pay=excluded.holiday_pay,
        meal_allowance=excluded.meal_allowance,
        transportation_allowance=excluded.transportation_allowance,
        other_allowance=excluded.other_allowance,
        annual_leave_pay=excluded.annual_leave_pay,
        bonus=excluded.bonus,
        nontax_meal=excluded.nontax_meal,
        nontax_transport=excluded.nontax_transport,
        nontax_childcare=excluded.nontax_childcare,
        taxable_pay=excluded.taxable_pay,
        total_salary=excluded.total_salary,
        national_pension=excluded.national_pension,
        health_insurance=excluded.health_insurance,
        long_term_care_insurance=excluded.long_term_care_insurance,
        employment_insurance=excluded.employment_insurance,
        income_tax=excluded.income_tax,
        local_tax=excluded.local_tax,
        other_deduction=excluded.other_deduction,
        employer_national_pension=excluded.employer_national_pension,
        employer_health_insurance=excluded.employer_health_insurance,
        employer_long_term_care=excluded.employer_long_term_care,
        employer_employment_insurance=excluded.employer_employment_insurance,
        employer_industrial_accident=excluded.employer_industrial_accident,
        total_deduction=excluded.total_deduction,
        net_pay=excluded.net_pay,
        work_days=excluded.work_days,
        overtime_hours=excluded.overtime_hours,
        absent_days=excluded.absent_days,
        late_count=excluded.late_count,
        leave_used_days=excluded.leave_used_days,
        notes=excluded.notes,
        updated_at=datetime('now')`
    ).bind(
      employeeId, payPeriod, pay_date,
      base_salary, overtime_pay, night_pay, holiday_pay,
      meal_allowance, transportation_allowance, other_allowance,
      annual_leave_pay, bonus,
      nontax_meal, nontax_transport, nontax_childcare, taxable_pay,
      total_salary,
      d.national_pension, d.health_insurance, d.long_term_care_insurance,
      d.employment_insurance, d.income_tax, d.local_tax, other_deduction,
      d.employer_national_pension, d.employer_health_insurance, d.employer_long_term_care,
      d.employer_employment_insurance, d.employer_industrial_accident,
      total_deduction, net_pay,
      work_days, overtime_hours, absent_days, late_count, leave_used_days,
      notes, user?.id || null, getEntityId(c)
    ).run()

    return c.json({ success: true, data: { employee_id: employeeId, pay_period: payPeriod, net_pay } })
  } catch (err: any) {
    console.error('Payroll save error:', err)
    return c.json({ success: false, error: '저장 실패', detail: '서버 오류가 발생했습니다' }, 500)
  }
})

// ============================================================================
// API: 급여 목록 (월별)
// GET /api/payroll?period=2026-03
// ============================================================================
coreRouter.post('/batch', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const body = await c.req.json<any>()
    const payPeriod = String(body.pay_period || '')
    if (!payPeriod) return c.json({ success: false, error: 'pay_period 필요' }, 400)

    const ef = entityFilter(c, 'e')
    const empQuery = `SELECT e.id FROM employees e WHERE e.status = 'ACTIVE'${ef.clause}`
    const employees = await c.env.DB.prepare(empQuery).bind(...ef.params).all<{ id: number }>()
    const list = employees.results || []

    const user = c.get('user')
    let created = 0
    let skipped = 0
    for (const emp of list) {
      // 이미 있으면 스킵
      const exists = await c.env.DB.prepare(
        `SELECT id FROM payroll WHERE employee_id = ? AND pay_period = ?`
      ).bind(emp.id, payPeriod).first()
      if (exists) { skipped++; continue }

      // preview 로직 재사용 — 직원 고정수당 + 보험 토글을 기본값으로 반영
      const empRow = await c.env.DB.prepare(
        `SELECT base_salary, hourly_rate, overtime_daily_hours, overtime_work_days,
                dependents_count, income_tax_table_option FROM employees WHERE id = ?`
      ).bind(emp.id).first<any>()
      const empDefaults = await loadEmployeeDefaults(c.env.DB, emp.id)
      const base_salary = Number(empRow?.base_salary || 0)
      const dependents = Math.max(1, Number(empRow?.dependents_count || 1))
      const taxOption = String(empRow?.income_tax_table_option || '100')
      const year = Number(payPeriod.slice(0, 4))

      // 고정연장시간 자동 계산
      const batchFixedOtHours = (Number(empRow?.overtime_daily_hours) || 0) * (Number(empRow?.overtime_work_days) || 22)
      const otSettings = await loadOvertimeSettings(c.env.DB)
      const batchOt = calcOvertimePay({
        baseSalary: base_salary,
        monthlyWorkHours: otSettings.monthlyWorkHours,
        overtimeHours: batchFixedOtHours,
        nightHours: 0,
        holidayHours: 0,
        overtimeMul: otSettings.overtimeMul,
        nightMul: otSettings.nightMul,
        holidayMul: otSettings.holidayMul,
        holidayOverMul: otSettings.holidayOverMul,
      })
      const batch_overtime_pay = batchOt.overtime_pay

      // 고정 수당
      const bonus_fixed = empDefaults.special_bonus_fixed
      const other_allowance_fixed_total =
        empDefaults.position_allowance + empDefaults.vehicle_allowance + empDefaults.other_allowance_fixed
      const meal_total = empDefaults.meal_allowance_fixed

      const settings = await getSettings(c.env.DB, ['payroll_meal_allowance_nontax_max'])
      const mealMax = Number(settings.payroll_meal_allowance_nontax_max || 200000)
      const nontax_meal = Math.min(meal_total, mealMax)
      const tax_meal = meal_total - nontax_meal

      const total_salary = base_salary + batch_overtime_pay + bonus_fixed + other_allowance_fixed_total + meal_total
      const taxable_pay = base_salary + batch_overtime_pay + bonus_fixed + other_allowance_fixed_total + tax_meal

      const d = await calcDeductions(c.env.DB, {
        taxablePay: taxable_pay, dependents, taxOption, year,
        applyNationalPension: empDefaults.insurance_apply_national_pension,
        applyHealth: empDefaults.insurance_apply_health,
        applyLongTermCare: empDefaults.insurance_apply_long_term_care,
        applyEmployment: empDefaults.insurance_apply_employment,
        applyIndustrialAccident: empDefaults.insurance_apply_industrial_accident,
      })
      const fixed_other_deduction = empDefaults.mutual_aid_fee + empDefaults.other_deduction_fixed
      const net_pay = total_salary - d.total_deduction - fixed_other_deduction
      const [yy, mm] = payPeriod.split('-').map(Number)
      const pay_date = new Date(yy, mm, 10).toISOString().slice(0, 10)

      await c.env.DB.prepare(
        `INSERT INTO payroll (
          employee_id, pay_period, pay_date, base_salary,
          overtime_pay, overtime_hours,
          meal_allowance, other_allowance, bonus,
          nontax_meal, taxable_pay, total_salary,
          national_pension, health_insurance, long_term_care_insurance,
          employment_insurance, income_tax, local_tax, other_deduction,
          employer_national_pension, employer_health_insurance, employer_long_term_care,
          employer_employment_insurance, employer_industrial_accident,
          total_deduction, net_pay, status, created_by, entity_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, datetime('now'), datetime('now'))`
      ).bind(
        emp.id, payPeriod, pay_date, base_salary,
        batch_overtime_pay, batchFixedOtHours,
        meal_total, other_allowance_fixed_total, bonus_fixed,
        nontax_meal, taxable_pay, total_salary,
        d.national_pension, d.health_insurance, d.long_term_care_insurance,
        d.employment_insurance, d.income_tax, d.local_tax, fixed_other_deduction,
        d.employer_national_pension, d.employer_health_insurance, d.employer_long_term_care,
        d.employer_employment_insurance, d.employer_industrial_accident,
        d.total_deduction + fixed_other_deduction, net_pay, user?.id || null, getEntityId(c)
      ).run()
      created++
    }

    // 스킵된 직원 이름 함께 반환 (UX 개선)
    let skippedNames: string[] = []
    if (skipped > 0) {
      const { results: skippedRows } = await c.env.DB.prepare(`
        SELECT e.name
        FROM payroll p
        JOIN employees e ON p.employee_id = e.id
        WHERE p.pay_period = ? AND e.status = 'ACTIVE'
      `).bind(payPeriod).all<{ name: string }>()
      skippedNames = (skippedRows || []).map((r: any) => r.name)
    }

    return c.json({
      success: true,
      data: { created, skipped, total: list.length, skipped_names: skippedNames }
    })
  } catch (err: any) {
    console.error('Payroll batch create error:', err)
    return c.json({ success: false, error: '일괄 생성 실패', detail: '서버 오류가 발생했습니다' }, 500)
  }
})

// ============================================================================
// API: 근태 → 급여 동기화
// POST /api/payroll/sync-attendance
// body: { pay_period: 'YYYY-MM', employee_ids?: number[] }
// 해당 월 attendance 테이블의 overtime_hours SUM + 근무일수 + 지각/결근 카운트를
// 해당 월 payroll 레코드에 반영. (payroll 레코드가 없는 직원은 스킵)
// ============================================================================
coreRouter.post('/sync-attendance', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const body = await c.req.json<any>()
    const payPeriod = String(body.pay_period || '')
    if (!payPeriod) return c.json({ success: false, error: 'pay_period 필요' }, 400)

    const employeeIds: number[] = Array.isArray(body.employee_ids) ? body.employee_ids : []

    // 대상 급여 레코드 조회
    let targetQuery = `
      SELECT p.id, p.employee_id, p.base_salary
      FROM payroll p
      WHERE p.pay_period = ?
    `
    const targetParams: any[] = [payPeriod]
    if (employeeIds.length > 0) {
      targetQuery += ` AND p.employee_id IN (${employeeIds.map(() => '?').join(',')})`
      targetParams.push(...employeeIds)
    }
    const { results: targets } = await c.env.DB.prepare(targetQuery).bind(...targetParams).all<any>()

    let synced = 0
    const details: any[] = []

    // overtime 요율 설정 로드
    const otSettings = await loadOvertimeSettings(c.env.DB)

    for (const t of (targets || [])) {
      // 근태 집계
      const agg = await c.env.DB.prepare(`
        SELECT
          COUNT(*) as total_days,
          SUM(CASE WHEN attendance_type NOT IN ('ABSENT', 'VACATION', 'HOLIDAY') THEN 1 ELSE 0 END) as work_days,
          SUM(CASE WHEN attendance_type = 'ABSENT' OR status = 'ABSENT' THEN 1 ELSE 0 END) as absent_days,
          SUM(CASE WHEN attendance_type = 'LATE' THEN 1 ELSE 0 END) as late_count,
          SUM(CASE WHEN attendance_type = 'VACATION' OR status = 'VACATION' THEN 1 ELSE 0 END) as leave_used_days,
          SUM(COALESCE(overtime_hours, 0)) as total_overtime,
          SUM(COALESCE(work_hours, 0)) as total_work_hours
        FROM attendance
        WHERE employee_id = ?
          AND strftime('%Y-%m', work_date) = ?
      `).bind(t.employee_id, payPeriod).first<any>()

      const work_days = Number(agg?.work_days || 0)
      const absent_days = Number(agg?.absent_days || 0)
      const late_count = Number(agg?.late_count || 0)
      const leave_used_days = Number(agg?.leave_used_days || 0)
      const overtime_hours = Number(agg?.total_overtime || 0)

      // 연장근로수당 재계산
      const ot = calcOvertimePay({
        baseSalary: Number(t.base_salary || 0),
        monthlyWorkHours: otSettings.monthlyWorkHours,
        overtimeHours: overtime_hours,
        nightHours: 0,
        holidayHours: 0,
        overtimeMul: otSettings.overtimeMul,
        nightMul: otSettings.nightMul,
        holidayMul: otSettings.holidayMul,
        holidayOverMul: otSettings.holidayOverMul,
      })

      await c.env.DB.prepare(`
        UPDATE payroll
        SET work_days = ?,
            absent_days = ?,
            late_count = ?,
            leave_used_days = ?,
            overtime_hours = ?,
            overtime_pay = ?,
            attendance_synced_at = datetime('now'),
            updated_at = datetime('now')
        WHERE id = ?
      `).bind(work_days, absent_days, late_count, leave_used_days, overtime_hours, ot.overtime_pay, t.id).run()

      synced++
      details.push({
        payroll_id: t.id,
        employee_id: t.employee_id,
        work_days, absent_days, late_count, leave_used_days,
        overtime_hours, overtime_pay: ot.overtime_pay
      })
    }

    return c.json({
      success: true,
      data: {
        synced,
        total_targets: (targets || []).length,
        details: details.slice(0, 50)  // 처음 50개만
      }
    })
  } catch (err: any) {
    console.error('Failed to sync attendance:', err)
    return c.json({ success: false, error: '근태 동기화 실패', detail: '서버 오류가 발생했습니다' }, 500)
  }
})

// ============================================================================
// API: 4대보험 요율 수정/추가 (upsert)
// PUT /api/payroll/rates
// body: { year, insurance_type, total_rate, employee_rate, employer_rate, base, min_base, max_base, effective_from, effective_to }
// ============================================================================

export default coreRouter
