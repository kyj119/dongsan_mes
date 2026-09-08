#!/usr/bin/env node
/**
 * 자금예측 베이스라인 자체검증 — `src/utils/baselineFlow.ts`
 *
 * ★왜 있는가 (2026-09-09)
 *   유출은 「반복되는 것」이 미래로 깔리는데 유입은 **지금 있는 것만** 썼다. prod 실측(법인1):
 *   9월 유입 632,379,676 → 10월 3,367,045 → **11월 이후 0**, 유출은 매월 6,300만이 남아
 *   90일 뒤 잔액 −396,688,121 · 위험일 49/90. **매월 5.3억 들어오는 회사인데** 그렇게 찍혔다.
 *   이 판정이 틀리면 화면은 200 이고 표도 그려진다 — 숫자만 조용히 틀린다.
 *
 * ★특히 지키는 것
 *   ① 이중계상 — 확정분이 이미 평균 이상인 달엔 **0** 을 더한다(max(0, rate − existing)).
 *   ② 진행 중인 달 — 첫 달은 실적이 반쯤 들어와 있어 평균과 비교하면 **없는 돈이 생긴다**.
 *   ③ 근거 부족 — 완결월 3개월 미만이면 아무것도 깔지 않는다(조용히 추정하지 않는다).
 *
 * 실행: node scripts/baseline-flow-selftest.cjs   (실패 시 exit 1)
 */
'use strict'

const { compileTs } = require('./lib/compile-ts.cjs')
const path = require('path')
const SRC = path.join(__dirname, '..', 'src', 'utils', 'baselineFlow.ts')
const { mod, cleanup } = compileTs(SRC)
const { baselineTopUps, monthsInWindow, monthDay, BASELINE_MIN_MONTHS, BASELINE_NOISE_RATIO } = mod

let pass = 0
const fails = []
const check = (name, got, want) => {
  const g = typeof got === 'object' ? JSON.stringify(got) : got
  const w = typeof want === 'object' ? JSON.stringify(want) : want
  if (g === w) pass++
  else fails.push(`${name}: got ${g} / want ${w}`)
}
const M = (o) => new Map(Object.entries(o))
const RATE = 500000000

{
  const win = ['2026-09', '2026-10', '2026-11', '2026-12']

  // ① 이중계상 방지 — 확정분이 평균 이상이면 0
  const r1 = baselineTopUps(RATE, 6, M({ '2026-10': 600000000, '2026-11': 0 }), win)
  check('확정분이 평균 이상인 달은 안 깐다', r1.find(x => x.month === '2026-10'), undefined)
  check('확정분 없는 달은 평균 전액', r1.find(x => x.month === '2026-11').amount, RATE)

  // 부분 확정 → 차액만
  const r2 = baselineTopUps(RATE, 6, M({ '2026-10': 200000000 }), win)
  check('부분 확정은 차액만 보충', r2.find(x => x.month === '2026-10').amount, 300000000)
  check('확정분을 같이 돌려준다', r2.find(x => x.month === '2026-10').existing, 200000000)

  // ② 진행 중인 달(첫 달)은 건너뛴다
  check('첫 달은 건너뛴다', r1.some(x => x.month === '2026-09'), false)
  check('끄면 첫 달도 깐다', baselineTopUps(RATE, 6, M({}), win, false).some(x => x.month === '2026-09'), true)

  // ③ 근거 부족이면 아무것도 안 한다
  check('완결월 2개월이면 안 깐다', baselineTopUps(RATE, 2, M({}), win).length, 0)
  check(`경계 ${BASELINE_MIN_MONTHS}개월은 깐다`, baselineTopUps(RATE, BASELINE_MIN_MONTHS, M({}), win).length > 0, true)
  check('런레이트 0 이면 안 깐다', baselineTopUps(0, 6, M({}), win).length, 0)
  check('런레이트 음수도 안 깐다', baselineTopUps(-1, 6, M({}), win).length, 0)

  // 노이즈 컷 — 평균의 2% 미만 보충은 버린다
  const nearFull = RATE - RATE * BASELINE_NOISE_RATIO / 2
  check('노이즈(평균의 1%)는 버린다', baselineTopUps(RATE, 6, M({ '2026-10': nearFull }), win).some(x => x.month === '2026-10'), false)
  const overFloor = RATE - RATE * BASELINE_NOISE_RATIO * 2
  check('노이즈 기준 위는 남긴다', baselineTopUps(RATE, 6, M({ '2026-10': overFloor }), win).some(x => x.month === '2026-10'), true)

  // 정수로 떨어진다
  check('금액은 정수', Number.isInteger(baselineTopUps(333333333.7, 6, M({}), win)[0].amount), true)
  check('빈 창이면 빈 결과', baselineTopUps(RATE, 6, M({}), []).length, 0)
}

// prod 실측 재현 — 법인1 2026-09-08
{
  const win = ['2026-09', '2026-10', '2026-11', '2026-12']
  const existing = M({ '2026-09': 632379676, '2026-10': 3367045, '2026-11': 0, '2026-12': 0 })
  const r = baselineTopUps(529740792, 6, existing, win)
  check('prod: 9월(확정 6.32억 > 평균)은 대상 아님', r.some(x => x.month === '2026-09'), false)
  check('prod: 10월 보충', r.find(x => x.month === '2026-10').amount, 529740792 - 3367045)
  check('prod: 11월 보충 = 평균 전액', r.find(x => x.month === '2026-11').amount, 529740792)
  check('prod: 보충 대상 3개월', r.length, 3)
}

// 월 목록·날짜 클램프
{
  check('월 목록', monthsInWindow('2026-09-08', '2026-12-07'), ['2026-09', '2026-10', '2026-11', '2026-12'])
  check('한 달짜리 창', monthsInWindow('2026-09-01', '2026-09-30'), ['2026-09'])
  check('연도 넘김', monthsInWindow('2026-11-15', '2027-02-01'), ['2026-11', '2026-12', '2027-01', '2027-02'])
  check('말일 클램프(2월 31일 금지)', monthDay('2027-02', 31), '2027-02-28')
  check('윤년 2월', monthDay('2028-02', 30), '2028-02-29')
  check('평범한 날', monthDay('2026-10', 15), '2026-10-15')
  check('0 이하는 1일로', monthDay('2026-10', 0), '2026-10-01')
}

cleanup()
if (fails.length) {
  console.error(`\n✗ 자금예측 베이스라인 자체검증 실패 ${fails.length}건 (통과 ${pass})`)
  for (const f of fails) console.error('  · ' + f)
  process.exit(1)
}
console.log(`✓ 자금예측 베이스라인 자체검증 통과 ${pass}항목`)
