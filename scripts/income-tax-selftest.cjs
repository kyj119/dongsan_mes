#!/usr/bin/env node
/**
 * 근로소득 간이세액표 · 자녀세액공제 자체검증 — `src/routes/payroll/shared.ts`
 *
 * ★왜 있는가 (2026-09-17 실사고):
 *   `income_tax_table` 2026 에 **국세청 고시표가 아니라 자체 근사 산식으로 만든 900행**이 들어 있었다.
 *   `/tax-table/generate`(「전구간 자동생성」 버튼)가 `calcOfficialMonthlyTax` 로 채운 값인데,
 *   그 산식에 특별소득공제·특별세액공제 간주액과 연금보험료공제가 빠져 있어 **2~3배 높았다**
 *   (월 350만·4인: 146,260 ↔ 고시표 49,340). 그런데도 화면은 "생성 완료 900행", 응답은 200,
 *   tsc·build·smoke·entity 감사 전부 초록이라 **반년 넘게 그대로 돌았다.**
 *   이카운트 급여대장과 46명을 직원별로 대조해서야 드러났고, 그때도 처음엔 「부양가족 미입력」으로
 *   오진했다 — 표가 높으니 역산하면 가족수가 3~5인으로 부풀어 그럴듯해 보였기 때문이다.
 *
 * 무엇을 검증하나:
 *   ① 자녀세액공제 금액 (별표2, 2026-03-01 시행): 1명 20,830 · 2명 45,830 · 3명부터 +33,330/명
 *   ② **순서** — 자녀공제는 표값에서 먼저 빼고 80/100/120% 를 그 뒤에 곱한다.
 *      뒤집으면 홈택스 예시가 재현되지 않는다(80% 케이스에서 2,800 ↔ 0 으로 완전히 갈린다)
 *   ③ 공제 후 음수면 0원 (규정 명시)
 *   ④ 홈택스 공식 예시 재현: 월급여 3,500천원·공제대상가족 4명·자녀 2명 → 49,340 − 45,830 = 3,510원
 *   ⑤ 실측 앵커 — 김진수 800만/1인 959,500 · 유정희 등 237만/1인 31,410 (이카운트 실제 원천징수액)
 *   ⑥ 가족수 클램프(1~11)와 자녀수 0 기본값
 *
 * 실행: node scripts/income-tax-selftest.cjs   (실패 시 exit 1)
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
const { calcDeductions, childTaxCredit, lookupIncomeTax } = mod

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

// 국세청 「근로소득 간이세액표(조견표)」 2026.03.01 시행분에서 그대로 옮긴 세 행.
//   ⚠️ 이 숫자를 계산식으로 만들지 말 것 — 그렇게 만든 표가 이 게이트가 존재하는 이유다.
const OFFICIAL_ROWS = [
  [2370000, 2380000, 31410, 24410, 13940, 10560, 7190, 3810, 0, 0, 0, 0, 0],
  [3500000, 3520000, 127220, 102220, 62460, 49340, 37630, 32380, 27130, 21880, 17390, 14010, 10640],
  [8000000, 8020000, 959500, 909890, 768550, 738550, 708550, 678550, 648550, 618550, 588550, 558550, 528550],
]

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
      id INTEGER PRIMARY KEY AUTOINCREMENT, year INTEGER, monthly_pay_min INTEGER, monthly_pay_max INTEGER,
      dependents_1 INTEGER, dependents_2 INTEGER, dependents_3 INTEGER, dependents_4 INTEGER,
      dependents_5 INTEGER, dependents_6 INTEGER, dependents_7 INTEGER, dependents_8 INTEGER,
      dependents_9 INTEGER, dependents_10 INTEGER, dependents_11 INTEGER
    );
  `)
  // 보험료는 이 게이트의 관심사가 아니다 — 0 으로 두면 소득세만 남는다.
  const ins = db.prepare(`INSERT INTO insurance_rates
    (year, insurance_type, total_rate, employee_rate, employer_rate, base, min_base, max_base, effective_from, effective_to)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  for (const t of ['NATIONAL_PENSION', 'HEALTH', 'LONG_TERM_CARE', 'EMPLOYMENT', 'INDUSTRIAL_ACCIDENT']) {
    ins.run(2026, t, 0, 0, 0, 'TAXABLE_PAY', null, null, '2026-01-01', null)
  }
  const tax = db.prepare(`INSERT INTO income_tax_table
    (year, monthly_pay_min, monthly_pay_max, dependents_1, dependents_2, dependents_3, dependents_4,
     dependents_5, dependents_6, dependents_7, dependents_8, dependents_9, dependents_10, dependents_11)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  for (const r of OFFICIAL_ROWS) tax.run(2026, ...r)
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
  const base = { taxOption: '100', year: 2026, payPeriod: '2026-07' }
  const tax = async (over) => (await calcDeductions(DB, { ...base, ...over })).income_tax

  console.log('── ① 자녀세액공제 금액 (별표2, 2026-03-01) ──')
  check('자녀 0명', childTaxCredit(0), 0)
  check('자녀 1명', childTaxCredit(1), 20830)
  check('자녀 2명', childTaxCredit(2), 45830)
  check('자녀 3명 = 45,830 + 33,330', childTaxCredit(3), 79160)
  check('자녀 4명 = 45,830 + 33,330×2', childTaxCredit(4), 112490)
  check('음수·빈값은 0', childTaxCredit(-2), 0)
  check('문자열도 0 (미입력 컬럼)', childTaxCredit(null), 0)

  console.log('── ② 표 조회 자체는 자녀공제 전 값 ──')
  check('350만/4인 표값', (await lookupIncomeTax(DB, 2026, 3510000, 4)).tax, 49340)
  check('가족수 12명 → 11인 열로 클램프', (await lookupIncomeTax(DB, 2026, 3510000, 12)).tax, 10640)

  console.log('── ③ 홈택스 공식 예시 재현 ──')
  // 월급여 3,500천원 · 공제대상가족 4명(본인+배우자+자녀2) → 49,340 − 45,830 = 3,510원
  check('350만·4인·자녀2 = 3,510', await tax({ taxablePay: 3510000, dependents: 4, childrenUnder20: 2 }), 3510)
  check('자녀 미지정이면 공제 없음', await tax({ taxablePay: 3510000, dependents: 4 }), 49340)
  check('자녀 1명 = 49,340 − 20,830', await tax({ taxablePay: 3510000, dependents: 4, childrenUnder20: 1 }), 28510)

  console.log('── ④ 순서: 자녀공제 → 비율 (뒤집으면 여기서 갈린다) ──')
  // 옳음: (49,340 − 45,830) × 0.8 = 2,808 → 10원 절사 2,800
  // 틀림: 49,340 × 0.8 − 45,830 = 음수 → 0
  check('80% + 자녀2', await tax({ taxablePay: 3510000, dependents: 4, childrenUnder20: 2, taxOption: '80' }), 2800)
  check('120% + 자녀2', await tax({ taxablePay: 3510000, dependents: 4, childrenUnder20: 2, taxOption: '120' }), 4210)

  console.log('── ⑤ 공제 후 음수는 0원 ──')
  // 237만/6인 = 3,810 인데 자녀 1명 공제 20,830 → 음수 → 0
  check('3,810 − 20,830 → 0', await tax({ taxablePay: 2375000, dependents: 6, childrenUnder20: 1 }), 0)
  check('지방세도 0', (await calcDeductions(DB, { ...base, taxablePay: 2375000, dependents: 6, childrenUnder20: 1 })).local_tax, 0)

  console.log('── ⑥ 이카운트 실측 앵커 (2026-07 급여대장) ──')
  check('김진수 800만/1인 = 959,500', await tax({ taxablePay: 8000000, dependents: 1 }), 959500)
  check('유정희 등 237만/1인 = 31,410', await tax({ taxablePay: 2376900, dependents: 1 }), 31410)
  check('지방세 = 소득세의 10%', (await calcDeductions(DB, { ...base, taxablePay: 8000000, dependents: 1 })).local_tax, 95950)

  console.log('── ⑦ 표가 근사값으로 되돌아가면 잡힌다 ──')
  // 사고 당시 값: 350만·4인 이 146,260 이었다. 앵커가 하나라도 어긋나면 위 ③⑥ 이 먼저 터진다.
  check('350만/4인이 146,260(근사표)이 아니다', (await lookupIncomeTax(DB, 2026, 3510000, 4)).tax !== 146260, true)

  cleanup?.()
  console.log(failed === 0 ? '\n✓ 간이세액표·자녀세액공제 전 항목 통과' : `\n✗ ${failed}건 실패`)
  process.exit(failed === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(1) })
