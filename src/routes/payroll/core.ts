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
  calcInclusivePay,
  loadOvertimeSettings,
  calcDeductions,
  loadEmployeeDefaults,
  loadAllEmployeeDefaults,
  loadInsuranceRates,
  getProrationContext,
  calcProratedInclusive,
} from './shared'
import { getEntityId, entityFilter } from '../../utils/entityFilter'

const coreRouter = new Hono<HonoEnv>()
// 급여 계산(급여 산출 결과)은 전 라우트 ADMIN/MANAGER 전용
coreRouter.use('/*', authMiddleware, requireRole('ADMIN', 'MANAGER'))

// A: 급여 계산 — 원본 라인 357-700 + 800-1013
coreRouter.post('/preview', async (c) => {
  try {
    const body = await c.req.json<any>()
    const employeeId = Number(body.employee_id)
    const payPeriod = String(body.pay_period || '') // YYYY-MM
    if (!employeeId || !payPeriod) return c.json({ success: false, error: 'employee_id, pay_period 필요' }, 400)

    const emp = await c.env.DB.prepare(
      `SELECT id, name, base_salary, hourly_rate, overtime_daily_hours, overtime_work_days,
              dependents_count, children_under_20_count, income_tax_table_option, hire_date, resignation_date
       FROM employees WHERE id = ?`
    ).bind(employeeId).first<any>()
    if (!emp) return c.json({ success: false, error: '직원 없음' }, 404)

    // 입사/퇴사 월중 일할 컨텍스트 (완전월 = isPartial false → 기존 전액 로직)
    const prCtx = getProrationContext(payPeriod, emp.hire_date ?? null, emp.resignation_date ?? null)

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

    const base_input = Number(body.base_salary ?? emp.base_salary ?? 0)

    // 고정연장시간: overtime_daily_hours × overtime_work_days (기본 0)
    const fixedOvertimeHours = (Number(emp.overtime_daily_hours) || 0) * (Number(emp.overtime_work_days) || 22)
    const night_hours = Number(body.night_hours || 0)
    const holiday_hours = Number(body.holiday_hours || 0)
    const otSettings = await loadOvertimeSettings(c.env.DB)
    // 고정연장(포괄임금) 직원: 입력 기본급=포괄총액 → 통상시급(÷225.5) 분해 (batch/sync와 일관, Phase 1b).
    //   추가 연장 = body.overtime_hours(기본 0). 일반 직원: 기본급 그대로 + body 연장/야간/휴일 가산.
    let base_salary: number
    let overtime_hours: number
    let extra_overtime_hours = 0   // 추가연장(근태 실측분) — 기본연장 = overtime_hours - extra_overtime_hours
    let ot: { hourly_wage: number; overtime_pay: number; night_pay: number; holiday_pay: number }
    if (prCtx.isPartial) {
      // 월중 입사/퇴사: 근무일 단위 일할(포괄·일반 공통). 기준=emp.base_salary 원본(body 재로드 이중분해 방지).
      const totalOT = body.overtime_hours != null ? Number(body.overtime_hours) : fixedOvertimeHours
      const extraOT = Math.max(0, totalOT - fixedOvertimeHours)
      extra_overtime_hours = extraOT
      const pro = calcProratedInclusive({
        inclusiveBase: Number(emp.base_salary || 0),
        baseMonthlyHours: otSettings.monthlyWorkHours,
        fixedOTHoursFull: fixedOvertimeHours,
        overtimeDailyHours: Number(emp.overtime_daily_hours) || 0,
        extraOTHours: extraOT,
        nightHours: night_hours,
        holidayHours: holiday_hours,
        overtimeMul: otSettings.overtimeMul,
        nightMul: otSettings.nightMul,
        holidayMul: otSettings.holidayMul,
        holidayOverMul: otSettings.holidayOverMul,
        ctx: prCtx,
      })
      base_salary = pro.regular_base
      overtime_hours = pro.overtime_hours
      ot = { hourly_wage: pro.hourly_wage, overtime_pay: pro.overtime_pay, night_pay: pro.night_pay, holiday_pay: pro.holiday_pay }
    } else if (fixedOvertimeHours > 0) {
      // 포괄총액 원본(emp.base_salary) 기준 분해 — body.base_salary(편집 시 저장된 분해값)를 쓰면 이중분해됨.
      // body.overtime_hours = 총 연장시간(고정+추가) → 추가분만 추출 → 저장값 재로드해도 동일(라운드트립 일관).
      const inclusiveBase = Number(emp.base_salary || 0)
      const totalOT = body.overtime_hours != null ? Number(body.overtime_hours) : fixedOvertimeHours
      const extraOT = Math.max(0, totalOT - fixedOvertimeHours)
      extra_overtime_hours = extraOT
      const inc = calcInclusivePay({
        inclusiveBase,
        baseMonthlyHours: otSettings.monthlyWorkHours,
        fixedOTHours: fixedOvertimeHours,
        extraOTHours: extraOT,
        nightHours: night_hours,
        holidayHours: holiday_hours,
        overtimeMul: otSettings.overtimeMul,
        nightMul: otSettings.nightMul,
        holidayMul: otSettings.holidayMul,
        holidayOverMul: otSettings.holidayOverMul,
      })
      base_salary = inc.regular_base
      overtime_hours = inc.overtime_hours
      ot = { hourly_wage: inc.hourly_wage, overtime_pay: inc.overtime_pay, night_pay: inc.night_pay, holiday_pay: inc.holiday_pay }
    } else {
      base_salary = base_input
      overtime_hours = body.overtime_hours != null ? Number(body.overtime_hours) : 0
      extra_overtime_hours = overtime_hours   // 일반 직원: 전액이 추가연장(고정연장 없음)
      ot = calcOvertimePay({
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
    }

    // body에 금액이 명시적으로 있으면 그것을 우선, 아니면 자동계산값 사용
    const overtime_pay = body.overtime_pay != null ? Number(body.overtime_pay) : ot.overtime_pay
    const night_pay = body.night_pay != null ? Number(body.night_pay) : ot.night_pay
    const holiday_pay = body.holiday_pay != null ? Number(body.holiday_pay) : ot.holiday_pay

    const annual_leave_pay = Number(body.annual_leave_pay || 0)
    // 고정상여: body.bonus가 없으면 employees.special_bonus_fixed 사용
    const bonus = body.bonus != null ? Number(body.bonus) : Number(empDefaults.special_bonus_fixed || 0)
    // 기타수당: body.other_allowance가 없으면 직책수당+차량유지비+기타수당_고정 합 (월중 입사/퇴사여도 전액)
    const fixedOtherAllowanceDefault =
      empDefaults.position_allowance +
      empDefaults.vehicle_allowance +
      empDefaults.other_allowance_fixed
    const other_allowance = body.other_allowance != null ? Number(body.other_allowance) : fixedOtherAllowanceDefault

    // 식대: body.meal이 없으면 employees.meal_allowance_fixed 사용 (월중 입사/퇴사여도 전액)
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
          extra_overtime_hours,                                        // 추가연장(근태 실측: 연장+조기출근)
          fixed_overtime_hours: Math.max(0, overtime_hours - extra_overtime_hours),  // 기본연장(포괄임금 내재)
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
    // #IDOR: entityFilter로 자법인 직원만 로드 (ADMIN=entityId 0 → bypass). 타 법인 직원 급여 변조 차단.
    const empEf = entityFilter(c)
    const emp = await c.env.DB.prepare(
      `SELECT id, base_salary, hourly_rate, overtime_daily_hours, overtime_work_days,
              dependents_count, income_tax_table_option, hire_date, resignation_date
       FROM employees WHERE id = ?${empEf.clause}`
    ).bind(employeeId, ...empEf.params).first<any>()
    if (!emp) return c.json({ success: false, error: '직원 없음' }, 404)

    // 입사/퇴사 월중 일할 컨텍스트 (완전월 = isPartial false → 기존 전액 로직)
    const prCtx = getProrationContext(payPeriod, emp.hire_date ?? null, emp.resignation_date ?? null)

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

    const base_input = Number(body.base_salary ?? emp.base_salary ?? 0)

    // 고정연장시간: overtime_daily_hours × overtime_work_days (기본 0)
    const fixedOvertimeHours = (Number(emp.overtime_daily_hours) || 0) * (Number(emp.overtime_work_days) || 22)
    const night_hours_in = Number(body.night_hours || 0)
    const holiday_hours_in = Number(body.holiday_hours || 0)
    const otSettings = await loadOvertimeSettings(c.env.DB)
    // 고정연장(포괄임금) 직원: 입력 기본급=포괄총액 → 통상시급(÷225.5) 분해 (batch/sync와 일관, Phase 1b).
    //   추가 연장 = body.overtime_hours(기본 0). 일반 직원: 기본급 그대로 + body 연장/야간/휴일 가산.
    let base_salary: number
    let overtime_hours_calc: number
    let extra_overtime_hours = 0   // 추가연장(근태 실측분) — 기본/추가 분해 표기용. 기본연장 = overtime_hours - extra_overtime_hours
    let ot: { hourly_wage: number; overtime_pay: number; night_pay: number; holiday_pay: number }
    if (prCtx.isPartial) {
      // 월중 입사/퇴사: 근무일 단위 일할(포괄·일반 공통). 기준=emp.base_salary 원본(body 재로드 이중분해 방지).
      const totalOT = body.overtime_hours != null ? Number(body.overtime_hours) : fixedOvertimeHours
      const extraOT = Math.max(0, totalOT - fixedOvertimeHours)
      extra_overtime_hours = extraOT
      const pro = calcProratedInclusive({
        inclusiveBase: Number(emp.base_salary || 0),
        baseMonthlyHours: otSettings.monthlyWorkHours,
        fixedOTHoursFull: fixedOvertimeHours,
        overtimeDailyHours: Number(emp.overtime_daily_hours) || 0,
        extraOTHours: extraOT,
        nightHours: night_hours_in,
        holidayHours: holiday_hours_in,
        overtimeMul: otSettings.overtimeMul,
        nightMul: otSettings.nightMul,
        holidayMul: otSettings.holidayMul,
        holidayOverMul: otSettings.holidayOverMul,
        ctx: prCtx,
      })
      base_salary = pro.regular_base
      overtime_hours_calc = pro.overtime_hours
      ot = { hourly_wage: pro.hourly_wage, overtime_pay: pro.overtime_pay, night_pay: pro.night_pay, holiday_pay: pro.holiday_pay }
    } else if (fixedOvertimeHours > 0) {
      // 포괄총액 원본(emp.base_salary) 기준 분해 — body.base_salary(편집 시 저장된 분해값)를 쓰면 이중분해됨.
      // body.overtime_hours = 총 연장시간(고정+추가) → 추가분만 추출 → 저장값 재로드해도 동일(라운드트립 일관).
      const inclusiveBase = Number(emp.base_salary || 0)
      const totalOT = body.overtime_hours != null ? Number(body.overtime_hours) : fixedOvertimeHours
      const extraOT = Math.max(0, totalOT - fixedOvertimeHours)
      extra_overtime_hours = extraOT
      const inc = calcInclusivePay({
        inclusiveBase,
        baseMonthlyHours: otSettings.monthlyWorkHours,
        fixedOTHours: fixedOvertimeHours,
        extraOTHours: extraOT,
        nightHours: night_hours_in,
        holidayHours: holiday_hours_in,
        overtimeMul: otSettings.overtimeMul,
        nightMul: otSettings.nightMul,
        holidayMul: otSettings.holidayMul,
        holidayOverMul: otSettings.holidayOverMul,
      })
      base_salary = inc.regular_base
      overtime_hours_calc = inc.overtime_hours
      ot = { hourly_wage: inc.hourly_wage, overtime_pay: inc.overtime_pay, night_pay: inc.night_pay, holiday_pay: inc.holiday_pay }
    } else {
      base_salary = base_input
      overtime_hours_calc = body.overtime_hours != null ? Number(body.overtime_hours) : 0
      extra_overtime_hours = overtime_hours_calc   // 일반 직원: 전액이 추가연장(고정연장 없음)
      ot = calcOvertimePay({
        baseSalary: base_salary,
        monthlyWorkHours: otSettings.monthlyWorkHours,
        overtimeHours: overtime_hours_calc,
        nightHours: night_hours_in,
        holidayHours: holiday_hours_in,
        overtimeMul: otSettings.overtimeMul,
        nightMul: otSettings.nightMul,
        holidayMul: otSettings.holidayMul,
        holidayOverMul: otSettings.holidayOverMul,
      })
    }

    const overtime_pay = body.overtime_pay != null ? Number(body.overtime_pay) : ot.overtime_pay
    const night_pay = body.night_pay != null ? Number(body.night_pay) : ot.night_pay
    const holiday_pay = body.holiday_pay != null ? Number(body.holiday_pay) : ot.holiday_pay
    const annual_leave_pay = Number(body.annual_leave_pay || 0)
    // 고정상여 기본값: employees.special_bonus_fixed
    const bonus = body.bonus != null ? Number(body.bonus) : Number(empDefaults.special_bonus_fixed || 0)
    // 기타수당 기본값: 직책수당+차량유지비+기타수당_고정 (월중 입사/퇴사여도 전액)
    const fixedOtherAllowanceDefault =
      empDefaults.position_allowance +
      empDefaults.vehicle_allowance +
      empDefaults.other_allowance_fixed
    const other_allowance = body.other_allowance != null ? Number(body.other_allowance) : fixedOtherAllowanceDefault

    // 식대 기본값: employees.meal_allowance_fixed (월중 입사/퇴사여도 전액)
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
    const overtime_hours = overtime_hours_calc
    const absent_days = Number(body.absent_days || 0)
    const late_count = Number(body.late_count || 0)
    const leave_used_days = Number(body.leave_used_days || 0)
    // 고정 공제 기본값: 상조회비 + 기타공제_고정
    const fixedOtherDeductionDefault = empDefaults.mutual_aid_fee + empDefaults.other_deduction_fixed
    const other_deduction = body.other_deduction != null ? Number(body.other_deduction) : fixedOtherDeductionDefault

    const total_deduction = d.total_deduction + other_deduction
    const net_pay = total_salary - total_deduction
    const notes = String(body.notes || '')

    // #B1 급여확정잠금: 확정(승인/지급) 급여는 재계산 덮어쓰기 차단.
    //   approve/pay가 status를 바꾼 뒤 동일 employee+period로 /save 재호출 시 net_pay 등 재무필드 변조 방지.
    const existingPayroll = await c.env.DB.prepare(
      `SELECT status FROM payroll WHERE employee_id = ? AND pay_period = ?`
    ).bind(employeeId, payPeriod).first<{ status: string }>()
    if (existingPayroll && existingPayroll.status !== 'PENDING') {
      return c.json({ success: false, error: '확정(승인/지급)된 급여는 수정할 수 없습니다. 먼저 승인을 취소하세요.' }, 409)
    }

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
        work_days, overtime_hours, extra_overtime_hours, absent_days, late_count, leave_used_days,
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
        ?, ?, ?, ?, ?, ?,
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
        extra_overtime_hours=excluded.extra_overtime_hours,
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
      work_days, overtime_hours, extra_overtime_hours, absent_days, late_count, leave_used_days,
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
    // 월중 퇴사자 자동 포함: status=ACTIVE + 해당 급여월 퇴사자(status 무관) — 퇴사월 급여 누락 방지 후 일할.
    const empQuery = `SELECT e.id FROM employees e
      WHERE e.is_deleted = 0
        AND (e.status = 'ACTIVE' OR (e.resignation_date IS NOT NULL AND substr(e.resignation_date, 1, 7) = ?))${ef.clause}`
    const employees = await c.env.DB.prepare(empQuery).bind(payPeriod, ...ef.params).all<{ id: number }>()
    const list = employees.results || []

    const user = c.get('user')
    let created = 0
    let skipped = 0
    // #350: 루프 불변값 hoist — 직원과 무관해 매 iteration 재조회 불필요 (N×2 쿼리 제거, 결과값 불변)
    const otSettings = await loadOvertimeSettings(c.env.DB)
    const batchSettings = await getSettings(c.env.DB, ['payroll_meal_allowance_nontax_max'])
    const mealMax = Number(batchSettings.payroll_meal_allowance_nontax_max || 200000)
    // #350: exists·empRow 직원별 조회(N+1) → IN절 prefetch (결과값 불변, INSERT는 순차 유지)
    const empIds = list.map((e) => e.id)
    const existsSet = new Set<number>()
    const empRowMap = new Map<number, any>()
    if (empIds.length > 0) {
      const ph = empIds.map(() => '?').join(',')
      const { results: existRows } = await c.env.DB.prepare(
        `SELECT employee_id FROM payroll WHERE pay_period = ? AND employee_id IN (${ph})`
      ).bind(payPeriod, ...empIds).all<{ employee_id: number }>()
      for (const r of existRows || []) existsSet.add(r.employee_id)
      const { results: empRows } = await c.env.DB.prepare(
        `SELECT id, base_salary, hourly_rate, overtime_daily_hours, overtime_work_days,
                dependents_count, income_tax_table_option, hire_date, resignation_date FROM employees WHERE id IN (${ph})`
      ).bind(...empIds).all<any>()
      for (const r of empRows || []) empRowMap.set(r.id, r)
    }
    // #389: 직원별 N+1(PRAGMA+SELECT) 제거 — 고정수당/보험토글·요율을 루프 밖 1회 prefetch
    const batchDefaultsMap = await loadAllEmployeeDefaults(c.env.DB, empIds)
    const batchRatesCache = await loadInsuranceRates(c.env.DB, Number(payPeriod.slice(0, 4)))
    for (const emp of list) {
      // 이미 있으면 스킵
      if (existsSet.has(emp.id)) { skipped++; continue }

      // preview 로직 재사용 — 직원 고정수당 + 보험 토글을 기본값으로 반영
      const empRow = empRowMap.get(emp.id)
      const empDefaults = batchDefaultsMap.get(emp.id) || await loadEmployeeDefaults(c.env.DB, emp.id)
      const base_salary = Number(empRow?.base_salary || 0)
      const dependents = Math.max(1, Number(empRow?.dependents_count || 1))
      const taxOption = String(empRow?.income_tax_table_option || '100')
      const year = Number(payPeriod.slice(0, 4))

      // 고정연장시간 자동 계산
      const batchFixedOtHours = (Number(empRow?.overtime_daily_hours) || 0) * (Number(empRow?.overtime_work_days) || 22)
      // 입사/퇴사 월중 일할 컨텍스트 (완전월 = isPartial false → 기존 전액 로직)
      const prCtx = getProrationContext(payPeriod, empRow?.hire_date ?? null, empRow?.resignation_date ?? null)
      // 해당 월 재직일 0(입사 익월 전 / 이미 퇴사) → 급여 레코드 생성 안 함
      if (prCtx.isPartial && prCtx.workedWeekdays === 0) { skipped++; continue }
      // 고정연장(포괄임금) 직원: 입력 기본급=포괄 총액 → 통상시급(÷225.5) 기준 분해.
      //   payBase=기본급(시급×209), batch_overtime_pay=고정연장수당(총액−기본급). 일괄생성 시점엔 추가연장 0.
      // 일반 직원: 분해 없음(payBase=base_salary, 연장수당 0 — 근태는 sync에서 반영).
      // 월중 입사/퇴사(isPartial): 근무일 단위 일할(재직평일×8 + 주휴, 연장 포함) — 일반/포괄 공통.
      let payBase = base_salary
      let batch_overtime_pay = 0
      let batchOtHours = 0
      if (prCtx.isPartial) {
        const pro = calcProratedInclusive({
          inclusiveBase: base_salary,
          baseMonthlyHours: otSettings.monthlyWorkHours,
          fixedOTHoursFull: batchFixedOtHours,
          overtimeDailyHours: Number(empRow?.overtime_daily_hours) || 0,
          extraOTHours: 0, nightHours: 0, holidayHours: 0,
          overtimeMul: otSettings.overtimeMul,
          nightMul: otSettings.nightMul,
          holidayMul: otSettings.holidayMul,
          holidayOverMul: otSettings.holidayOverMul,
          ctx: prCtx,
        })
        payBase = pro.regular_base
        batch_overtime_pay = pro.overtime_pay
        batchOtHours = pro.overtime_hours
      } else if (batchFixedOtHours > 0) {
        const inc = calcInclusivePay({
          inclusiveBase: base_salary,
          baseMonthlyHours: otSettings.monthlyWorkHours,
          fixedOTHours: batchFixedOtHours,
          extraOTHours: 0,
          nightHours: 0,
          holidayHours: 0,
          overtimeMul: otSettings.overtimeMul,
          nightMul: otSettings.nightMul,
          holidayMul: otSettings.holidayMul,
          holidayOverMul: otSettings.holidayOverMul,
        })
        payBase = inc.regular_base
        batch_overtime_pay = inc.overtime_pay
        batchOtHours = inc.overtime_hours
      }

      // 고정 수당 — 월중 입사/퇴사여도 전액 지급(일할 대상=기본급만). 식대·직책수당·차량유지비·기타·상여 모두 전액.
      const bonus_fixed = empDefaults.special_bonus_fixed
      const other_allowance_fixed_total =
        empDefaults.position_allowance + empDefaults.vehicle_allowance + empDefaults.other_allowance_fixed
      const meal_total = empDefaults.meal_allowance_fixed

      const nontax_meal = Math.min(meal_total, mealMax)
      const tax_meal = meal_total - nontax_meal

      const total_salary = payBase + batch_overtime_pay + bonus_fixed + other_allowance_fixed_total + meal_total
      const taxable_pay = payBase + batch_overtime_pay + bonus_fixed + other_allowance_fixed_total + tax_meal

      const d = await calcDeductions(c.env.DB, {
        taxablePay: taxable_pay, dependents, taxOption, year,
        applyNationalPension: empDefaults.insurance_apply_national_pension,
        applyHealth: empDefaults.insurance_apply_health,
        applyLongTermCare: empDefaults.insurance_apply_long_term_care,
        applyEmployment: empDefaults.insurance_apply_employment,
        applyIndustrialAccident: empDefaults.insurance_apply_industrial_accident,
        ratesCache: batchRatesCache,
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
        emp.id, payPeriod, pay_date, payBase,
        batch_overtime_pay, batchOtHours,
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
    // #390: existsSet(실제 스킵 ID)으로 조회 — 기존 pay_period 전체 조회는 created까지 포함해 과대보고
    let skippedNames: string[] = []
    if (existsSet.size > 0) {
      const sph = [...existsSet].map(() => '?').join(',')
      const { results: skippedRows } = await c.env.DB.prepare(
        `SELECT name FROM employees WHERE id IN (${sph})`
      ).bind(...existsSet).all<{ name: string }>()
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

    // 대상 급여 레코드 조회 — 직원 포괄총액(emp_base)·고정연장 설정 + 저장된 수당/비과세 함께 로드
    // (sync에서 total_salary/공제/실지급까지 일관 재계산하기 위함)
    // #470: entity 필터 필수 — 타법인 payroll 재계산/UPDATE(cross-tenant write IDOR) 차단.
    //   UPDATE는 여기서 로드한 target id로만 실행되므로 SELECT 게이트가 곧 쓰기 게이트. entityId=0(ADMIN)=전체.
    const efP = entityFilter(c, 'p')
    let targetQuery = `
      SELECT p.id, p.employee_id,
             p.meal_allowance, p.transportation_allowance, p.other_allowance,
             p.annual_leave_pay, p.bonus, p.night_pay, p.holiday_pay,
             p.nontax_meal, p.nontax_transport, p.nontax_childcare, p.other_deduction,
             e.base_salary AS emp_base,
             COALESCE(e.overtime_daily_hours, 0) AS odh,
             COALESCE(e.overtime_work_days, 22) AS owd,
             e.dependents_count, e.income_tax_table_option,
             e.hire_date, e.resignation_date
      FROM payroll p
      JOIN employees e ON e.id = p.employee_id
      WHERE p.pay_period = ? AND p.status != 'PAID'${efP.clause}
    `
    const targetParams: any[] = [payPeriod, ...efP.params]
    if (employeeIds.length > 0) {
      targetQuery += ` AND p.employee_id IN (${employeeIds.map(() => '?').join(',')})`
      targetParams.push(...employeeIds)
    }
    const { results: targets } = await c.env.DB.prepare(targetQuery).bind(...targetParams).all<any>()

    let synced = 0
    const details: any[] = []

    // overtime 요율 설정 로드
    const otSettings = await loadOvertimeSettings(c.env.DB)

    const targetList = (targets || [])
    if (targetList.length > 0) {
      // #350 근태 집계: 직원별 N+1 SELECT → IN절 단일 GROUP BY (CASE/SUM 식 동일, 출력 동등).
      //   미출근 직원은 GROUP BY 결과에 없음 → aggMap 미존재 시 0 기본값으로 기존 .first() NULL→0과 동일.
      const aggEmpIds = targetList.map((t) => t.employee_id)
      const aggPh = aggEmpIds.map(() => '?').join(',')
      // 휴일 판정은 날짜에서 파생(단일 소스): 공휴일 달력(holidays) + 토·일.
      //   휴일 날짜의 work_hours → 휴일근로, 비휴일의 overtime_hours → 연장, 휴일은 결근/근무일에서 제외.
      //   → attendance 레코드 mutate(재분류) 불필요. 달력만 바꾸면 자동 반영.
      const { results: aggRows } = await c.env.DB.prepare(`
        WITH att AS (
          SELECT *,
            (CASE WHEN work_date IN (SELECT holiday_date FROM holidays)
                    OR CAST(strftime('%w', work_date) AS INTEGER) IN (0, 6)
                  THEN 1 ELSE 0 END) AS is_hol
          FROM attendance
          WHERE employee_id IN (${aggPh})
            AND strftime('%Y-%m', work_date) = ?
        )
        SELECT employee_id,
          COUNT(*) as total_days,
          SUM(CASE WHEN is_hol = 0 AND attendance_type NOT IN ('ABSENT', 'VACATION', 'HOLIDAY') THEN 1 ELSE 0 END) as work_days,
          SUM(CASE WHEN is_hol = 0 AND (attendance_type = 'ABSENT' OR status = 'ABSENT') THEN 1 ELSE 0 END) as absent_days,
          SUM(CASE WHEN is_hol = 0 AND attendance_type = 'LATE' THEN 1 ELSE 0 END) as late_count,
          SUM(CASE WHEN attendance_type = 'VACATION' OR status = 'VACATION' THEN 1 ELSE 0 END) as leave_used_days,
          -- 추가연장 = 비휴일의 연장근무(퇴근 후) + 조기출근(출근 전) 합산. 조기출근도 연장수당으로 지급(정책 2026-07-12).
          SUM(CASE WHEN is_hol = 0 THEN COALESCE(overtime_hours, 0) + COALESCE(early_hours, 0) ELSE 0 END) as total_overtime,
          SUM(CASE WHEN is_hol = 1 THEN COALESCE(work_hours, 0) ELSE 0 END) as total_holiday,
          SUM(COALESCE(caps_night_min, 0)) / 60.0 as total_night,
          SUM(COALESCE(work_hours, 0)) as total_work_hours
        FROM att
        GROUP BY employee_id
      `).bind(...aggEmpIds, payPeriod).all<any>()
      const aggMap: Record<number, any> = {}
      for (const a of (aggRows || [])) aggMap[a.employee_id as number] = a

      const syncYear = Number(payPeriod.slice(0, 4)) || new Date().getFullYear()
      // #389: 직원별 N+1(PRAGMA+SELECT·요율) 제거 — 루프 밖 1회 prefetch
      const syncDefaultsMap = await loadAllEmployeeDefaults(c.env.DB, targetList.map((t: any) => Number(t.employee_id)))
      const syncRatesCache = await loadInsuranceRates(c.env.DB, syncYear)
      const syncStmts: D1PreparedStatement[] = []
      for (const t of targetList) {
        const agg = aggMap[t.employee_id as number]
        const work_days = Number(agg?.work_days || 0)
        const absent_days = Number(agg?.absent_days || 0)
        const late_count = Number(agg?.late_count || 0)
        const leave_used_days = Number(agg?.leave_used_days || 0)
        const extraOT = Number(agg?.total_overtime || 0)    // 실제 근태 연장시간
        const nightHrs = Number(agg?.total_night || 0)      // 야간근로시간 (caps_night_min/60)
        const holidayHrs = Number(agg?.total_holiday || 0)  // 휴일근로시간

        const empBase = Number(t.emp_base || 0)
        const fixedOTHours = Number(t.odh || 0) * Number(t.owd || 22)

        // 연장/야간/휴일수당 + 기본급 분해 재계산 (야간·휴일은 근태 기준 가산)
        // 월중 입사/퇴사(isPartial): 근무일 일할 — 매 sync가 emp.base_salary 원본으로 재계산하므로 필수.
        //   (수당/비과세는 payroll 저장값 유지 → 생성 시 일할된 값 그대로, 이중일할 없음)
        const prCtx = getProrationContext(payPeriod, t.hire_date ?? null, t.resignation_date ?? null)
        let newBase: number, overtime_pay: number, overtime_hours: number
        let nightPay: number, holidayPay: number
        if (prCtx.isPartial) {
          const pro = calcProratedInclusive({
            inclusiveBase: empBase,
            baseMonthlyHours: otSettings.monthlyWorkHours,
            fixedOTHoursFull: fixedOTHours,
            overtimeDailyHours: Number(t.odh) || 0,
            extraOTHours: extraOT,
            nightHours: nightHrs,
            holidayHours: holidayHrs,
            overtimeMul: otSettings.overtimeMul,
            nightMul: otSettings.nightMul,
            holidayMul: otSettings.holidayMul,
            holidayOverMul: otSettings.holidayOverMul,
            ctx: prCtx,
          })
          newBase = pro.regular_base
          overtime_pay = pro.overtime_pay
          overtime_hours = pro.overtime_hours
          nightPay = pro.night_pay
          holidayPay = pro.holiday_pay
        } else if (fixedOTHours > 0) {
          // 고정연장(포괄임금): 통상시급(÷225.5) 기준 분해 + 추가연장/야간/휴일 가산
          const inc = calcInclusivePay({
            inclusiveBase: empBase,
            baseMonthlyHours: otSettings.monthlyWorkHours,
            fixedOTHours,
            extraOTHours: extraOT,
            nightHours: nightHrs,
            holidayHours: holidayHrs,
            overtimeMul: otSettings.overtimeMul,
            nightMul: otSettings.nightMul,
            holidayMul: otSettings.holidayMul,
            holidayOverMul: otSettings.holidayOverMul,
          })
          newBase = inc.regular_base
          overtime_pay = inc.overtime_pay
          overtime_hours = inc.overtime_hours
          nightPay = inc.night_pay
          holidayPay = inc.holiday_pay
        } else {
          // 일반 직원: 기본급 그대로 + 근태 연장/야간/휴일 가산
          const ot = calcOvertimePay({
            baseSalary: empBase,
            monthlyWorkHours: otSettings.monthlyWorkHours,
            overtimeHours: extraOT,
            nightHours: nightHrs,
            holidayHours: holidayHrs,
            overtimeMul: otSettings.overtimeMul,
            nightMul: otSettings.nightMul,
            holidayMul: otSettings.holidayMul,
            holidayOverMul: otSettings.holidayOverMul,
          })
          newBase = empBase
          overtime_pay = ot.overtime_pay
          overtime_hours = extraOT
          nightPay = ot.night_pay
          holidayPay = ot.holiday_pay
        }

        // 총급여/과세/공제/실지급 일관 재계산 (고정수당 + 재계산 연장/야간/휴일)
        const meal = Number(t.meal_allowance || 0)
        const transport = Number(t.transportation_allowance || 0)
        const otherAllow = Number(t.other_allowance || 0)
        const annual = Number(t.annual_leave_pay || 0)
        const bonusVal = Number(t.bonus || 0)
        const total_salary = newBase + overtime_pay + nightPay + holidayPay + meal + transport + otherAllow + annual + bonusVal
        const nontax = Number(t.nontax_meal || 0) + Number(t.nontax_transport || 0) + Number(t.nontax_childcare || 0)
        const taxable_pay = total_salary - nontax

        const empDefaults = syncDefaultsMap.get(Number(t.employee_id)) || await loadEmployeeDefaults(c.env.DB, t.employee_id)
        const d = await calcDeductions(c.env.DB, {
          taxablePay: taxable_pay,
          dependents: Math.max(1, Number(t.dependents_count || 1)),
          taxOption: String(t.income_tax_table_option || '100'),
          year: syncYear,
          applyNationalPension: empDefaults.insurance_apply_national_pension,
          applyHealth: empDefaults.insurance_apply_health,
          applyLongTermCare: empDefaults.insurance_apply_long_term_care,
          applyEmployment: empDefaults.insurance_apply_employment,
          applyIndustrialAccident: empDefaults.insurance_apply_industrial_accident,
          ratesCache: syncRatesCache,
        })
        const otherDeduction = Number(t.other_deduction || 0)
        const total_deduction = d.total_deduction + otherDeduction
        const net_pay = total_salary - total_deduction

        syncStmts.push(
          c.env.DB.prepare(`
            UPDATE payroll
            SET base_salary = ?, overtime_hours = ?, extra_overtime_hours = ?, overtime_pay = ?,
                night_pay = ?, holiday_pay = ?,
                work_days = ?, absent_days = ?, late_count = ?, leave_used_days = ?,
                taxable_pay = ?, total_salary = ?,
                national_pension = ?, health_insurance = ?, long_term_care_insurance = ?,
                employment_insurance = ?, income_tax = ?, local_tax = ?,
                employer_national_pension = ?, employer_health_insurance = ?, employer_long_term_care = ?,
                employer_employment_insurance = ?, employer_industrial_accident = ?,
                total_deduction = ?, net_pay = ?,
                attendance_synced_at = datetime('now'), updated_at = datetime('now')
            WHERE id = ?
          `).bind(
            newBase, overtime_hours, extraOT, overtime_pay,
            nightPay, holidayPay,
            work_days, absent_days, late_count, leave_used_days,
            taxable_pay, total_salary,
            d.national_pension, d.health_insurance, d.long_term_care_insurance,
            d.employment_insurance, d.income_tax, d.local_tax,
            d.employer_national_pension, d.employer_health_insurance, d.employer_long_term_care,
            d.employer_employment_insurance, d.employer_industrial_accident,
            total_deduction, net_pay,
            t.id
          )
        )

        synced++
        details.push({
          payroll_id: t.id,
          employee_id: t.employee_id,
          work_days, absent_days, late_count, leave_used_days,
          overtime_hours, extra_overtime_hours: extraOT, overtime_pay, base_salary: newBase, total_salary, net_pay
        })
      }

      // UPDATE 배치 실행 (D1 batch 한도 고려 80개씩 분할)
      for (let i = 0; i < syncStmts.length; i += 80) {
        await c.env.DB.batch(syncStmts.slice(i, i + 80))
      }
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
