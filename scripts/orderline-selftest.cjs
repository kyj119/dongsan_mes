#!/usr/bin/env node
/**
 * 주문 라인 금액 산식 자체검증 — `src/utils/orderLineAmount.ts` computeLineAmount()
 *
 * 왜 있는가: 그 파일 주석은 "서버 쪽은 단위 테스트(14케이스)가 지킨다"고 적혀 있었는데
 * **테스트 파일이 실재하지 않았다**(`npm test` = `curl localhost:3000`). 2026-08-11 최소 청구 규격
 * (0.5m×0.7m → 1m×1m)을 넣으면서 실측으로 발각. 산식은 화면(calc.js)과 서버 두 곳에 있고
 * 갈리면 "화면 금액 ≠ 저장 금액"이 되므로, 최소한 서버 쪽은 기계가 지켜야 한다.
 *
 * 실행: node scripts/orderline-selftest.cjs   (실패 시 exit 1)
 *
 * ⚠️ 클라(calc.js) 는 여기서 못 잡는다 — 브라우저 실측으로 확인할 것.
 *    두 곳의 규칙 상수(MIN_BILLING_SIDE_CM = 100 / MIN_SIDE = 100)가 같은지는 눈으로 봐야 한다.
 */
'use strict'

const { execFileSync } = require('child_process')
const path = require('path')
const fs = require('fs')
const os = require('os')

const SRC = path.join(__dirname, '..', 'src', 'utils', 'orderLineAmount.ts')
const ESBUILD = path.join(__dirname, '..', 'node_modules', 'esbuild', 'bin', 'esbuild')

// TS → CJS 트랜스파일 후 require. tsc 를 거치지 않으므로 타입 오류는 안 잡지만(그건 npm run typecheck 담당)
// 런타임 산식은 그대로다.
const outFile = path.join(os.tmpdir(), `orderLineAmount.selftest.${process.pid}.cjs`)
execFileSync(process.execPath, [ESBUILD, SRC, '--format=cjs', '--platform=node', `--outfile=${outFile}`], {
  stdio: ['ignore', 'ignore', 'inherit'],
})
const { computeLineAmount } = require(outFile)

let pass = 0
const fails = []

/** @param {string} name @param {object} input @param {string} pm @param {object} expect */
function check(name, input, pm, expect) {
  const got = computeLineAmount(input, pm)
  for (const k of Object.keys(expect)) {
    if (got[k] !== expect[k]) {
      fails.push(`${name}\n    ${k}: 기대 ${expect[k]} · 실제 ${got[k]}  (전체 ${JSON.stringify(got)})`)
      return
    }
  }
  pass++
}

// ── 최소 청구 규격 (2026-08-11 추가분) ────────────────────────────
// 용준님 확인: 0.5m×0.7m 는 1m×1m 로 청구한다.
check('최소규격: 50×70 → 1×1m', { unit_price: 3000, quantity: 1, width: 50, height: 70 }, 'AREA', { auto: 3000 })
check('최소규격: 24×40(0.1㎡) 도 1㎡', { unit_price: 3000, quantity: 1, width: 24, height: 40 }, 'AREA', { auto: 3000 })
// 한 변만 1m 미만 — 긴 변은 그대로 살아야 한다(실측 근거: 120×40 이 5,000원 = 1.2㎡).
check('최소규격: 120×40 → 1.2×1m', { unit_price: 4000, quantity: 1, width: 120, height: 40 }, 'AREA', { auto: 4800 })
check('최소규격: 40×120 → 1×1.2m', { unit_price: 4000, quantity: 1, width: 40, height: 120 }, 'AREA', { auto: 4800 })
// 정확히 100cm 는 올림 대상이 아니다(경계).
check('경계: 100×100 그대로', { unit_price: 5000, quantity: 1, width: 100, height: 100 }, 'AREA', { auto: 5000 })
// 최소규격이 안 걸리는 큰 규격은 기존 동작 그대로여야 한다(회귀 방지).
check('회귀: 600×90 → 6×1m', { unit_price: 8000, quantity: 1, width: 600, height: 90 }, 'AREA', { auto: 48000 })
check('회귀: 600×90 ×35매', { unit_price: 8000, quantity: 35, width: 600, height: 90 }, 'AREA', { auto: 1680000 })

// ── 10cm 올림 ─────────────────────────────────────────────────
check('10cm올림: 601×901 → 610×910', { unit_price: 1000, quantity: 1, width: 601, height: 901 }, 'AREA', { auto: 55500 })
check('10cm올림: 605×105 → 610×110', { unit_price: 1000, quantity: 1, width: 605, height: 105 }, 'AREA', { auto: 6700 })

// ── FIXED ────────────────────────────────────────────────────
check('FIXED: 규격 무시', { unit_price: 4200, quantity: 3, width: 10, height: 10 }, 'FIXED', { auto: 12600 })
check('FIXED: 규격 없음', { unit_price: 4200, quantity: 1 }, 'FIXED', { auto: 4200 })
// AREA 인데 규격이 없으면 FIXED 로 떨어진다(기존 동작).
check('AREA 규격없음 → 수량×단가', { unit_price: 4200, quantity: 2 }, 'AREA', { auto: 8400 })

// ── 100원 반올림 ──────────────────────────────────────────────
check('100원 반올림: 1,234 → 1,200', { unit_price: 1234, quantity: 1 }, 'FIXED', { auto: 1200 })
check('100원 반올림: 1,250 → 1,300', { unit_price: 1250, quantity: 1 }, 'FIXED', { auto: 1300 })

// ── 에누리(수동 금액) ─────────────────────────────────────────
check('에누리: 수동 감액', { unit_price: 5000, quantity: 1, width: 100, height: 100, amount: 4000 }, 'AREA',
  { auto: 5000, final: 4000, discount: 1000, manual: true })
check('에누리: 증액이면 음수 할인', { unit_price: 5000, quantity: 1, width: 100, height: 100, amount: 6000 }, 'AREA',
  { auto: 5000, final: 6000, discount: -1000, manual: true })
check('에누리: 자동값과 같으면 manual=false', { unit_price: 5000, quantity: 1, width: 100, height: 100, amount: 5000 }, 'AREA',
  { manual: false })
check('에누리: 문자열 금액도 수용', { unit_price: 5000, quantity: 1, amount: '4000' }, 'FIXED', { final: 4000, manual: true })
check('에누리: 빈 문자열은 미지정', { unit_price: 5000, quantity: 1, amount: '' }, 'FIXED', { final: 5000, manual: false })
check('에누리: 음수 허용(반품·조정)', { unit_price: 5000, quantity: 1, amount: -5000 }, 'FIXED', { final: -5000 })

// ── PENDING ──────────────────────────────────────────────────
check('미정 품목은 0원', { unit_price: 9999, quantity: 9, width: 600, height: 600, price_status: 'PENDING' }, 'AREA',
  { auto: 0, final: 0, manual: false })

// ── width_mm 별칭 (필드명은 mm 지만 값은 cm) ──────────────────
check('width_mm 별칭도 cm 로 읽는다', { unit_price: 3000, quantity: 1, width_mm: 50, height_mm: 70 }, 'AREA', { auto: 3000 })

try { fs.unlinkSync(outFile) } catch { /* 임시파일 정리 실패는 무시 */ }

if (fails.length) {
  process.stdout.write(`\n❌ ${fails.length}건 실패 / ${pass + fails.length}건 중\n\n`)
  for (const f of fails) process.stdout.write(`  - ${f}\n`)
  process.stdout.write('\n')
  process.exit(1)
}
process.stdout.write(`✓ orderLineAmount 자체검증 ${pass}/${pass}건 통과\n`)
