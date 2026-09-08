#!/usr/bin/env node
/**
 * 라인 단가 **표기** 자체검증 — `src/scripts/shared/displayUnitPrice.js`
 *
 * 왜 있는가: AREA 품목의 `unit_price` 는 ㎡단가라 문서에 그대로 찍으면
 *   `수량 × 단가 ≠ 금액` 이 되어 거래처가 검산할 수 없다(E2-20260831-041 실사례).
 *   그런데 이건 **응답 200 에 화면도 멀쩡한** 종류의 결함이다 —
 *   타입체크·build·smoke 가 전부 통과한다. 값을 대조하는 게이트가 없으면 조용히 되돌아간다.
 *
 * 무엇을 지키나:
 *   ① 장당가 산식(`round(amount/quantity)`)과 폴백 동작
 *   ② 표기 축 ↔ 계산 축 정합 — `perUnit × 수량` 이 `computeLineAmount().final` 과 같아야 한다.
 *      (규칙이 한쪽만 바뀌면 "명세서 단가×수량 ≠ 공급가" 가 다시 생긴다)
 *   ③ 표시 4곳이 실제로 MES_UP 을 지나는가 — 소스 텍스트로 확인한다.
 *      게이트가 산식만 지키고 **호출처를 안 보면** `fmt(it.unit_price)` 로 되돌려도 통과한다.
 *
 * 실행: node scripts/unit-price-display-selftest.cjs   (실패 시 exit 1)
 */
'use strict'

const fs = require('fs')
const path = require('path')
const { compileTs } = require('./lib/compile-ts.cjs')

const ROOT = path.join(__dirname, '..')
const CLIENT = path.join(ROOT, 'src', 'scripts', 'shared', 'displayUnitPrice.js')
const AMOUNT_SRC = path.join(ROOT, 'src', 'utils', 'orderLineAmount.ts')

// 클라 정본 로드 — ?raw IIFE 라 window shim 하나면 그대로 돈다 (deliverySlot 선례)
const win = {}
new Function('window', fs.readFileSync(CLIENT, 'utf8'))(win)
const UP = win.MES_UP
if (!UP) { console.error('❌ shared/displayUnitPrice.js 가 window.MES_UP 을 노출하지 않는다'); process.exit(1) }

const { mod: A, cleanup } = compileTs(AMOUNT_SRC)
const { computeLineAmount } = A

let pass = 0
const fails = []
function eq(name, got, want) {
  if (got === want) { pass++; return }
  fails.push(`${name}\n    기대 ${JSON.stringify(want)}\n    실제 ${JSON.stringify(got)}`)
}

// ── 1. 장당가 산식 ────────────────────────────────────────────────
// ★정본 사례 — 2026-09-08 용준님이 지적한 그 주문. 60×180cm·30장·㎡단가 2,778·공급가 150,000.
//   청구면적 = max(60,100)×180 = 1.0m×1.8m = 1.8㎡ ×30 = 54㎡ → 54×2,778 = 150,012 → 150,000
const REAL = { pricing_method: 'AREA', unit_price: 2778, quantity: 30, width: 60, height: 180, amount: 150000 }
eq('E2-20260831-041: 장당가', UP.perUnit(REAL), 5000)
eq('E2-20260831-041: ㎡단가', UP.perSqm(REAL), 2778)
eq('E2-20260831-041: 병기', UP.dual(REAL), '5,000원 (2,778원/㎡)')

eq('FIXED: 저장 단가가 곧 장당가',
  UP.perUnit({ pricing_method: 'FIXED', unit_price: 9000, quantity: 2, amount: 18000 }), 9000)
eq('FIXED: 병기할 ㎡단가 없음',
  UP.perSqm({ pricing_method: 'FIXED', unit_price: 9000, quantity: 2, amount: 18000 }), null)
eq('FIXED: 병기 문자열은 장당가 단독',
  UP.dual({ pricing_method: 'FIXED', unit_price: 9000, quantity: 2, amount: 18000 }), '9,000원')

// 에누리 — 표기는 **최종 청구액** 기준이어야 명세서와 맞는다
eq('에누리: 자동 100,000 → 실청구 90,000 · 10장',
  UP.perUnit({ pricing_method: 'AREA', unit_price: 5000, quantity: 10, amount: 90000 }), 9000)

// 폴백 — 나눌 수 없으면 저장값을 그대로 (0으로 죽이지 않는다)
eq('폴백: 수량 0', UP.perUnit({ quantity: 0, unit_price: 5000, amount: 150000 }), 5000)
eq('폴백: 수량 누락', UP.perUnit({ unit_price: 5000, amount: 150000 }), 5000)
eq('폴백: 금액 누락', UP.perUnit({ quantity: 3, unit_price: 700 }), 700)
eq('금액 0(단가 미정)은 0', UP.perUnit({ quantity: 5, unit_price: 0, amount: 0 }), 0)
eq('null 라인', UP.perUnit(null), 0)

// ★이관·자동적재 잔여 라인(unit_price 가 장당금액인 채로 남은 336건, 2026-09-08 prod 실측)
//   표기 축은 금액 파생이라 **영향을 받지 않는다** — 이 성질이 이 설계의 핵심 이득이다.
eq('의미 어긋난 저장단가여도 표기는 맞다',
  UP.perUnit({ pricing_method: 'AREA', unit_price: 8500, quantity: 30, width: 130, height: 90, amount: 255000 }), 8500)

// 100원 반올림이 수량으로 안 나눠떨어지는 경우 — 원 단위 반올림으로 표기한다
eq('나눠떨어지지 않음: 27,000 ÷ 7', UP.perUnit({ quantity: 7, amount: 27000, unit_price: 1 }), 3857)

// ── 2. 표기 축 ↔ 계산 축 정합 ─────────────────────────────────────
// `perUnit × 수량` 이 서버가 계산한 청구액과 같아야 한다. 한쪽 규칙만 바뀌면 여기서 걸린다.
const CASES = [
  { name: '60×180 ×30 @2778 (최소 1m 적용)', unit_price: 2778, quantity: 30, width: 60, height: 180 },
  { name: '600×90 ×35 @800', unit_price: 800, quantity: 35, width: 600, height: 90 },
  { name: '50×70 ×1 @3000 (양변 최소 1m)', unit_price: 3000, quantity: 1, width: 50, height: 70 },
  { name: '244×122 ×1 @9860 (10cm 올림)', unit_price: 9860, quantity: 1, width: 244, height: 122 },
]
for (const c of CASES) {
  const final = computeLineAmount(c, 'AREA').final
  const per = UP.perUnit({ pricing_method: 'AREA', unit_price: c.unit_price, quantity: c.quantity, amount: final })
  eq(`정합 ${c.name}: 장당가×수량 = 청구액`, per * c.quantity, final)
}

// 최소청구 없음(UV 판재) 축도 같은 정합이어야 한다
{
  const c = { unit_price: 120000, quantity: 1, width: 30, height: 15, min_billing_side_cm: 0 }
  const final = computeLineAmount(c, 'AREA').final
  eq('정합 UV판재 30×15 (최소청구 없음)',
    UP.perUnit({ pricing_method: 'AREA', unit_price: c.unit_price, quantity: 1, amount: final }) * 1, final)
}

// ── 3. 표시 4곳이 MES_UP 을 지나는가 (호출처 회귀 방지) ───────────
// 산식만 지키고 호출처를 안 보면 `fmt(it.unit_price)` 로 되돌려도 통과한다 —
// 2026-09-04 `cut:butt` 가 배포 경로에 안 물려 있어 아무도 안 돌린 것과 같은 종류의 구멍이다.
const SITES = [
  ['거래명세서', 'src/scripts/invoice.js', 'MES_UP.perUnit(it)'],
  ['견적서', 'src/scripts/quotation.js', 'MES_UP.perUnit(it)'],
  ['고객포털', 'src/pages/portal/portalDocument.ts', 'MES_UP.perUnit(r)'],
  ['주문상세(병기)', 'src/scripts/orders.js', 'MES_UP.dual(item)'],
  ['주문서 입력칸', 'src/scripts/orderForm/calc.js', 'MES_UP.perUnit('],
]
for (const [label, rel, needle] of SITES) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8')
  eq(`호출처 ${label} (${rel})`, src.includes(needle), true)
}

// 스크립트가 실제로 페이지에 실리는가 — 안 실리면 MES_UP 이 undefined 라 화면이 통째로 죽는다
const WIRED = [
  ['거래명세서', 'src/pages/invoice.ts'],
  ['견적서', 'src/pages/quotation.ts'],
  ['주문 목록·상세', 'src/pages/orders.ts'],
  ['주문서', 'src/pages/orderForm.ts'],
  ['고객포털', 'src/pages/portal/portalDocument.ts'],
]
for (const [label, rel] of WIRED) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8')
  eq(`주입 ${label} (${rel})`, /displayUnitPrice/.test(src) && /\$\{displayUnitPrice\}|displayUnitPrice,/.test(src), true)
}

cleanup()

if (fails.length) {
  console.error(`\n❌ 단가 표기 검증 실패 ${fails.length}건 (통과 ${pass})\n`)
  for (const f of fails) console.error('  - ' + f)
  process.exit(1)
}
console.log(`✅ 단가 표기 검증 ${pass}항목 통과`)
