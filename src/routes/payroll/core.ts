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
  rateRefDate,
  parseDeductionOverrides,
  calcAbsentDeduction,
  getProrationContext,
  calcProratedInclusive,
  lookupIncomeTaxRow,
  diagnoseIncomeTax,
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

    // #558/#IDOR: 형제 /save(:245)와 동일하게 entityFilter로 자법인 직원만 로드. 타법인 급여/PII cross-tenant 열람 차단.
    const empEf = entityFilter(c)
    const emp = await c.env.DB.prepare(
      `SELECT id, name, base_salary, hourly_rate, overtime_daily_hours, overtime_work_days,
              dependents_count, children_under_20_count, income_tax_table_option, hire_date, resignation_date
       FROM employees WHERE id = ?${empEf.clause}`
    ).bind(employeeId, ...empEf.params).first<any>()
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

    // 0621: 결근은 지급에서 뺀다(공제가 아니라 지급 차감 — 과세·4대보험 base 도 함께 내려간다)
    const absent_deduction = calcAbsentDeduction(ot.hourly_wage, Number(body.absent_days || 0))

    const total_salary =
      base_salary + overtime_pay + night_pay + holiday_pay + annual_leave_pay + bonus +
      meal_total + transport_total + childcare_total + other_allowance - absent_deduction

    const taxable_pay =
      base_salary + overtime_pay + night_pay + holiday_pay + annual_leave_pay + bonus +
      tax_meal + tax_transport + tax_childcare + other_allowance - absent_deduction

    const dependents = Math.max(1, Number(emp.dependents_count || 1))
    const taxOption = String(emp.income_tax_table_option || '100')
    const year = Number(payPeriod.slice(0, 4)) || new Date().getFullYear()

    const previewOvRow = await c.env.DB.prepare(
      `SELECT deduction_overrides FROM payroll WHERE employee_id = ? AND pay_period = ?`
    ).bind(employeeId, payPeriod).first<{ deduction_overrides: string | null }>().catch(() => null)

    const deductions = await calcDeductions(c.env.DB, {
      taxablePay: taxable_pay,
      dependents,
      childrenUnder20: Math.max(0, Number(emp.children_under_20_count || 0)),
      taxOption,
      year,
      payPeriod,
      deductionOverrides: parseDeductionOverrides(previewOvRow?.deduction_overrides),
      applyNationalPension: empDefaults.insurance_apply_national_pension,
      applyHealth: empDefaults.insurance_apply_health,
      applyLongTermCare: empDefaults.insurance_apply_long_term_care,
      applyEmployment: empDefaults.insurance_apply_employment,
      applyIndustrialAccident: empDefaults.insurance_apply_industrial_accident,
      pensionBaseOverride: empDefaults.pension_base,
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
        // #509 일할근거: 월중 입사/퇴사 근무일 일할 컨텍스트(명세서/편집 화면 배지용). isPartial=false면 완전월(전액).
        prorationContext: {
          isPartial: prCtx.isPartial,
          workedWeekdays: prCtx.workedWeekdays,
          monthWeekdays: prCtx.monthWeekdays,
          ratio: prCtx.monthWeekdays > 0 ? Math.round((prCtx.workedWeekdays / prCtx.monthWeekdays) * 100) / 100 : 1,
        },
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
      `SELECT id, entity_id, base_salary, hourly_rate, overtime_daily_hours, overtime_work_days,
              dependents_count, children_under_20_count, income_tax_table_option, hire_date, resignation_date
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

    // 0621: 결근은 지급에서 뺀다. 시급은 연장·야간과 **같은 값**(ot.hourly_wage)을 쓴다.
    const absent_deduction = calcAbsentDeduction(ot.hourly_wage, Number(body.absent_days || 0))

    const total_salary =
      base_salary + overtime_pay + night_pay + holiday_pay + annual_leave_pay + bonus +
      meal_total + transport_total + childcare_total + other_allowance - absent_deduction

    const taxable_pay = total_salary - nontax_meal - nontax_transport - nontax_childcare

    const dependents = Math.max(1, Number(emp.dependents_count || 1))
    const taxOption = String(emp.income_tax_table_option || '100')
    const year = Number(payPeriod.slice(0, 4)) || new Date().getFullYear()

    // 0618(T2): 사람이 고정한 공제가 있으면 계산을 이긴다. 재계산해도 살아남아야 하므로 여기서 읽는다.
    //   body 에 키가 명시되면 그 값으로 교체(null = 해제), 없으면 DB 값을 그대로 유지한다.
    //   UPSERT 에는 **항상** 최종값을 쓴다 — 조건부 SET 을 만들면 "유지"와 "해제"가 구분되지 않는다.
    const ovRow = await c.env.DB.prepare(
      `SELECT deduction_overrides, deduction_overrides_at, deduction_overrides_by
         FROM payroll WHERE employee_id = ? AND pay_period = ?`
    ).bind(employeeId, payPeriod).first<{
      deduction_overrides: string | null
      deduction_overrides_at: string | null
      deduction_overrides_by: number | null
    }>().catch(() => null)
    const existingOvMeta = ovRow ? { at: ovRow.deduction_overrides_at, by: ovRow.deduction_overrides_by } : null
    const ovKeyGiven = Object.prototype.hasOwnProperty.call(body, 'deduction_overrides')
    const deductionOverrides = ovKeyGiven
      ? (body.deduction_overrides == null ? {} : parseDeductionOverrides(body.deduction_overrides))
      : parseDeductionOverrides(ovRow?.deduction_overrides)
    const ovJson = Object.keys(deductionOverrides).length ? JSON.stringify(deductionOverrides) : null
    const ovChanged = ovJson !== (ovRow?.deduction_overrides ?? null)

    const d = await calcDeductions(c.env.DB, {
      taxablePay: taxable_pay, dependents, taxOption, year, payPeriod,
      childrenUnder20: Math.max(0, Number(emp.children_under_20_count || 0)),
      deductionOverrides,
      applyNationalPension: empDefaults.insurance_apply_national_pension,
      applyHealth: empDefaults.insurance_apply_health,
      applyLongTermCare: empDefaults.insurance_apply_long_term_care,
      applyEmployment: empDefaults.insurance_apply_employment,
      applyIndustrialAccident: empDefaults.insurance_apply_industrial_accident,
      pensionBaseOverride: empDefaults.pension_base,
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
    // 별건A 교부가드: status가 PENDING이어도 이미 교부(published_at NOT NULL)된 급여는 재계산 덮어쓰기 차단.
    //   교부 후 명세서와 저장값이 어긋나는 무결성 훼손 방지. 재계산하려면 먼저 교부 취소(unpublish).
    const existingPayroll = await c.env.DB.prepare(
      `SELECT status, published_at FROM payroll WHERE employee_id = ? AND pay_period = ?`
    ).bind(employeeId, payPeriod).first<{ status: string; published_at: string | null }>()
    if (existingPayroll && existingPayroll.published_at != null) {
      return c.json({ success: false, error: '교부된 급여는 재계산·수정할 수 없습니다. 먼저 교부를 취소(unpublish)하세요.' }, 409)
    }
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
        deduction_overrides, deduction_overrides_at, deduction_overrides_by,
        absent_deduction, night_hours, holiday_hours,
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
        ?, ?, ?,
        ?, ?, ?,
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
        deduction_overrides=excluded.deduction_overrides,
        deduction_overrides_at=excluded.deduction_overrides_at,
        deduction_overrides_by=excluded.deduction_overrides_by,
        absent_deduction=excluded.absent_deduction,
        night_hours=excluded.night_hours,
        holiday_hours=excluded.holiday_hours,
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
      // 0618: 오버라이드 본문 + 누가/언제 고정했는지. 내용이 바뀐 경우에만 시각·작성자를 갱신한다
      //   (재계산 때마다 찍히면 "언제 사람이 손댔나"를 잃는다).
      ovJson,
      ovJson == null ? null : (ovChanged ? new Date().toISOString() : (existingOvMeta?.at ?? new Date().toISOString())),
      ovJson == null ? null : (ovChanged ? (user?.id || null) : (existingOvMeta?.by ?? user?.id ?? null)),
      absent_deduction, night_hours_in, holiday_hours_in,
      // 귀속 법인 = 직원의 entity (전체모드 ADMIN 이 세션값 0→1 로 찍으면 선명·청주 급여가 동산 귀속)
      notes, user?.id || null, emp.entity_id || getEntityId(c) || 1
    ).run()

    return c.json({
      success: true,
      data: {
        employee_id: employeeId, pay_period: payPeriod, net_pay,
        // #509 일할근거: 월중 입사/퇴사 근무일 일할 컨텍스트(편집 화면 배지용).
        prorationContext: {
          isPartial: prCtx.isPartial,
          workedWeekdays: prCtx.workedWeekdays,
          monthWeekdays: prCtx.monthWeekdays,
          ratio: prCtx.monthWeekdays > 0 ? Math.round((prCtx.workedWeekdays / prCtx.monthWeekdays) * 100) / 100 : 1,
        },
      },
    })
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
        `SELECT id, entity_id, base_salary, hourly_rate, overtime_daily_hours, overtime_work_days,
                dependents_count, children_under_20_count, income_tax_table_option, hire_date, resignation_date FROM employees WHERE id IN (${ph})`
      ).bind(...empIds).all<any>()
      for (const r of empRows || []) empRowMap.set(r.id, r)
    }
    // #389: 직원별 N+1(PRAGMA+SELECT) 제거 — 고정수당/보험토글·요율을 루프 밖 1회 prefetch
    const batchDefaultsMap = await loadAllEmployeeDefaults(c.env.DB, empIds)
    const batchRatesCache = await loadInsuranceRates(c.env.DB, rateRefDate(payPeriod, Number(payPeriod.slice(0, 4))))
    for (const emp of list) {
      // 이미 있으면 스킵
      if (existsSet.has(emp.id)) { skipped++; continue }

      // preview 로직 재사용 — 직원 고정수당 + 보험 토글을 기본값으로 반영
      const empRow = empRowMap.get(emp.id)
      const empDefaults = batchDefaultsMap.get(emp.id) || await loadEmployeeDefaults(c.env.DB, emp.id)
      const base_salary = Number(empRow?.base_salary || 0)
      const dependents = Math.max(1, Number(empRow?.dependents_count || 1))
      const childrenUnder20 = Math.max(0, Number(empRow?.children_under_20_count || 0))
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
        taxablePay: taxable_pay, dependents, childrenUnder20, taxOption, year, payPeriod,
        applyNationalPension: empDefaults.insurance_apply_national_pension,
        applyHealth: empDefaults.insurance_apply_health,
        applyLongTermCare: empDefaults.insurance_apply_long_term_care,
        applyEmployment: empDefaults.insurance_apply_employment,
        applyIndustrialAccident: empDefaults.insurance_apply_industrial_accident,
        pensionBaseOverride: empDefaults.pension_base,
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
        // 귀속 법인 = 직원 행의 entity_id. 전체모드(entityId 0)에서 세션값(→1)으로 찍으면 선명(2)·청주(3) 직원 급여가
        //   전부 동산 귀속이 되어 insuranceReports(p.entity_id = ?) 가 그 법인 신고서를 0건으로 만든다.
        d.total_deduction + fixed_other_deduction, net_pay, user?.id || null, empRow?.entity_id || getEntityId(c) || 1
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
    // 0622: dry_run=true 면 **집계만 하고 저장하지 않는다**.
    //   「불러오기 → 검토·수정 → 확정」 흐름을 위해. 근태를 바로 급여에 덮어쓰면
    //   틀린 값(결근 과다·휴일 누락)이 그대로 들어가고 되돌릴 근거가 남지 않는다.
    const dryRun = body.dry_run === true

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
             p.deduction_overrides,
             e.base_salary AS emp_base,
             COALESCE(e.overtime_daily_hours, 0) AS odh,
             COALESCE(e.overtime_work_days, 22) AS owd,
             e.dependents_count, e.children_under_20_count, e.income_tax_table_option,
             e.hire_date, e.resignation_date
      FROM payroll p
      JOIN employees e ON e.id = p.employee_id
      WHERE p.pay_period = ? AND p.status != 'PAID' AND p.published_at IS NULL${efP.clause}
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
          SELECT a.*,
            (CASE WHEN EXISTS (
                      -- 0623: 법인별 휴무. entity_id=0 은 전 법인 공통(법정공휴일),
                      --   >0 은 그 법인만(선명 여름휴가 2026-08-03~05 등).
                      SELECT 1 FROM holidays h
                       WHERE h.holiday_date = a.work_date
                         AND (h.entity_id = 0 OR h.entity_id = e.entity_id))
                    OR CAST(strftime('%w', a.work_date) AS INTEGER) IN (0, 6)
                  THEN 1 ELSE 0 END) AS is_hol
            , e.exclude_early_from_overtime AS exclude_early
          FROM attendance a
          JOIN employees e ON e.id = a.employee_id
          WHERE a.employee_id IN (${aggPh})
            AND strftime('%Y-%m', a.work_date) = ?
        )
        SELECT employee_id,
          COUNT(*) as total_days,
          SUM(CASE WHEN is_hol = 0 AND attendance_type NOT IN ('ABSENT', 'VACATION', 'HOLIDAY') THEN 1 ELSE 0 END) as work_days,
          SUM(CASE WHEN is_hol = 0 AND (attendance_type = 'ABSENT' OR status = 'ABSENT') THEN 1 ELSE 0 END) as absent_days,
          SUM(CASE WHEN is_hol = 0 AND attendance_type = 'LATE' THEN 1 ELSE 0 END) as late_count,
          SUM(CASE WHEN attendance_type = 'VACATION' OR status = 'VACATION' THEN 1 ELSE 0 END) as leave_used_days,
          -- 추가연장 = 비휴일의 연장근무(퇴근 후) + 조기출근(출근 전) 합산. 조기출근도 연장수당으로 지급(정책 2026-07-12).
          -- 0621: **결근으로 찍힌 날은 제외**한다. 결근일에 남아 있는 연장 기록까지 더해져
          --   "결근 4일인데 추가연장 24~26시간"이 나왔다(2026-09-17 이명순·김기섭 7월 실측).
          SUM(CASE WHEN is_hol = 0 AND attendance_type != 'ABSENT' AND COALESCE(status,'') != 'ABSENT'
                   -- 0624: 조기출근을 연장으로 인정하지 않기로 합의한 직원은 early_hours 를 뺀다.
                   --   근태 기록(early_hours)은 사실 그대로 두고 **지급 반영 여부만** 사람 축에서 정한다.
                   THEN COALESCE(overtime_hours, 0)
                        + (CASE WHEN COALESCE(exclude_early, 0) = 1 THEN 0 ELSE COALESCE(early_hours, 0) END)
                   ELSE 0 END) as total_overtime,
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
      const syncRatesCache = await loadInsuranceRates(c.env.DB, rateRefDate(payPeriod, syncYear))
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
        let hourlyWage = 0    // 0621: 결근 공제도 연장·야간과 **같은 시급**을 쓴다
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
          hourlyWage = inc.hourly_wage
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
          hourlyWage = ot.hourly_wage
        }

        // 총급여/과세/공제/실지급 일관 재계산 (고정수당 + 재계산 연장/야간/휴일)
        const meal = Number(t.meal_allowance || 0)
        const transport = Number(t.transportation_allowance || 0)
        const otherAllow = Number(t.other_allowance || 0)
        const annual = Number(t.annual_leave_pay || 0)
        const bonusVal = Number(t.bonus || 0)
        // 0621: 결근은 지급에서 뺀다(공제가 아니라 지급 차감 — 4대보험·소득세 base 도 함께 내려간다)
        const absent_deduction = calcAbsentDeduction(hourlyWage, absent_days)
        const total_salary = newBase + overtime_pay + nightPay + holidayPay + meal + transport + otherAllow + annual + bonusVal
          - absent_deduction
        const nontax = Number(t.nontax_meal || 0) + Number(t.nontax_transport || 0) + Number(t.nontax_childcare || 0)
        const taxable_pay = total_salary - nontax

        const empDefaults = syncDefaultsMap.get(Number(t.employee_id)) || await loadEmployeeDefaults(c.env.DB, t.employee_id)
        const d = await calcDeductions(c.env.DB, {
          taxablePay: taxable_pay,
          dependents: Math.max(1, Number(t.dependents_count || 1)),
          childrenUnder20: Math.max(0, Number(t.children_under_20_count || 0)),
          taxOption: String(t.income_tax_table_option || '100'),
          year: syncYear,
          payPeriod,
          deductionOverrides: parseDeductionOverrides((t as any).deduction_overrides),
          applyNationalPension: empDefaults.insurance_apply_national_pension,
          applyHealth: empDefaults.insurance_apply_health,
          applyLongTermCare: empDefaults.insurance_apply_long_term_care,
          applyEmployment: empDefaults.insurance_apply_employment,
          applyIndustrialAccident: empDefaults.insurance_apply_industrial_accident,
          pensionBaseOverride: empDefaults.pension_base,
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
                absent_deduction = ?, night_hours = ?, holiday_hours = ?,
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
            absent_deduction, nightHrs, holidayHrs,
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
          work_days, absent_days, late_count, leave_used_days, absent_deduction,
          night_hours: nightHrs, holiday_hours: holidayHrs,
          overtime_hours, extra_overtime_hours: extraOT, overtime_pay, base_salary: newBase, total_salary, net_pay
        })
      }

      // UPDATE 배치 실행 (D1 batch 한도 고려 80개씩 분할). dry_run 이면 쓰지 않는다.
      if (!dryRun) {
        for (let i = 0; i < syncStmts.length; i += 80) {
          await c.env.DB.batch(syncStmts.slice(i, i + 80))
        }
      }
    }

    return c.json({
      success: true,
      data: {
        synced: dryRun ? 0 : synced,
        dry_run: dryRun,
        preview_count: synced,
        total_targets: (targets || []).length,
        // dry_run 은 화면이 표를 채워야 하므로 전량 반환(급여 인원은 수십 명 규모)
        details: dryRun ? details : details.slice(0, 50)
      }
    })
  } catch (err: any) {
    console.error('Failed to sync attendance:', err)
    return c.json({ success: false, error: '근태 동기화 실패', detail: '서버 오류가 발생했습니다' }, 500)
  }
})

// ============================================================================
// API: 이카운트 대조 — 급여대장을 받아 사람별 차이 + **원인**을 짚는다 (읽기 전용)
// POST /api/payroll/reconcile  body: { pay_period, rows: [{ employee_code?, name, total?, np?,hi?,ltc?,ei?,it?,lt? }] }
//
// 왜 필요한가 (2026-09-17):
//   차이가 나는 원인이 셋인데(적용비율·부양가족·지급액) 화면이 그걸 구분해 주지 않아,
//   매달 사람이 붙어서 스크립트로 풀어야 했다. 4대보험은 생년월일·직급으로 규칙 경고를 달 수
//   있었지만 **적용비율이 80 인지 120 인지는 이카운트와 대조해야만 안다** — 그래서 경고가 아니라
//   대조를 화면에 올린다. 판정만 하고 **아무것도 덮어쓰지 않는다**(고치는 건 엑셀 입력·직원 설정).
// ============================================================================
coreRouter.post('/reconcile', async (c) => {
  try {
    const body = await c.req.json<any>()
    const payPeriod = String(body.pay_period || '')
    if (!/^\d{4}-\d{2}$/.test(payPeriod)) return c.json({ success: false, error: 'pay_period(YYYY-MM) 필요' }, 400)
    const rows: any[] = Array.isArray(body.rows) ? body.rows : []
    if (!rows.length) return c.json({ success: false, error: '대조할 행이 없습니다' }, 400)

    const efP = entityFilter(c, 'p')
    const mesRows = (await c.env.DB.prepare(`
      SELECT p.id, p.employee_id, p.total_salary, p.taxable_pay, p.other_deduction,
             p.national_pension AS np, p.health_insurance AS hi, p.long_term_care_insurance AS ltc,
             p.employment_insurance AS ei, p.income_tax AS it, p.local_tax AS lt,
             p.net_pay, p.deduction_overrides,
             e.name, e.external_name, e.employee_code,
             e.dependents_count, e.children_under_20_count, e.income_tax_table_option
        FROM payroll p JOIN employees e ON e.id = p.employee_id
       WHERE p.pay_period = ?${efP.clause}
    `).bind(payPeriod, ...efP.params).all<any>()).results || []

    // 매칭 — 성명 · 이카운트 이름(별칭) · 사번. 공백은 무시한다(「MAUNG MAUNG」↔「MAUNGMAUNG」).
    const norm = (s: any) => String(s ?? '').replace(/\s+/g, '').toLowerCase()
    const byKey = new Map<string, any>()
    for (const m of mesRows) {
      for (const k of [m.name, m.external_name, m.employee_code]) {
        if (k && !byKey.has(norm(k))) byKey.set(norm(k), m)
      }
    }

    const year = Number(payPeriod.slice(0, 4))
    // 같은 과세급여 구간을 여러 번 조회하지 않는다
    const rowCache = new Map<number, number[] | null>()
    const getRow = async (taxable: number) => {
      if (!rowCache.has(taxable)) rowCache.set(taxable, await lookupIncomeTaxRow(c.env.DB, year, taxable))
      return rowCache.get(taxable) ?? null
    }

    const DED = ['np', 'hi', 'ltc', 'ei', 'it', 'lt'] as const
    const matched: any[] = []
    const unmatched: string[] = []
    for (const r of rows) {
      const key = norm(r.employee_code) || norm(r.name)
      const m = byKey.get(norm(r.name)) || byKey.get(norm(r.employee_code)) || byKey.get(key)
      if (!m) { unmatched.push(String(r.name || r.employee_code || '(이름 없음)')); continue }

      const num = (v: any) => (v == null || v === '' ? null : Number(v))
      const ec: Record<string, number | null> = { total: num(r.total) }
      for (const k of DED) ec[k] = num((r as any)[k])

      const diff: Record<string, number | null> = {}
      diff.total = ec.total == null ? null : ec.total - Number(m.total_salary || 0)
      for (const k of DED) diff[k] = ec[k] == null ? null : (ec[k] as number) - Number(m[k] || 0)

      // 실지급 = 지급총액 − (4대보험+소득세+지방세) − 기타공제. 기타공제는 이카운트 대장에 없으므로 MES 값을 쓴다.
      let ecNet: number | null = null
      if (ec.total != null && DED.every(k => ec[k] != null)) {
        ecNet = (ec.total as number) - DED.reduce((s, k) => s + (ec[k] as number), 0) - Number(m.other_deduction || 0)
      }

      let diagnosis: any = null
      if (ec.it != null && diff.it !== 0) {
        diagnosis = diagnoseIncomeTax(await getRow(Number(m.taxable_pay || 0)), ec.it as number, {
          taxOption: String(m.income_tax_table_option || '100'),
          dependents: Math.max(1, Number(m.dependents_count || 1)),
          children: Math.max(0, Number(m.children_under_20_count || 0)),
        })
      }

      matched.push({
        employee_id: m.employee_id, name: m.name, ec_name: r.name,
        taxable_pay: Number(m.taxable_pay || 0),
        current: {
          taxOption: String(m.income_tax_table_option || '100'),
          dependents: Math.max(1, Number(m.dependents_count || 1)),
          children: Math.max(0, Number(m.children_under_20_count || 0)),
          pinned: !!m.deduction_overrides,
        },
        mes: { total: Number(m.total_salary || 0), net: Number(m.net_pay || 0), ...Object.fromEntries(DED.map(k => [k, Number(m[k] || 0)])) },
        ec: { ...ec, net: ecNet },
        diff: { ...diff, net: ecNet == null ? null : Number(m.net_pay || 0) - ecNet },
        diagnosis,
      })
    }

    const absSum = (f: (x: any) => number | null) =>
      matched.reduce((s, x) => { const v = f(x); return s + (v == null ? 0 : Math.abs(v)) }, 0)
    return c.json({
      success: true,
      data: {
        pay_period: payPeriod,
        matched_count: matched.length,
        unmatched,
        summary: {
          tax_exact: matched.filter(x => x.diff.it === 0).length,
          tax_setting: matched.filter(x => x.diagnosis?.kind === 'setting').length,
          tax_pay: matched.filter(x => x.diagnosis?.kind === 'pay').length,
          net_abs_sum: absSum(x => x.diff.net),
          net_exact: matched.filter(x => x.diff.net === 0).length,
        },
        rows: matched,
      },
    })
  } catch (err: any) {
    console.error('Failed to reconcile payroll:', err)
    return c.json({ success: false, error: '대조 실패', detail: '서버 오류가 발생했습니다' }, 500)
  }
})

// ============================================================================
// API: 공제만 재계산 (지급 항목은 손대지 않는다)
// POST /api/payroll/recalc-deductions   body: { pay_period, dry_run?, employee_ids? }
//
// 왜 sync-attendance 로는 안 되는가 (2026-09-17):
//   간이세액표를 고시표로 교체한 뒤 소득세를 다시 계산해야 했는데, sync-attendance 는 **근태를
//   다시 집계**하므로 이카운트에서 손으로 맞춰 둔 야간·휴일·결근이 통째로 되돌아간다
//   (dry_run 으로 실측: 24명 변동 — 니나잉 휴일수당 493,360 → 0). 「공제만 다시」가 필요하다.
//   저장된 taxable_pay 를 그대로 쓰고 calcDeductions 한 곳만 다시 태우므로
//   4대보험은 같은 요율·같은 과세급여라 값이 그대로 나오고, 바뀌는 것은 소득세·지방세뿐이다.
//   오버라이드(📌)는 calcDeductions 안에서 재적용되므로 여기서도 살아남는다.
// ============================================================================
coreRouter.post('/recalc-deductions', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const body = await c.req.json<any>()
    const payPeriod = String(body.pay_period || '')
    if (!/^\d{4}-\d{2}$/.test(payPeriod)) return c.json({ success: false, error: 'pay_period(YYYY-MM) 필요' }, 400)
    const dryRun = body.dry_run === true
    const employeeIds: number[] = Array.isArray(body.employee_ids) ? body.employee_ids : []

    // #470: entity 필터 = 쓰기 게이트. 여기서 고른 id 로만 UPDATE 한다.
    const efP = entityFilter(c, 'p')
    let q = `
      SELECT p.id, p.employee_id, p.taxable_pay, p.total_salary, p.other_deduction, p.deduction_overrides,
             p.income_tax AS old_it, p.local_tax AS old_lt, p.total_deduction AS old_total, p.net_pay AS old_net,
             p.national_pension AS old_np, p.health_insurance AS old_hi,
             p.long_term_care_insurance AS old_ltc, p.employment_insurance AS old_ei,
             e.name, e.dependents_count, e.children_under_20_count, e.income_tax_table_option
      FROM payroll p
      JOIN employees e ON e.id = p.employee_id
      WHERE p.pay_period = ? AND p.status != 'PAID' AND p.published_at IS NULL${efP.clause}
    `
    const binds: any[] = [payPeriod, ...efP.params]
    if (employeeIds.length) {
      q += ` AND p.employee_id IN (${employeeIds.map(() => '?').join(',')})`
      binds.push(...employeeIds)
    }
    const targets = (await c.env.DB.prepare(q).bind(...binds).all<any>()).results || []

    const year = Number(payPeriod.slice(0, 4))
    const ratesCache = await loadInsuranceRates(c.env.DB, rateRefDate(payPeriod, year))
    const stmts: D1PreparedStatement[] = []
    const details: any[] = []
    let taxChanged = 0, insChanged = 0

    for (const t of targets) {
      const empDefaults = await loadEmployeeDefaults(c.env.DB, t.employee_id)
      const d = await calcDeductions(c.env.DB, {
        taxablePay: Number(t.taxable_pay || 0),
        dependents: Math.max(1, Number(t.dependents_count || 1)),
        childrenUnder20: Math.max(0, Number(t.children_under_20_count || 0)),
        taxOption: String(t.income_tax_table_option || '100'),
        year, payPeriod,
        deductionOverrides: parseDeductionOverrides(t.deduction_overrides),
        applyNationalPension: empDefaults.insurance_apply_national_pension,
        applyHealth: empDefaults.insurance_apply_health,
        applyLongTermCare: empDefaults.insurance_apply_long_term_care,
        applyEmployment: empDefaults.insurance_apply_employment,
        applyIndustrialAccident: empDefaults.insurance_apply_industrial_accident,
        pensionBaseOverride: empDefaults.pension_base,
        ratesCache,
      })
      const otherDeduction = Number(t.other_deduction || 0)
      const total_deduction = d.total_deduction + otherDeduction
      const net_pay = Number(t.total_salary || 0) - total_deduction

      const dIt = d.income_tax - Number(t.old_it || 0)
      const dIns = (d.national_pension - Number(t.old_np || 0)) + (d.health_insurance - Number(t.old_hi || 0)) +
        (d.long_term_care_insurance - Number(t.old_ltc || 0)) + (d.employment_insurance - Number(t.old_ei || 0))
      if (dIt !== 0) taxChanged++
      if (dIns !== 0) insChanged++

      details.push({
        payroll_id: t.id, employee_id: t.employee_id, name: t.name,
        taxable_pay: Number(t.taxable_pay || 0),
        income_tax: { before: Number(t.old_it || 0), after: d.income_tax, diff: dIt },
        local_tax: { before: Number(t.old_lt || 0), after: d.local_tax },
        insurance_diff: dIns,
        net_pay: { before: Number(t.old_net || 0), after: net_pay, diff: net_pay - Number(t.old_net || 0) },
      })

      if (!dryRun) {
        stmts.push(c.env.DB.prepare(`
          UPDATE payroll
             SET national_pension = ?, health_insurance = ?, long_term_care_insurance = ?,
                 employment_insurance = ?, income_tax = ?, local_tax = ?,
                 employer_national_pension = ?, employer_health_insurance = ?, employer_long_term_care = ?,
                 employer_employment_insurance = ?, employer_industrial_accident = ?,
                 total_deduction = ?, net_pay = ?, updated_at = datetime('now')
           WHERE id = ?
        `).bind(
          d.national_pension, d.health_insurance, d.long_term_care_insurance,
          d.employment_insurance, d.income_tax, d.local_tax,
          d.employer_national_pension, d.employer_health_insurance, d.employer_long_term_care,
          d.employer_employment_insurance, d.employer_industrial_accident,
          total_deduction, net_pay, t.id
        ))
      }
    }

    if (!dryRun) {
      for (let i = 0; i < stmts.length; i += 80) await c.env.DB.batch(stmts.slice(i, i + 80))
    }

    return c.json({
      success: true,
      data: {
        pay_period: payPeriod, dry_run: dryRun,
        total_targets: targets.length,
        updated: dryRun ? 0 : stmts.length,
        income_tax_changed: taxChanged,
        insurance_changed: insChanged,   // 0 이어야 정상 — 지급액도 요율도 안 건드렸으므로
        details,
      },
    })
  } catch (err: any) {
    console.error('Failed to recalc deductions:', err)
    return c.json({ success: false, error: '공제 재계산 실패', detail: '서버 오류가 발생했습니다' }, 500)
  }
})

// ============================================================================
// API: 4대보험 요율 수정/추가 (upsert)
// PUT /api/payroll/rates
// body: { year, insurance_type, total_rate, employee_rate, employer_rate, base, min_base, max_base, effective_from, effective_to }
// ============================================================================

export default coreRouter
