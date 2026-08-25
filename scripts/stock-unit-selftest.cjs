#!/usr/bin/env node
/**
 * 재고 단위 라벨 자체검증 — `src/utils/rollConsumption.ts` resolveStockUnit() / computeRollConsumption()
 *
 * 왜 있는가 (2026-08-26): 폴백이 "m·cm 아니면 yd" 라서 **잉크가 「27 yd」로 표시**됐다.
 *   computeRollConsumption 은 ROLL 자재만 지나가므로 그 폴백이 맞았지만, resolveStockUnit 은
 *   **전 품목**이 지나간다(주간 실사 라인 전개·출고 저재고 알림). prod 실측으로 base_unit 'L' 83품목과
 *   base_unit 없는 비-ROLL 445품목이 전부 yd 로 찍히고 있었다.
 *
 * 이 종류는 타입체크·빌드·smoke 를 전부 통과한다 — 'yd' 도 유효한 문자열이다. 값 대조만이 잡는다.
 *
 * 실행: node scripts/stock-unit-selftest.cjs   (실패 시 exit 1)
 */
'use strict'

const { compileTs } = require('./lib/compile-ts.cjs')
const path = require('path')

const SRC = path.join(__dirname, '..', 'src', 'utils', 'rollConsumption.ts')
const { mod: _m, cleanup: _cleanup } = compileTs(SRC)
const { resolveStockUnit, computeRollConsumption } = _m

let pass = 0
const fails = []

/** @param {string} name @param {object} item @param {string} expect */
function unit(name, item, expect) {
  const got = resolveStockUnit(item)
  if (got !== expect) fails.push(`${name}\n    기대 '${expect}' · 실제 '${got}'  (입력 ${JSON.stringify(item)})`)
  else pass++
}

/** @param {string} name @param {object} item @param {number} mm @param {number} n @param {object} expect */
function consume(name, item, mm, n, expect) {
  const got = computeRollConsumption(item, mm, n)
  const qtyOk = Math.abs(got.qty - expect.qty) < 0.0001
  if (!qtyOk || got.unit !== expect.unit) {
    fails.push(`${name}\n    기대 ${expect.qty}${expect.unit} · 실제 ${got.qty}${got.unit}`)
  } else pass++
}

// ── ① base_unit 이 있으면 그대로 ─────────────────────────────────────
// 재고 수량이 실제로 그 단위로 저장돼 있다. 대소문자만 정규화한다.
unit('미터 재고', { base_unit: 'M', unit: '롤', pack_size: 50, deduction_method: 'ROLL' }, 'm')
unit('미터 재고(소문자)', { base_unit: 'm', unit: '롤' }, 'm')
unit('cm 재고', { base_unit: 'cm', unit: '롤' }, 'cm')
// ★핵심 회귀 — 엡손 솔벤잉크. 종전엔 'yd' 가 나왔다.
unit('★잉크 L 재고', { base_unit: 'L', unit: '통', pack_size: 1.5, deduction_method: 'NONE' }, 'L')
unit('★잉크는 ROLL 이어도 L', { base_unit: 'L', unit: '통', deduction_method: 'ROLL' }, 'L')

// ── ② base_unit 없음 + ROLL 차감 → yd ────────────────────────────────
// computeRollConsumption 이 yd 로 빼므로(len/914.4) 재고도 yd 다. 이 분기는 종전과 같아야 한다.
unit('현수막 원단(ROLL·yd)', { base_unit: null, unit: 'yd', deduction_method: 'ROLL' }, 'yd')
unit('ROLL 인데 unit 이 EA', { base_unit: null, unit: 'EA', deduction_method: 'ROLL' }, 'yd')
unit('ROLL 인데 unit 이 장', { base_unit: '', unit: '장', deduction_method: 'ROLL' }, 'yd')

// ── ③ base_unit 없음 + BOARD → 장 ────────────────────────────────────
// 종전엔 호출측(materialRequirement)에서만 '장' 으로 바꿔 실사·알림 경로에선 yd 였다.
unit('판재(BOARD)', { base_unit: null, unit: '장', deduction_method: 'BOARD' }, '장')
unit('BOARD 는 unit 과 무관하게 장', { base_unit: null, unit: 'EA', deduction_method: 'BOARD' }, '장')

// ── ④ 나머지는 품목 자신의 단위 ──────────────────────────────────────
unit('부속(EA)', { base_unit: null, unit: 'EA', deduction_method: 'NONE' }, 'EA')
unit('통 단위 자재', { base_unit: null, unit: '통', deduction_method: 'NONE' }, '통')
unit('차감방식 미설정', { base_unit: null, unit: 'EA', deduction_method: null }, 'EA')
unit('㎡ 단위', { base_unit: null, unit: '㎡' }, '㎡')
// 아무 정보도 없으면 빈 문자열 — 호출측이 `|| 'EA'` 로 받는다(inventory.ts). 'yd' 로 지어내지 않는다.
unit('★정보 없음은 yd 가 아니라 빈값', { base_unit: null, unit: null, deduction_method: null }, '')

// ── ⑤ 차감 산식은 건드리지 않았다(회귀 가드) ──────────────────────────
consume('미터 차감: 3000mm ×2', { base_unit: 'M' }, 3000, 2, { qty: 6, unit: 'm' })
consume('cm 차감: 3000mm ×1', { base_unit: 'cm' }, 3000, 1, { qty: 300, unit: 'cm' })
consume('yd 차감: 914.4mm ×2', { base_unit: null }, 914.4, 2, { qty: 2, unit: 'yd' })
// ⚠️ 차감은 base_unit 만 본다 — deduction_method 를 봐서 갈리면 안 된다(표기 규칙과 별개).
consume('차감은 base_unit 만 본다', { base_unit: null, deduction_method: 'BOARD', unit: '장' }, 914.4, 1, { qty: 1, unit: 'yd' })

_cleanup()

if (fails.length) {
  process.stdout.write(`\n❌ ${fails.length}건 실패 / ${pass + fails.length}건 중\n\n`)
  for (const f of fails) process.stdout.write(`  - ${f}\n`)
  process.stdout.write('\n')
  process.exit(1)
}
process.stdout.write(`✓ 재고 단위 라벨 자체검증 ${pass}/${pass}건 통과\n`)
