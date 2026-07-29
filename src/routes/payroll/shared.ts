/**
 * payroll/shared.ts — 급여 모듈 공유 헬퍼 + 타입
 * 원본 payroll.ts 라인 19~350에서 추출 (2026-04-15)
 * core.ts / settings.ts 가 import해서 사용
 */
// 라우트 핸들러가 아닌 공유 코드만 — 즉 라우터 인스턴스 없음

// ============================================================================
// Settings 헬퍼
// ============================================================================
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

// ============================================================================
// 고정연장(포괄임금) 분해 계산
// 입력 기본급 = 포괄 총액(고정연장 30분 포함). 프론트(직원수정·근로계약)와 동일 로직.
//   통상시급 = round(총액 / (209 + 고정OT시간 × 연장배율))      // 0.5×22×1.5 → ÷225.5
//   기본급(regular) = 시급 × 209
//   고정연장수당 = 총액 − 기본급                                  // 분해, 합 = 총액(정확)
//   추가연장수당 = 시급 × 연장배율 × 실제근태연장시간            // 근태 발생분 별도 가산
//   → overtime_pay = 고정연장수당 + 추가연장수당
// ============================================================================
export interface InclusivePayInput {
  inclusiveBase: number      // 입력 기본급(포괄 총액)
  baseMonthlyHours: number   // 월 소정근로시간 (기본 209)
  fixedOTHours: number       // 고정연장 시간 = overtime_daily_hours × overtime_work_days (예: 11)
  extraOTHours: number       // 실제 근태 연장시간 (일괄생성=0, 근태동기화=attendance overtime_hours)
  nightHours: number
  holidayHours: number
  overtimeMul: number
  nightMul: number
  holidayMul: number
  holidayOverMul: number
}
export interface InclusivePayResult {
  hourly_wage: number
  regular_base: number       // 분해된 기본급 → payroll.base_salary
  overtime_pay: number       // 고정연장수당 + 추가연장수당
  overtime_hours: number     // 고정OT + 추가OT
  night_pay: number
  holiday_pay: number
}
export function calcInclusivePay(input: InclusivePayInput): InclusivePayResult {
  const otPremiumHours = input.fixedOTHours * input.overtimeMul       // 11 × 1.5 = 16.5
  const divisor = input.baseMonthlyHours + otPremiumHours             // 209 + 16.5 = 225.5
  const hourly = divisor > 0 ? Math.round(input.inclusiveBase / divisor) : 0
  const regular_base = hourly * input.baseMonthlyHours                // 시급 × 209
  const fixedOTPay = input.inclusiveBase - regular_base               // 총액 − 기본급 (정확 분해)
  const extraOTPay = Math.floor(hourly * input.overtimeMul * input.extraOTHours / 10) * 10
  const overtime_pay = fixedOTPay + extraOTPay
  const overtime_hours = input.fixedOTHours + input.extraOTHours
  const night_pay = Math.floor(hourly * input.nightMul * input.nightHours / 10) * 10
  const holidayNormal = Math.min(input.holidayHours, 8)
  const holidayOver = Math.max(0, input.holidayHours - 8)
  const holiday_pay =
    Math.floor(hourly * input.holidayMul * holidayNormal / 10) * 10 +
    Math.floor(hourly * input.holidayOverMul * holidayOver / 10) * 10
  return { hourly_wage: hourly, regular_base, overtime_pay, overtime_hours, night_pay, holiday_pay }
}

// ============================================================================
// 입사/퇴사 월중 일할계산 (근무일 단위)
// 재직기간(입사일~퇴사일 ∩ 급여월)의 평일(월~금)마다 기본 8h + 고정연장, 주 만근 시 주휴 8h.
// 공휴일 특별처리 없음 — 재직 평일 전부 유급 근무일로 취급(공휴일도 정상 근무일, 연장 포함).
// 완전월(입사=월초 이후 아님 & 퇴사=월말 이전 아님)은 isPartial=false → 호출측이 전액 기존 로직 유지.
// 전액월과 단가 정합: 통상시급 = 기본급 ÷ (209 + 고정연장11h×1.5) = ÷225.5 (전액월과 동일).
// ============================================================================
export const DAILY_REGULAR_HOURS = 8   // 1일 소정근로시간 (209시간 도출 기준)

export interface ProrationContext {
  isPartial: boolean       // 입사일 > 월초 또는 퇴사일 < 월말
  workedWeekdays: number   // 재직∩급여월 내 평일(월~금) 수 (공휴일 미차감)
  completeWeeks: number    // 주휴 대상 주 수 (그 주 월~금 전부 재직 & 일요일이 급여월 내)
  monthWeekdays: number    // 급여월 전체 평일 수 (수당 일할 분모)
}

function payMonthEnd(period: string): string {
  const [y, m] = period.split('-').map(Number)
  // Date.UTC(y, m, 0) = (1-base m) 그 달 말일
  const d = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${period}-${String(d).padStart(2, '0')}`
}
function eachDate(start: string, end: string): string[] {
  if (start > end) return []
  const out: string[] = []
  const d = new Date(start + 'T00:00:00Z')
  const e = new Date(end + 'T00:00:00Z')
  while (d <= e) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1) }
  return out
}
function countWeekdaysBetween(start: string, end: string): number {
  let n = 0
  for (const day of eachDate(start, end)) {
    const dow = new Date(day + 'T00:00:00Z').getUTCDay() // 0=일, 6=토
    if (dow !== 0 && dow !== 6) n++
  }
  return n
}

/** 급여월(YYYY-MM) 기준 입사일/퇴사일로 근무일 일할 컨텍스트 산정 (순수 함수, DB 불요). */
export function getProrationContext(period: string, hireDate: string | null, resignationDate: string | null): ProrationContext {
  const monthStart = `${period}-01`
  const monthEnd = payMonthEnd(period)
  const hire = hireDate && /^\d{4}-\d{2}-\d{2}/.test(hireDate) ? hireDate.slice(0, 10) : null
  const resig = resignationDate && /^\d{4}-\d{2}-\d{2}/.test(resignationDate) ? resignationDate.slice(0, 10) : null
  const isPartial = (!!hire && hire > monthStart) || (!!resig && resig < monthEnd)
  const monthWeekdays = countWeekdaysBetween(monthStart, monthEnd)
  if (!isPartial) return { isPartial: false, workedWeekdays: monthWeekdays, completeWeeks: 0, monthWeekdays }

  const windowStart = hire && hire > monthStart ? hire : monthStart
  const windowEnd = resig && resig < monthEnd ? resig : monthEnd
  const workedWeekdays = countWeekdaysBetween(windowStart, windowEnd)
  // 완전주: 급여월 내 일요일 D마다 그 주 월~금(D-6..D-2)이 모두 재직[hire..resig]이면 주휴 1
  const lower = hire || '0000-01-01'
  const upper = resig || '9999-12-31'
  let completeWeeks = 0
  for (const day of eachDate(monthStart, monthEnd)) {
    const dt = new Date(day + 'T00:00:00Z')
    if (dt.getUTCDay() !== 0) continue
    const mon = new Date(dt); mon.setUTCDate(mon.getUTCDate() - 6)
    const fri = new Date(dt); fri.setUTCDate(fri.getUTCDate() - 2)
    if (mon.toISOString().slice(0, 10) >= lower && fri.toISOString().slice(0, 10) <= upper) completeWeeks++
  }
  return { isPartial: true, workedWeekdays, completeWeeks, monthWeekdays }
}

export interface ProratedInclusiveInput {
  inclusiveBase: number       // 포괄 총액 (전액월 기준 원본)
  baseMonthlyHours: number    // 월 소정근로시간 (209)
  fixedOTHoursFull: number    // 전액월 고정연장시간 = overtime_daily_hours × overtime_work_days (분모 고정, 0=일반직원)
  overtimeDailyHours: number  // 1일 고정연장시간 (일할 연장시간 계산용, 0=일반직원)
  extraOTHours: number        // 실근태 추가연장 (일할 아님 — 실측)
  nightHours: number
  holidayHours: number
  overtimeMul: number; nightMul: number; holidayMul: number; holidayOverMul: number
  ctx: ProrationContext
}
/**
 * calcInclusivePay의 일할 버전 — 재직 근무일만큼 기본급/고정연장을 축소.
 * 반환 형태는 calcInclusivePay와 동일(드롭인). 단가(시급)는 전액월과 동일.
 *   기본급(일할) = 시급 × (재직평일×8 + 완전주×8[주휴])
 *   고정연장(일할) = 시급 × 1.5 × (재직평일 × 1일고정연장)
 *   추가연장/야간/휴일 = 실측 그대로 가산(일할 아님)
 */
export function calcProratedInclusive(input: ProratedInclusiveInput): InclusivePayResult {
  const divisor = input.baseMonthlyHours + input.fixedOTHoursFull * input.overtimeMul // 전액월 분모(225.5)
  const hourly = divisor > 0 ? Math.round(input.inclusiveBase / divisor) : 0
  const regHours = input.ctx.workedWeekdays * DAILY_REGULAR_HOURS + input.ctx.completeWeeks * DAILY_REGULAR_HOURS
  const fixedOtHours = input.ctx.workedWeekdays * input.overtimeDailyHours
  const regular_base = hourly * regHours
  const fixedOTPay = Math.floor(hourly * input.overtimeMul * fixedOtHours / 10) * 10
  const extraOTPay = Math.floor(hourly * input.overtimeMul * input.extraOTHours / 10) * 10
  const overtime_pay = fixedOTPay + extraOTPay
  const overtime_hours = fixedOtHours + input.extraOTHours
  const night_pay = Math.floor(hourly * input.nightMul * input.nightHours / 10) * 10
  const holidayNormal = Math.min(input.holidayHours, 8)
  const holidayOver = Math.max(0, input.holidayHours - 8)
  const holiday_pay =
    Math.floor(hourly * input.holidayMul * holidayNormal / 10) * 10 +
    Math.floor(hourly * input.holidayOverMul * holidayOver / 10) * 10
  return { hourly_wage: hourly, regular_base, overtime_pay, overtime_hours, night_pay, holiday_pay }
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
  // 국민연금 기준소득월액 오버라이드(employees.pension_base). >0이면 국민연금 base로 사용(상하한 클램프),
  // 미지정/0이면 당월 과세급여(taxablePay) 사용 — 기존 동작 하위호환. 국민연금에만 적용.
  pensionBaseOverride?: number | null
  // #389: 일괄 처리 시 year별 요율을 미리 1회 로드해 주입(루프 N+1 제거). 미지정이면 매 호출 조회(하위호환).
  ratesCache?: Record<string, InsuranceRate>
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
     ORDER BY monthly_pay_min DESC, id DESC LIMIT 1`
  ).bind(year, monthlyPay, monthlyPay).first<{ id: number; tax: number }>().catch(() => null)
  if (row) return { tax: row.tax || 0, rowId: row.id }
  // fallback: 표 없으면 공식 계산 (국세청 간이세액표 공식 기준, 80/100/120% 선택은 별도 적용)
  return { tax: calcOfficialMonthlyTax(monthlyPay, safeDeps), rowId: null }
}

/** #389: 연도별 4대보험 요율 맵 로드(일괄 처리 시 루프 밖 1회 호출 후 calcDeductions input.ratesCache로 주입). */
export async function loadInsuranceRates(db: D1Database, year: number): Promise<Record<string, InsuranceRate>> {
  const ratesRow = await db.prepare(
    `SELECT insurance_type, total_rate, employee_rate, employer_rate, base, min_base, max_base
     FROM insurance_rates WHERE year = ?`
  ).bind(year).all<InsuranceRate>().catch(() => ({ results: [] as InsuranceRate[] }))
  const rates: Record<string, InsuranceRate> = {}
  for (const r of (ratesRow.results || [])) rates[r.insurance_type] = r
  return rates
}

export async function calcDeductions(db: D1Database, input: CalcInput): Promise<CalcResult> {
  const { taxablePay, dependents, taxOption, year } = input
  // 토글: 명시되지 않으면 true (적용) — 기존 호출자 하위호환
  const applyNp = input.applyNationalPension !== false
  const applyHi = input.applyHealth !== false
  const applyLtc = input.applyLongTermCare !== false
  const applyEi = input.applyEmployment !== false
  const applyIa = input.applyIndustrialAccident !== false

  // 1) 4대보험 요율 조회 (#389: 주입된 ratesCache 우선, 미지정 시 조회 — 하위호환·동일 결과)
  const rates: Record<string, InsuranceRate> = input.ratesCache ?? await loadInsuranceRates(db, year)

  // 2) 국민연금 — 기준소득월액(설정 시) 또는 당월 과세급여를 base로 상하한 적용
  //    pension_base(>0)가 있으면 국민연금공단 고정 기준액 사용(당월급여 변동 무관), 없으면 당월 과세급여(하위호환).
  let pensionBase = (input.pensionBaseOverride != null && input.pensionBaseOverride > 0)
    ? input.pensionBaseOverride
    : taxablePay
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
  pension_base: number   // 국민연금 기준소득월액 (0=미설정→당월 과세급여 사용)
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
    pension_base: 0,
    insurance_apply_national_pension: true,
    insurance_apply_health: true,
    insurance_apply_long_term_care: true,
    insurance_apply_employment: true,
    insurance_apply_industrial_accident: true,
  }
  try {
    const { results: colInfo } = await db.prepare(`PRAGMA table_info(employees)`).all()
    const cols = new Set((colInfo as { name: string }[]).map((r) => r.name))
    const pickNum = ['position_allowance','vehicle_allowance','meal_allowance_fixed','special_bonus_fixed','other_allowance_fixed','mutual_aid_fee','other_deduction_fixed','pension_base']
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

// #389: loadEmployeeDefaults의 일괄 버전 — PRAGMA 1회 + employees IN절 1회로 N+1 제거.
// 직원별 호출과 결과 동일(같은 컬럼 가드·기본값 fallback). 미존재 id는 Map에서 누락 → 호출부에서 defaults 사용.
export async function loadAllEmployeeDefaults(db: D1Database, employeeIds: number[]): Promise<Map<number, EmployeeDefaults>> {
  const map = new Map<number, EmployeeDefaults>()
  const ids = [...new Set(employeeIds)].filter((id) => id != null)
  if (ids.length === 0) return map
  const mkDefaults = (): EmployeeDefaults => ({
    position_allowance: 0, vehicle_allowance: 0, meal_allowance_fixed: 0,
    special_bonus_fixed: 0, other_allowance_fixed: 0, mutual_aid_fee: 0, other_deduction_fixed: 0,
    pension_base: 0,
    insurance_apply_national_pension: true, insurance_apply_health: true,
    insurance_apply_long_term_care: true, insurance_apply_employment: true,
    insurance_apply_industrial_accident: true,
  })
  const pickNum = ['position_allowance','vehicle_allowance','meal_allowance_fixed','special_bonus_fixed','other_allowance_fixed','mutual_aid_fee','other_deduction_fixed','pension_base']
  const pickBool = ['insurance_apply_national_pension','insurance_apply_health','insurance_apply_long_term_care','insurance_apply_employment','insurance_apply_industrial_accident']
  try {
    const { results: colInfo } = await db.prepare(`PRAGMA table_info(employees)`).all()
    const cols = new Set((colInfo as { name: string }[]).map((r) => r.name))
    const selectable = [...pickNum, ...pickBool].filter((c) => cols.has(c))
    if (selectable.length === 0) {
      for (const id of ids) map.set(id, mkDefaults())
      return map
    }
    const ph = ids.map(() => '?').join(',')
    const { results: rows } = await db.prepare(
      `SELECT id, ${selectable.join(', ')} FROM employees WHERE id IN (${ph})`
    ).bind(...ids).all<any>()
    const rowById = new Map<number, any>()
    for (const r of (rows || [])) rowById.set(Number(r.id), r)
    for (const id of ids) {
      const d = mkDefaults()
      const row = rowById.get(id)
      if (row) {
        const dd = d as unknown as Record<string, number | boolean>
        for (const k of pickNum) { if (row[k] != null) dd[k] = Number(row[k]) || 0 }
        for (const k of pickBool) { if (row[k] != null) dd[k] = Number(row[k]) === 1 }
      }
      map.set(id, d)
    }
  } catch (_) {
    // 조회 실패 — 전부 defaults (loadEmployeeDefaults 동작과 동일)
    for (const id of ids) if (!map.has(id)) map.set(id, mkDefaults())
  }
  return map
}
