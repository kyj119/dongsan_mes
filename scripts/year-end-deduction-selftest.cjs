#!/usr/bin/env node
/**
 * 연말정산 이중공제 자체검증 — `src/routes/payroll/year-end-calc.ts`
 *
 * ★왜 있는가 (2026-09-03):
 *   보장성보험료·의료비·교육비·기부금이 **과세표준 차감(소득공제)과 12~15% 세액공제 양쪽**에 들어갔고,
 *   국민연금도 소득공제 + 12% 세액공제 양쪽이었다 → 결정세액 과소·환급 과대. 200 응답이라 어떤 게이트도 못 잡는다.
 *
 * 법적 근거:
 *   · 특별세액공제(보험 12% · 의료 15% · 교육 15% · 기부 15%) = 소득세법 §59의4 — 2014 귀속분부터 세액공제만.
 *   · 국민연금 = 연금보험료 소득공제(§51의3) 전액 — 세액공제 아님.
 *   · 연금저축 = 연금계좌 세액공제(§59의3) 총급여 5,500만 이하 15% / 초과 12%, 한도 600만 — 소득공제 아님.
 *   · 표준세액공제 13만 = 특별소득공제·특별세액공제 미신청 시(§59의4⑨).
 *
 * 실행: node scripts/year-end-deduction-selftest.cjs   (실패 시 exit 1)
 */
'use strict'

const { compileTs } = require('./lib/compile-ts.cjs')
const path = require('path')

const SRC = path.join(__dirname, '..', 'src', 'routes', 'payroll', 'year-end-calc.ts')
const { mod: _m, cleanup: _cleanup } = compileTs(SRC)
const { calcYearEndSettlement } = _m

let pass = 0
const fails = []
const eq = (label, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { pass++; return }
  fails.push(`${label}\n      기대 ${w}\n      실제 ${g}`)
}

// ── 기준 케이스 (손계산) ────────────────────────────────────────────────────
//   총급여 4,000만 − 비과세 240만 = 과세급여 3,760만
//   근로소득공제 = 750만 + (3,760만 − 1,500만)×15% = 1,089만 → 근로소득금액 2,671만
//   소득공제 = 기본 150만 + 국민연금 160만 = 310만 → 과세표준 2,361만  (★특별항목·연금저축은 여기 안 들어간다)
//   산출세액 = 84만 + (2,361만 − 1,400만)×15% = 2,281,500
//   근로소득세액공제 = 715,000 + (2,281,500 − 1,300,000)×30% = 1,009,450 → 한도(3,300만<총급여≤7,000만) 660,000
//   보험 100만×12% = 120,000 · 의료 (200만 − 3,760만×3%=1,128,000) = 872,000×15% = 130,800
//   교육 100만×15% = 150,000 · 기부 50만×15% = 75,000 · 연금저축 300만×15%(≤5,500만) = 450,000 · 표준 0
//   결정세액 = 2,281,500 − 1,585,800 = 695,700 · 지방 69,570
//   기납부 900,000/90,000 → 환급 204,300 + 20,430 = 224,730
const BASE = {
  totalSalary: 40000000, totalNontax: 2400000, nationalPension: 1600000,
  prepaidIncomeTax: 900000, prepaidLocalTax: 90000,
  dependentsCount: 1, additionalAged: 0, additionalDisabled: 0, additionalSingleParent: 0,
  insurance: 1000000, medical: 2000000, education: 1000000, housing: 0, donation: 500000,
  pensionSaving: 3000000, creditCard: 0, childTaxCredit: 0,
}

const r = calcYearEndSettlement(BASE)
eq('근로소득공제', r.earnedIncomeDeduction, 10890000)
eq('소득공제 합계 = 기본 + 국민연금 (특별항목 미포함)', r.totalDeductions, 3100000)
eq('과세표준', r.taxableIncome, 23610000)
eq('산출세액', r.calculatedTax, 2281500)
eq('근로소득세액공제(한도 66만)', r.earnedTaxCredit, 660000)
eq('보장성보험 12%', r.insurancePremiumCredit, 120000)
eq('의료비 3% 초과분 15%', r.medicalCredit, 130800)
eq('교육비 15%', r.educationCredit, 150000)
eq('기부금 15%', r.donationCredit, 75000)
eq('연금저축 15% (총급여 ≤ 5,500만)', r.pensionContributionCredit, 450000)
eq('표준세액공제 0 (특별공제 있음)', r.standardTaxCredit, 0)
eq('결정세액', r.determinedTax, 695700)
eq('환급 합계', r.refundTotal, 224730)

// ── 이중공제 금지: 특별항목을 0 ↔ 입력해도 과세표준은 불변, 세액공제만 달라진다 ──
const noSpecial = calcYearEndSettlement({ ...BASE, insurance: 0, medical: 0, education: 0, donation: 0, pensionSaving: 0 })
eq('특별항목 제거 → 과세표준 불변', noSpecial.taxableIncome, r.taxableIncome)
eq('특별항목 제거 → 표준세액공제 13만', noSpecial.standardTaxCredit, 130000)
eq('특별항목 제거 → 연금저축 공제 0', noSpecial.pensionContributionCredit, 0)
eq('특별항목 제거 → 결정세액 = 2,281,500 − 660,000 − 130,000', noSpecial.determinedTax, 1491500)

// 보험료만 100만 추가 → 과세표준 그대로, 결정세액은 정확히 12만 감소 (표준세액공제 13만이 사라지므로 +13만)
const insOnly = calcYearEndSettlement({ ...BASE, medical: 0, education: 0, donation: 0, pensionSaving: 0 })
eq('보험료만 → 과세표준 불변', insOnly.taxableIncome, r.taxableIncome)
eq('보험료만 → 결정세액 = 2,281,500 − 660,000 − 120,000', insOnly.determinedTax, 1501500)

// ── 국민연금은 소득공제만 (세액공제 없음) ──
const npUp = calcYearEndSettlement({ ...BASE, nationalPension: 2600000 })
eq('국민연금 +100만 → 과세표준 −100만', npUp.taxableIncome, r.taxableIncome - 1000000)
eq('국민연금 변동 → 연금계좌 세액공제 불변', npUp.pensionContributionCredit, r.pensionContributionCredit)

// ── 연금저축: 총급여 5,500만 초과 12% · 한도 600만 ──
const hi = calcYearEndSettlement({ ...BASE, totalSalary: 70000000, totalNontax: 0, pensionSaving: 7000000 })
eq('연금저축 한도 600만', hi.pensionSaving, 6000000)
eq('연금저축 12% (총급여 > 5,500만)', hi.pensionContributionCredit, 720000)

// ── 주택자금은 특별소득공제(과세표준 차감) ──
const housing = calcYearEndSettlement({ ...BASE, housing: 1000000 })
eq('주택자금 100만 → 과세표준 −100만', housing.taxableIncome, r.taxableIncome - 1000000)

// ── 결정세액 0 이하로 안 내려간다 ──
const low = calcYearEndSettlement({ ...BASE, totalSalary: 12000000, totalNontax: 0 })
eq('저소득 → 결정세액 0 (음수 금지)', low.determinedTax, 0)

_cleanup()
if (fails.length > 0) {
  console.error(`\n✗ 연말정산 이중공제 자체검증 실패 ${fails.length}건 (통과 ${pass})\n`)
  for (const f of fails) console.error('  ✗ ' + f)
  process.exit(1)
}
console.log(`✓ 연말정산 이중공제 자체검증 ${pass}건 통과`)
