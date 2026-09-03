#!/usr/bin/env node
/**
 * 세금계산서 에누리 분배 자체검증 — `src/utils/taxInvoiceDiscount.ts`
 *
 * ★왜 있는가 (2026-09-03):
 *   createSplitInvoices 가 총액 = supply + tax 로 계산해 **주문 에누리를 빼지 않았다**. 청구그룹은
 *   billed = supply + tax − discount 라 AR 100만인 주문이 계산서 110만으로 국세청에 발행됐다.
 *
 * 규칙: 에누리(부가세 포함 차감액)를 그룹의 세율 비율로 공급가액·세액 몫으로 나눈다(부가세법 §29③).
 *   분배 합 = 에누리 · 계산서 합계 = AR 청구액 · 세액 0 그룹은 전액 공급가액.
 *
 * 실행: node scripts/tax-discount-selftest.cjs   (실패 시 exit 1)
 */
'use strict'

const { compileTs } = require('./lib/compile-ts.cjs')
const path = require('path')

const SRC = path.join(__dirname, '..', 'src', 'utils', 'taxInvoiceDiscount.ts')
const { mod: _m, cleanup: _cleanup } = compileTs(SRC)
const { splitDiscount, groupDiscount } = _m

let pass = 0
const fails = []
const eq = (label, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { pass++; return }
  fails.push(`${label}\n      기대 ${w}\n      실제 ${g}`)
}

// ① 리뷰 시나리오: 공급가 100만 · VAT 10만 · 에누리 10만 → 계산서 합계 100만 (= AR)
const d = splitDiscount(100000, 1000000, 100000)
eq('세액 몫 = round(10만 × 10/110) = 9,091', d.tax, 9091)
eq('공급가 몫 = 90,909', d.supply, 90909)
eq('분배 합 = 에누리', d.supply + d.tax, 100000)
eq('계산서 합계 = 1,000,000 (AR 청구액)', (1000000 - d.supply) + (100000 - d.tax), 1000000)
eq('세액 ≈ 공급가액 × 10%', Math.round((1000000 - d.supply) * 0.1), 100000 - d.tax)

// ② 에누리 0 · 세액 0 그룹(면세) · 음수 방어
eq('에누리 0', splitDiscount(0, 1000000, 100000), { supply: 0, tax: 0 })
eq('세액 0 그룹 → 전액 공급가액', splitDiscount(5000, 100000, 0), { supply: 5000, tax: 0 })
eq('음수 에누리 → 0', splitDiscount(-3000, 100000, 10000), { supply: 0, tax: 0 })
eq('소수 에누리 반올림', splitDiscount(1000.4, 100000, 10000).supply + splitDiscount(1000.4, 100000, 10000).tax, 1000)

// ③ 그룹 에누리 복원 = supply + tax − billed, [0, supply+tax] 클램프
eq('groupDiscount 정상', groupDiscount(1000000, 100000, 1000000), 100000)
eq('groupDiscount billed NULL → 0', groupDiscount(1000000, 100000, null), 0)
eq('groupDiscount billed > gross → 0', groupDiscount(1000000, 100000, 1200000), 0)
eq('groupDiscount billed 0 → gross 상한', groupDiscount(1000000, 100000, 0), 1100000)

// ④ 분할청구(법인 2곳)에서 그룹별 에누리 합 = 주문 에누리 (orders/helpers.ts 는 공급가 비례 배분 + 마지막 그룹 잔차 흡수)
//   주문 에누리 33,333 을 공급가 60만/40만 그룹에 배분: 20,000 / 13,333
const g1 = groupDiscount(600000, 60000, 600000 + 60000 - 20000)
const g2 = groupDiscount(400000, 40000, 400000 + 40000 - 13333)
eq('그룹별 에누리 합 = 주문 에누리', g1 + g2, 33333)

_cleanup()
if (fails.length > 0) {
  console.error(`\n✗ 세금계산서 에누리 분배 자체검증 실패 ${fails.length}건 (통과 ${pass})\n`)
  for (const f of fails) console.error('  ✗ ' + f)
  process.exit(1)
}
console.log(`✓ 세금계산서 에누리 분배 자체검증 ${pass}건 통과`)
