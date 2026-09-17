#!/usr/bin/env node
/**
 * 4대보험 기간 요율 자체검증 — `src/routes/payroll/shared.ts`
 *
 * ★왜 있는가 (2026-09-17 사고):
 *   `insurance_rates` 가 `UNIQUE(year, insurance_type)` 이라 **연 1행**만 존재할 수 있었다.
 *   국민연금 기준소득월액 상·하한은 매년 7월 재조정되는데, 2026-07-18 에 상한을
 *   637만 → 659만으로 UPDATE 하자 **그 값이 상반기 급여에도 소급**됐다.
 *   2026-06 급여를 재계산하니 과세 800만 직원의 국민연금이
 *   302,570(상한 637만) 이어야 하는데 **313,020**(상한 659만)으로 나왔다.
 *
 *   이 부류는 기존 게이트를 전부 통과한다 — SQL·타입 모두 멀쩡하고 200 이 뜨기 때문이다.
 *   **값 대조만이 잡는다.** 실제로 이카운트 급여대장과 직원별로 맞춰 보고서야 발견했다.
 *
 *   ⚠️ 로컬 D1 이 비면 요율이 0행이라 전부 0 이 나와 판별이 안 된다.
 *      그래서 여기서는 **in-memory SQLite 에 결정론적 픽스처**를 심는다.
 *
 * 무엇을 검증하나:
 *   ① 같은 연도라도 급여월에 따라 다른 기간 행이 선택된다(6월=상반기 / 7월=하반기)
 *   ② 상한 초과자의 국민연금이 기간별로 다르게 나온다 (302,570 vs 313,020)
 *   ③ 하한 미만자에 하한이 적용된다
 *   ④ effective_to 가 NULL 인 과거 연도 행이 최신 연도를 덮지 않는다 (effective_from DESC 채택)
 *   ⑤ 가입 토글 OFF 면 해당 보험이 0 이고 장기요양은 건강보험을 따라 0 이 된다
 *   ⑥ payPeriod 미지정 시 연초로 폴백한다(하위호환)
 *
 * 실행: node scripts/insurance-period-selftest.cjs   (실패 시 exit 1)
 */
'use strict'

const { compileTs } = require('./lib/compile-ts.cjs')
let DatabaseSync
try {
  ({ DatabaseSync } = require('node:sqlite'))
} catch (_) {
  console.error(`✗ node:sqlite 를 못 찾았다 (현재 Node ${process.version}). Node 22.5 이상이 필요하다.`)
  console.error('  CI 는 .github/workflows/deploy.yml 의 node-version 을 올릴 것.')
  process.exit(1)
}
const path = require('path')

const SRC = path.join(__dirname, '..', 'src', 'routes', 'payroll', 'shared.ts')
const { mod, cleanup } = compileTs(SRC, { bundle: true })
const { calcDeductions, loadInsuranceRates, rateRefDate } = mod

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
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      year INTEGER NOT NULL,
      insurance_type TEXT NOT NULL,
      total_rate REAL NOT NULL,
      employee_rate REAL NOT NULL DEFAULT 0,
      employer_rate REAL NOT NULL DEFAULT 0,
      base TEXT NOT NULL DEFAULT 'TAXABLE_PAY',
      min_base INTEGER,
      max_base INTEGER,
      effective_from DATE NOT NULL,
      effective_to DATE,
      notes TEXT,
      UNIQUE(insurance_type, effective_from)
    );
    -- 간이세액표는 비워 둔다 → lookupIncomeTax 가 공식 fallback 으로 떨어진다.
    -- 이 테스트가 보는 것은 4대보험이므로 소득세 값 자체는 검증 대상이 아니다.
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

  // ④ 과거 연도 행: effective_to 가 NULL 이다(실제 prod 도 그렇다).
  //    기간 조회만 하면 2026 과 함께 잡히므로, effective_from DESC 채택이 동작해야 한다.
  ins.run(2025, 'NATIONAL_PENSION', 9.0, 4.5, 4.5, 'TAXABLE_PAY', 390000, 6170000, '2025-01-01', null)
  ins.run(2025, 'HEALTH', 7.09, 3.545, 3.545, 'TAXABLE_PAY', null, null, '2025-01-01', null)

  // ① 2026 국민연금: 상·하반기 2행
  ins.run(2026, 'NATIONAL_PENSION', 9.5, 4.75, 4.75, 'TAXABLE_PAY', 400000, 6370000, '2026-01-01', '2026-06-30')
  ins.run(2026, 'NATIONAL_PENSION', 9.5, 4.75, 4.75, 'TAXABLE_PAY', 410000, 6590000, '2026-07-01', null)

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
  console.log(`${ok ? '✓' : '✗'} ${label}: ${actual.toLocaleString()}${ok ? '' : ` (기대 ${expected.toLocaleString()})`}`)
}

;(async () => {
  const db = seed()
  const DB = makeDbShim(db)
  const base = { dependents: 1, taxOption: '100', year: 2026 }

  console.log('── ① 기간별 요율 선택 ──')
  const r6 = await loadInsuranceRates(DB, rateRefDate('2026-06', 2026))
  const r7 = await loadInsuranceRates(DB, rateRefDate('2026-07', 2026))
  check('2026-06 국민연금 상한', r6['NATIONAL_PENSION'].max_base, 6370000)
  check('2026-07 국민연금 상한', r7['NATIONAL_PENSION'].max_base, 6590000)
  check('2026-06 국민연금 하한', r6['NATIONAL_PENSION'].min_base, 400000)
  check('2026-07 국민연금 하한', r7['NATIONAL_PENSION'].min_base, 410000)

  console.log('── ④ 과거 연도 행이 최신을 덮지 않는다 ──')
  check('2026-06 건강보험 요율(2025=3.545 아님)', r6['HEALTH'].employee_rate, 3.595)
  const r25 = await loadInsuranceRates(DB, rateRefDate('2025-06', 2025))
  check('2025-06 국민연금 상한', r25['NATIONAL_PENSION'].max_base, 6170000)

  console.log('── ② 상한 초과자 (과세 800만) — 실사고 재현 ──')
  const jun = await calcDeductions(DB, { ...base, taxablePay: 8000000, payPeriod: '2026-06' })
  const jul = await calcDeductions(DB, { ...base, taxablePay: 8000000, payPeriod: '2026-07' })
  check('2026-06 국민연금', jun.national_pension, 302570)   // 6,370,000 × 4.75%
  check('2026-07 국민연금', jul.national_pension, 313020)   // 6,590,000 × 4.75%
  check('2026-06 건강보험', jun.health_insurance, 287600)   // 8,000,000 × 3.595%

  console.log('── ③ 하한 미만자 (과세 30만) ──')
  const lowJun = await calcDeductions(DB, { ...base, taxablePay: 300000, payPeriod: '2026-06' })
  const lowJul = await calcDeductions(DB, { ...base, taxablePay: 300000, payPeriod: '2026-07' })
  check('2026-06 하한 적용', lowJun.national_pension, 19000)  // 400,000 × 4.75%
  check('2026-07 하한 적용', lowJul.national_pension, 19470)  // 410,000 × 4.75%

  console.log('── ⑤ 가입 토글 OFF ──')
  const off = await calcDeductions(DB, {
    ...base, taxablePay: 3000000, payPeriod: '2026-06',
    applyNationalPension: false, applyHealth: false, applyEmployment: false,
  })
  check('국민연금 OFF', off.national_pension, 0)
  check('건강보험 OFF', off.health_insurance, 0)
  check('장기요양 = 건강 따라 0', off.long_term_care_insurance, 0)
  check('고용보험 OFF', off.employment_insurance, 0)
  const onAll = await calcDeductions(DB, { ...base, taxablePay: 3000000, payPeriod: '2026-06' })
  check('토글 미지정 = 적용(국민연금)', onAll.national_pension, 142500)
  check('토글 미지정 = 적용(고용)', onAll.employment_insurance, 27000)

  console.log('── ⑥ payPeriod 폴백 ──')
  check('rateRefDate 정상', rateRefDate('2026-07', 2026) === '2026-07-01' ? 1 : 0, 1)
  check('rateRefDate 폴백(연초)', rateRefDate(undefined, 2026) === '2026-01-01' ? 1 : 0, 1)
  const noPeriod = await calcDeductions(DB, { ...base, taxablePay: 8000000 })
  check('payPeriod 없으면 상반기 요율', noPeriod.national_pension, 302570)

  cleanup && cleanup()
  if (failed) {
    console.error(`\n✗ 4대보험 기간 요율 검증 실패 ${failed}건`)
    process.exit(1)
  }
  console.log('\n✓ 4대보험 기간 요율 검증 통과')
})().catch((e) => {
  console.error('✗ 실행 오류:', e && e.stack || e)
  process.exit(1)
})
