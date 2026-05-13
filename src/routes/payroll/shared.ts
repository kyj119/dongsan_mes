/**
 * payroll/shared.ts — 급여 모듈 공유 헬퍼 + 타입
 * 원본 payroll.ts 라인 19~350에서 추출 (2026-04-15)
 * core.ts / settings.ts 가 import해서 사용
 */
// 라우트 핸들러가 아닌 공유 코드만 — 즉 라우터 인스턴스 없음

// ============================================================================
// Settings 헬퍼
// ============================================================================
export async function getSetting(db: D1Database, key: string, fallback: string): Promise<string> {
  const row = await db.prepare(`SELECT setting_value FROM settings WHERE setting_key = ?`).bind(key).first<{ setting_value: string }>().catch(() => null)
  return row?.setting_value ?? fallback
}

export async function getSettings(db: D1Database, keys: string[]): Promise<Record<string, string>> {
  const placeholders = keys.map(() => '?').join(',')
  const rows = await db.prepare(`SELECT setting_key, setting_value FROM settings WHERE setting_key IN (${placeholders})`).bind(...keys).all<{ setting_key: string; setting_value: string }>().catch(() => ({ results: [] as { setting_key: string; setting_value: string }[] }))
  const map: Record<string, string> = {}
  for (const r of (rows.results || [])) map[r.setting_key] = r.setting_value
  return map
}

// ============================================================================
// 추가근무 자동계산 (근로기준법 기준)
// 통상시급 = 기본급 / 월 소정근로시간 (기본 209)
// 연장근로: 통상시급 × 1.5 × 시간
// 야간근로: 통상시급 × 0.5 × 시간 (가산분만 — 실근로 시간은 이미 기본급/연장에 포함)
// 휴일근로: 8시간 이내 1.5배, 초과분 2.0배
// ============================================================================
export interface OvertimeInput {
  baseSalary: number
  monthlyWorkHours: number   // 기본 209
  overtimeHours: number      // 연장근로시간
  nightHours: number         // 야간근로시간
  holidayHours: number       // 휴일근로시간 (총)
  overtimeMul: number        // 기본 1.5
  nightMul: number           // 기본 0.5 (가산)
  holidayMul: number         // 8시간 이내 기본 1.5
  holidayOverMul: number     // 8시간 초과 기본 2.0
}

export interface OvertimeResult {
  hourly_wage: number
  overtime_pay: number
  night_pay: number
  holiday_pay: number
}

export function calcOvertimePay(input: OvertimeInput): OvertimeResult {
  const hourlyRaw = input.monthlyWorkHours > 0 ? input.baseSalary / input.monthlyWorkHours : 0
  const hourly_wage = Math.round(hourlyRaw)

  const overtime_pay = Math.floor(hourlyRaw * input.overtimeMul * input.overtimeHours / 10) * 10
  const night_pay = Math.floor(hourlyRaw * input.nightMul * input.nightHours / 10) * 10

  // 휴일 8시간 이내/초과 분리
  const holidayNormal = Math.min(input.holidayHours, 8)
  const holidayOver = Math.max(0, input.holidayHours - 8)
  const holiday_pay =
    Math.floor(hourlyRaw * input.holidayMul * holidayNormal / 10) * 10 +
    Math.floor(hourlyRaw * input.holidayOverMul * holidayOver / 10) * 10

  return { hourly_wage, overtime_pay, night_pay, holiday_pay }
}

export async function loadOvertimeSettings(db: D1Database) {
  const s = await getSettings(db, [
    'payroll_default_work_hours',
    'payroll_overtime_multiplier',
    'payroll_night_multiplier',
    'payroll_holiday_multiplier',
    'payroll_holiday_over_multiplier',
  ])
  return {
    monthlyWorkHours: Number(s.payroll_default_work_hours || 209),
    overtimeMul: Number(s.payroll_overtime_multiplier || 1.5),
    nightMul: Number(s.payroll_night_multiplier || 0.5),
    holidayMul: Number(s.payroll_holiday_multiplier || 1.5),
    holidayOverMul: Number(s.payroll_holiday_over_multiplier || 2.0),
  }
}

// ============================================================================
// 4대보험 / 소득세 계산기
// ============================================================================

export interface InsuranceRate {
  insurance_type: string
  total_rate: number
  employee_rate: number
  employer_rate: number
  base: string
  min_base: number | null
  max_base: number | null
}

export interface CalcInput {
  taxablePay: number       // 과세 급여 (총급여 - 비과세)
  dependents: number       // 부양가족 수 (본인 포함)
  taxOption: string        // '80' | '100' | '120'
  year: number
  // 4대보험 적용 토글 (employees.insurance_apply_*)
  // undefined는 "적용"으로 간주하여 하위 호환 유지
  applyNationalPension?: boolean
  applyHealth?: boolean
  applyLongTermCare?: boolean
  applyEmployment?: boolean
  applyIndustrialAccident?: boolean
}

export interface CalcResult {
  national_pension: number
  health_insurance: number
  long_term_care_insurance: number
  employment_insurance: number
  income_tax: number
  local_tax: number
  employer_national_pension: number
  employer_health_insurance: number
  employer_long_term_care: number
  employer_employment_insurance: number
  employer_industrial_accident: number
  total_deduction: number
  // 디버그 정보
  applied_tax_row_id?: number | null
  notes?: string
}

/**
 * 근로소득세 공식 계산 (간이세액표 빈 구간 fallback 용도)
 * 국세청 "근로소득 간이세액표" 계산 방식 (2023년 개정 이후):
 * 1) 연간 급여 = 월급 × 12
 * 2) 근로소득공제 차감 → 근로소득금액
 * 3) 인적공제 (150만 × 공제대상가족수) 차감 → 과세표준
 * 4) 누진 세율 적용 → 산출세액
 * 5) 근로소득세액공제 차감 (한도 있음)
 * 6) 월 원천징수세액 = 결정세액 ÷ 12
 * 부양가족수 = 본인 포함 공제대상자 수
 */
export function calcOfficialMonthlyTax(monthlyPay: number, dependents: number): number {
  if (monthlyPay <= 1060000) return 0 // 월 106만 이하 비과세 (연 1272만 이하)

  const annual = monthlyPay * 12

  // 1) 근로소득공제
  let workDeduction = 0
  if (annual <= 5000000) workDeduction = annual * 0.7
  else if (annual <= 15000000) workDeduction = 3500000 + (annual - 5000000) * 0.4
  else if (annual <= 45000000) workDeduction = 7500000 + (annual - 15000000) * 0.15
  else if (annual <= 100000000) workDeduction = 12000000 + (annual - 45000000) * 0.05
  else workDeduction = 14750000 + (annual - 100000000) * 0.02
  workDeduction = Math.min(workDeduction, 20000000) // 한도 2천만

  const workIncome = annual - workDeduction

  // 2) 인적공제 (본인+부양가족 × 150만)
  const personalDeduction = 1500000 * Math.max(1, dependents)

  // 3) 과세표준 (연금보험료공제 등 생략 — 간이 계산)
  const taxableBase = Math.max(0, workIncome - personalDeduction)

  // 4) 누진 세율 (2023~ 기준)
  let grossTax = 0
  if (taxableBase <= 14000000) grossTax = taxableBase * 0.06
  else if (taxableBase <= 50000000) grossTax = 840000 + (taxableBase - 14000000) * 0.15
  else if (taxableBase <= 88000000) grossTax = 6240000 + (taxableBase - 50000000) * 0.24
  else if (taxableBase <= 150000000) grossTax = 15360000 + (taxableBase - 88000000) * 0.35
  else if (taxableBase <= 300000000) grossTax = 37060000 + (taxableBase - 150000000) * 0.38
  else if (taxableBase <= 500000000) grossTax = 94060000 + (taxableBase - 300000000) * 0.4
  else if (taxableBase <= 1000000000) grossTax = 174060000 + (taxableBase - 500000000) * 0.42
  else grossTax = 384060000 + (taxableBase - 1000000000) * 0.45

  // 5) 근로소득세액공제
  let creditBase = grossTax <= 1300000 ? grossTax * 0.55 : 715000 + (grossTax - 1300000) * 0.3
  // 공제 한도 (총급여 구간별)
  let creditCap = 740000
  if (annual > 33000000 && annual <= 70000000) {
    creditCap = Math.max(660000, 740000 - (annual - 33000000) * 0.008 * (74 / 66))
  } else if (annual > 70000000 && annual <= 120000000) {
    creditCap = Math.max(500000, 660000 - (annual - 70000000) * 0.5 / 100)
  } else if (annual > 120000000) {
    creditCap = Math.max(200000, 500000 - (annual - 120000000) * 0.5 / 100)
  }
  const taxCredit = Math.min(creditBase, creditCap)

  const finalAnnualTax = Math.max(0, grossTax - taxCredit)
  const monthly = Math.floor(finalAnnualTax / 12 / 10) * 10
  return monthly
}

/** 소득세 간이세액표 lookup. 부양가족 11명 이상은 dependents_11. */
export async function lookupIncomeTax(db: D1Database, year: number, monthlyPay: number, dependents: number): Promise<{ tax: number; rowId: number | null }> {
  const safeDeps = Math.max(1, Math.min(11, dependents))
  const col = `dependents_${safeDeps}`
  // 구간 매칭: monthly_pay_min <= monthlyPay < monthly_pay_max
  const row = await db.prepare(
    `SELECT id, ${col} as tax FROM income_tax_table
     WHERE year = ? AND monthly_pay_min <= ? AND monthly_pay_max > ?
     ORDER BY monthly_pay_min DESC LIMIT 1`
  ).bind(year, monthlyPay, monthlyPay).first<{ id: number; tax: number }>().catch(() => null)
  if (row) return { tax: row.tax || 0, rowId: row.id }
  // fallback: 표 없으면 공식 계산 (국세청 간이세액표 공식 기준, 80/100/120% 선택은 별도 적용)
  return { tax: calcOfficialMonthlyTax(monthlyPay, safeDeps), rowId: null }
}

export async function calcDeductions(db: D1Database, input: CalcInput): Promise<CalcResult> {
  const { taxablePay, dependents, taxOption, year } = input
  // 토글: 명시되지 않으면 true (적용) — 기존 호출자 하위호환
  const applyNp = input.applyNationalPension !== false
  const applyHi = input.applyHealth !== false
  const applyLtc = input.applyLongTermCare !== false
  const applyEi = input.applyEmployment !== false
  const applyIa = input.applyIndustrialAccident !== false

  // 1) 4대보험 요율 조회
  const ratesRow = await db.prepare(
    `SELECT insurance_type, total_rate, employee_rate, employer_rate, base, min_base, max_base
     FROM insurance_rates WHERE year = ?`
  ).bind(year).all<InsuranceRate>().catch(() => ({ results: [] as InsuranceRate[] }))
  const rates: Record<string, InsuranceRate> = {}
  for (const r of (ratesRow.results || [])) rates[r.insurance_type] = r

  // 2) 국민연금 — 상하한 적용
  let pensionBase = taxablePay
  const np = rates['NATIONAL_PENSION']
  if (np) {
    if (np.min_base != null) pensionBase = Math.max(pensionBase, np.min_base)
    if (np.max_base != null) pensionBase = Math.min(pensionBase, np.max_base)
  }
  const national_pension = (applyNp && np) ? Math.floor(pensionBase * np.employee_rate / 100 / 10) * 10 : 0
  const employer_national_pension = (applyNp && np) ? Math.floor(pensionBase * np.employer_rate / 100 / 10) * 10 : 0

  // 3) 건강보험
  const hi = rates['HEALTH']
  const health_insurance = (applyHi && hi) ? Math.floor(taxablePay * hi.employee_rate / 100 / 10) * 10 : 0
  const employer_health_insurance = (applyHi && hi) ? Math.floor(taxablePay * hi.employer_rate / 100 / 10) * 10 : 0
  const total_health = (applyHi && hi) ? Math.floor(taxablePay * hi.total_rate / 100 / 10) * 10 : 0

  // 4) 장기요양 — 건강보험료 기준 (건강보험 미적용이면 장기요양도 자동 0)
  const ltc = rates['LONG_TERM_CARE']
  const ltcActive = applyHi && applyLtc
  const long_term_care_insurance = (ltcActive && ltc) ? Math.floor(total_health * ltc.employee_rate / 100 / 10) * 10 : 0
  const employer_long_term_care = (ltcActive && ltc) ? Math.floor(total_health * ltc.employer_rate / 100 / 10) * 10 : 0

  // 5) 고용보험 (실업급여)
  const ei = rates['EMPLOYMENT']
  const employment_insurance = (applyEi && ei) ? Math.floor(taxablePay * ei.employee_rate / 100 / 10) * 10 : 0
  const employer_employment_insurance = (applyEi && ei) ? Math.floor(taxablePay * ei.employer_rate / 100 / 10) * 10 : 0

  // 6) 산재 (전액 회사부담)
  const ia = rates['INDUSTRIAL_ACCIDENT']
  const employer_industrial_accident = (applyIa && ia) ? Math.floor(taxablePay * ia.employer_rate / 100 / 10) * 10 : 0

  // 7) 소득세 — 간이세액표 lookup
  const { tax: rawTax, rowId } = await lookupIncomeTax(db, year, taxablePay, dependents)
  const optionMul = taxOption === '80' ? 0.8 : taxOption === '120' ? 1.2 : 1.0
  const income_tax = Math.floor(rawTax * optionMul / 10) * 10

  // 8) 지방세 — 소득세의 10%
  const local_tax = Math.floor(income_tax * 0.1 / 10) * 10

  const total_deduction =
    national_pension + health_insurance + long_term_care_insurance +
    employment_insurance + income_tax + local_tax

  return {
    national_pension,
    health_insurance,
    long_term_care_insurance,
    employment_insurance,
    income_tax,
    local_tax,
    employer_national_pension,
    employer_health_insurance,
    employer_long_term_care,
    employer_employment_insurance,
    employer_industrial_accident,
    total_deduction,
    applied_tax_row_id: rowId,
  }
}

// ============================================================================
// Helper: employees 테이블에서 고정수당/보험토글을 안전하게 조회
// 마이그레이션 0112 미적용 환경에서도 동작하도록 PRAGMA로 컬럼 존재 확인
// ============================================================================
export interface EmployeeDefaults {
  position_allowance: number
  vehicle_allowance: number
  meal_allowance_fixed: number
  special_bonus_fixed: number
  other_allowance_fixed: number
  mutual_aid_fee: number
  other_deduction_fixed: number
  insurance_apply_national_pension: boolean
  insurance_apply_health: boolean
  insurance_apply_long_term_care: boolean
  insurance_apply_employment: boolean
  insurance_apply_industrial_accident: boolean
}

export async function loadEmployeeDefaults(db: D1Database, employeeId: number): Promise<EmployeeDefaults> {
  // 기본값 (0112 미적용 또는 null인 경우)
  const defaults: EmployeeDefaults = {
    position_allowance: 0,
    vehicle_allowance: 0,
    meal_allowance_fixed: 0,
    special_bonus_fixed: 0,
    other_allowance_fixed: 0,
    mutual_aid_fee: 0,
    other_deduction_fixed: 0,
    insurance_apply_national_pension: true,
    insurance_apply_health: true,
    insurance_apply_long_term_care: true,
    insurance_apply_employment: true,
    insurance_apply_industrial_accident: true,
  }
  try {
    const { results: colInfo } = await db.prepare(`PRAGMA table_info(employees)`).all()
    const cols = new Set((colInfo as { name: string }[]).map((r) => r.name))
    const pickNum = ['position_allowance','vehicle_allowance','meal_allowance_fixed','special_bonus_fixed','other_allowance_fixed','mutual_aid_fee','other_deduction_fixed']
    const pickBool = ['insurance_apply_national_pension','insurance_apply_health','insurance_apply_long_term_care','insurance_apply_employment','insurance_apply_industrial_accident']
    const selectable = [...pickNum, ...pickBool].filter((c) => cols.has(c))
    if (selectable.length === 0) return defaults

    const row = await db.prepare(
      `SELECT ${selectable.join(', ')} FROM employees WHERE id = ?`
    ).bind(employeeId).first<any>()
    if (!row) return defaults
    const d = defaults as unknown as Record<string, number | boolean>
    for (const k of pickNum) {
      if (row[k] != null) d[k] = Number(row[k]) || 0
    }
    for (const k of pickBool) {
      if (row[k] != null) d[k] = Number(row[k]) === 1
    }
  } catch (_) { /* 컬럼 없음 — defaults 그대로 */ }
  return defaults
}
