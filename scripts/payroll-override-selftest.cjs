#!/usr/bin/env node
/**
 * 급여 공제 수동 오버라이드 자체검증 — `src/routes/payroll/shared.ts` (0618 · T2)
 *
 * ★왜 있는가:
 *   오버라이드는 **계산을 이기는 값**이다. 한 번 어긋나면 "재계산해도 왜 안 바뀌지",
 *   "왜 이 사람만 다르지"가 되는데 화면은 200 이고 숫자도 그럴듯해서 아무 게이트도 안 걸린다.
 *   4대보험 가입 토글이 전 직원 1 인 채 몇 달 방치됐던 것과 같은 형태다(2026-09-17).
 *
 * 무엇을 검증하나:
 *   ① 오버라이드가 계산값을 덮는다 · 지정 안 한 항목은 계산값이 남는다
 *   ② total_deduction 이 덮은 값으로 **다시 합산**된다 (여기가 틀리면 실지급액이 조용히 어긋난다)
 *   ③ 회사부담분(employer_*)은 건드리지 않는다 — 직원 공제와 별개 축
 *   ④ 0 은 유효한 오버라이드다(= 공제 안 함). "해제"는 키를 빼는 것이지 0 이 아니다
 *   ⑤ 깨진 JSON·NaN 은 버린다 — 오버라이드 하나 때문에 급여 계산이 죽으면 안 된다
 *   ⑧ **음수는 소득세·지방세만** 허용한다(연말정산 환급이 음수로 온다 — 이카운트 −527,930 실측).
 *      4대보험 음수는 존재할 수 없으므로 오타로 보고 버린다
 *   ⑥ calcDeductions 를 통과해도 유지된다(적용 지점이 한 곳인지 확인)
 *   ⑦ 가입 토글 OFF 보다 오버라이드가 우선한다(사람이 명시한 값이 최종)
 *
 * 실행: node scripts/payroll-override-selftest.cjs   (실패 시 exit 1)
 */
'use strict'

const { compileTs } = require('./lib/compile-ts.cjs')
let DatabaseSync
try {
  ({ DatabaseSync } = require('node:sqlite'))
} catch (_) {
  console.error(`✗ node:sqlite 를 못 찾았다 (현재 Node ${process.version}). Node 22.5 이상이 필요하다.`)
  process.exit(1)
}
const path = require('path')

const SRC = path.join(__dirname, '..', 'src', 'routes', 'payroll', 'shared.ts')
const { mod, cleanup } = compileTs(SRC, { bundle: true })
const { calcDeductions, parseDeductionOverrides, applyDeductionOverrides, calcAbsentDeduction, calcInclusivePay } = mod

function makeDbShim(db) {
  return {
    prepare(sql) {
      const stmt = db.prepare(sql)
      const wrap = (args) => ({
        bind: (...more) => wrap(args.concat(more)),
        first: async () => stmt.get(...args) ?? null,
        all: async () => ({ results: stmt.all(...args) }),
        run: async () => { stmt.run(...args); return { meta: {} } },
      })
      return wrap([])
    },
  }
}

function seed() {
  const db = new DatabaseSync(':memory:')
  db.exec(`
    CREATE TABLE insurance_rates (
      id INTEGER PRIMARY KEY AUTOINCREMENT, year INTEGER, insurance_type TEXT,
      total_rate REAL, employee_rate REAL, employer_rate REAL, base TEXT,
      min_base INTEGER, max_base INTEGER, effective_from DATE, effective_to DATE, notes TEXT,
      UNIQUE(insurance_type, effective_from)
    );
    CREATE TABLE income_tax_table (
      id INTEGER PRIMARY KEY, year INTEGER, monthly_pay_min INTEGER, monthly_pay_max INTEGER,
      dependents_1 INTEGER, dependents_2 INTEGER, dependents_3 INTEGER, dependents_4 INTEGER,
      dependents_5 INTEGER, dependents_6 INTEGER, dependents_7 INTEGER, dependents_8 INTEGER,
      dependents_9 INTEGER, dependents_10 INTEGER, dependents_11 INTEGER
    );
  `)
  const ins = db.prepare(`INSERT INTO insurance_rates
    (year, insurance_type, total_rate, employee_rate, employer_rate, base, min_base, max_base, effective_from, effective_to)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  ins.run(2026, 'NATIONAL_PENSION', 9.5, 4.75, 4.75, 'TAXABLE_PAY', 400000, 6370000, '2026-01-01', '2026-06-30')
  ins.run(2026, 'HEALTH', 7.19, 3.595, 3.595, 'TAXABLE_PAY', null, null, '2026-01-01', null)
  ins.run(2026, 'LONG_TERM_CARE', 13.14, 6.57, 6.57, 'HEALTH_INSURANCE', null, null, '2026-01-01', null)
  ins.run(2026, 'EMPLOYMENT', 1.8, 0.9, 0.9, 'TAXABLE_PAY', null, null, '2026-01-01', null)
  ins.run(2026, 'INDUSTRIAL_ACCIDENT', 0.9, 0, 0.9, 'TAXABLE_PAY', null, null, '2026-01-01', null)
  return db
}

let failed = 0
function check(label, actual, expected) {
  const ok = actual === expected
  if (!ok) failed++
  const fmt = (v) => (typeof v === 'number' ? v.toLocaleString() : JSON.stringify(v))
  console.log(`${ok ? '✓' : '✗'} ${label}: ${fmt(actual)}${ok ? '' : ` (기대 ${fmt(expected)})`}`)
}

;(async () => {
  const db = seed()
  const DB = makeDbShim(db)
  const base = { dependents: 1, taxOption: '100', year: 2026, payPeriod: '2026-06', taxablePay: 3000000 }

  console.log('── 파싱 ──')
  check('JSON 문자열', JSON.stringify(parseDeductionOverrides('{"np":123450}')), '{"np":123450}')
  check('객체 그대로', JSON.stringify(parseDeductionOverrides({ hi: 100 })), '{"hi":100}')
  check('깨진 JSON = 빈 객체', JSON.stringify(parseDeductionOverrides('{oops')), '{}')
  check('null = 빈 객체', JSON.stringify(parseDeductionOverrides(null)), '{}')
  check('배열 = 빈 객체', JSON.stringify(parseDeductionOverrides('[1,2]')), '{}')
  check('4대보험 음수는 버린다', JSON.stringify(parseDeductionOverrides('{"np":-5,"hi":-1,"ltc":-1,"ei":-1}')), '{}')
  check('소득세 음수는 허용(연말정산 환급)', JSON.stringify(parseDeductionOverrides('{"it":-527930}')), '{"it":-527930}')
  check('지방세 음수도 허용', JSON.stringify(parseDeductionOverrides('{"lt":-52790}')), '{"lt":-52790}')
  check('NaN 은 버린다', JSON.stringify(parseDeductionOverrides('{"np":"abc"}')), '{}')
  check('0 은 유효', JSON.stringify(parseDeductionOverrides('{"ei":0}')), '{"ei":0}')
  check('모르는 키는 무시', JSON.stringify(parseDeductionOverrides('{"zz":1,"it":10}')), '{"it":10}')
  check('소수는 반올림', JSON.stringify(parseDeductionOverrides('{"lt":10.6}')), '{"lt":11}')

  console.log('── 계산값 (오버라이드 없음) ──')
  const plain = await calcDeductions(DB, { ...base })
  check('국민연금', plain.national_pension, 142500)   // 3,000,000 × 4.75%
  check('건강보험', plain.health_insurance, 107850)   // 3,000,000 × 3.595%
  check('고용보험', plain.employment_insurance, 27000)
  const plainTotal = plain.national_pension + plain.health_insurance + plain.long_term_care_insurance
    + plain.employment_insurance + plain.income_tax + plain.local_tax
  check('공제계 = 항목 합', plain.total_deduction, plainTotal)

  console.log('── ①②③ 오버라이드 적용 ──')
  const ov = await calcDeductions(DB, { ...base, deductionOverrides: { np: 302570, hi: 288190 } })
  check('국민연금 = 고정값', ov.national_pension, 302570)
  check('건강보험 = 고정값', ov.health_insurance, 288190)
  check('고용보험 = 계산값 유지', ov.employment_insurance, 27000)
  check('장기요양 = 계산값 유지', ov.long_term_care_insurance, plain.long_term_care_insurance)
  check('공제계 재합산', ov.total_deduction,
    302570 + 288190 + plain.long_term_care_insurance + plain.employment_insurance + plain.income_tax + plain.local_tax)
  check('회사부담 국민연금 불변', ov.employer_national_pension, plain.employer_national_pension)
  check('회사부담 건강 불변', ov.employer_health_insurance, plain.employer_health_insurance)
  check('산재 불변', ov.employer_industrial_accident, plain.employer_industrial_accident)

  console.log('── ④ 0 은 "공제 안 함" ──')
  const zero = await calcDeductions(DB, { ...base, deductionOverrides: { ei: 0 } })
  check('고용보험 0', zero.employment_insurance, 0)
  check('공제계에서 빠짐', zero.total_deduction, plain.total_deduction - plain.employment_insurance)

  console.log('── ⑤ 깨진 값은 계산값을 건드리지 않는다 ──')
  const broken = await calcDeductions(DB, { ...base, deductionOverrides: parseDeductionOverrides('{"np":-1,"hi":"x"}') })
  check('국민연금 = 계산값', broken.national_pension, plain.national_pension)
  check('건강보험 = 계산값', broken.health_insurance, plain.health_insurance)

  console.log('── ⑦ 토글 OFF 보다 오버라이드가 우선 ──')
  const offThenOv = await calcDeductions(DB, {
    ...base, applyNationalPension: false, deductionOverrides: { np: 150000 },
  })
  check('토글 OFF + 고정값 → 고정값', offThenOv.national_pension, 150000)

  console.log('── 연말정산 환급(음수 소득세) ──')
  const refund = await calcDeductions(DB, { ...base, deductionOverrides: { it: -527930, lt: -52790 } })
  check('소득세 음수', refund.income_tax, -527930)
  check('지방세 음수', refund.local_tax, -52790)
  check('공제계가 음수로 내려간다', refund.total_deduction,
    plain.national_pension + plain.health_insurance + plain.long_term_care_insurance
    + plain.employment_insurance - 527930 - 52790)
  check('4대보험은 그대로', refund.national_pension, plain.national_pension)

  console.log('── 결근 공제 (0621) ──')
  // 통상시급 × 8h × 결근일수. 2026-09-17 이전에는 absent_days 가 계산에 안 쓰여
  // 근무 0일·결근 22일인 직원에게 급여가 전액 나갔다(킨뚜자소 7월).
  check('시급 10,000 · 1일', calcAbsentDeduction(10000, 1), 80000)
  check('시급 10,000 · 4일', calcAbsentDeduction(10000, 4), 320000)
  check('반일(0.5일)', calcAbsentDeduction(10000, 0.5), 40000)
  check('결근 0일 = 차감 없음', calcAbsentDeduction(10000, 0), 0)
  check('시급 0 = 차감 없음', calcAbsentDeduction(0, 5), 0)
  check('음수 결근 = 차감 없음', calcAbsentDeduction(10000, -3), 0)
  check('10원 미만 절사', calcAbsentDeduction(9567, 1), 76530)   // 9567×8=76,536 → 76,530
  // 포괄임금 직원은 ÷225.5 시급을 쓴다 — 연장수당과 같은 값이어야 서로 어긋나지 않는다
  const inc = calcInclusivePay({
    inclusiveBase: 2367800, baseMonthlyHours: 209, fixedOTHours: 11, extraOTHours: 0,
    nightHours: 0, holidayHours: 0, overtimeMul: 1.5, nightMul: 0.5, holidayMul: 1.5, holidayOverMul: 2,
  })
  check('포괄임금 시급(÷225.5)', inc.hourly_wage, 10500)
  check('그 시급으로 22일 결근', calcAbsentDeduction(inc.hourly_wage, 22), 1848000)

  console.log('── 순수 함수 직접 ──')
  const fake = {
    national_pension: 1, health_insurance: 2, long_term_care_insurance: 3, employment_insurance: 4,
    income_tax: 5, local_tax: 6, employer_national_pension: 7, employer_health_insurance: 8,
    employer_long_term_care: 9, employer_employment_insurance: 10, employer_industrial_accident: 11,
    total_deduction: 21,
  }
  const applied = applyDeductionOverrides(fake, { it: 100 })
  check('소득세 덮기', applied.income_tax, 100)
  check('합계 재계산', applied.total_deduction, 1 + 2 + 3 + 4 + 100 + 6)
  check('원본 불변(순수)', fake.income_tax, 5)
  check('빈 오버라이드 = 그대로', applyDeductionOverrides(fake, {}).total_deduction, 21)

  cleanup && cleanup()
  if (failed) {
    console.error(`\n✗ 공제 오버라이드 검증 실패 ${failed}건`)
    process.exit(1)
  }
  console.log('\n✓ 공제 오버라이드 검증 통과')
})().catch((e) => {
  console.error('✗ 실행 오류:', e && e.stack || e)
  process.exit(1)
})
