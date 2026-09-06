#!/usr/bin/env node
/**
 * 매입 지급예정 대사 자체검증 — `src/utils/apSettlement.ts`
 *
 * 왜 있는가: 「이미 낸 돈을 앞으로 낼 돈으로 세지 않는다」는 판정은 문법이 멀쩡한 채로 틀릴 수 있고,
 * 틀려도 화면은 200 을 뱉는다(CLAUDE.md §계산 규칙 · §누적 캐시). typecheck·build·smoke 가 전부 통과한
 * 상태로 확정발주 37.4억 중 이미 지급한 24.8억이 계속 지급예정으로 잡혀 있었던 게 실제 사고다.
 *
 * 여기서 지키는 것:
 *   ① FIFO 충당이 잔액식(발주 − 지급 − 조정)과 같은 총액을 낸다
 *   ② 공급처·법인 경계를 넘지 않는다
 *   ③ 지급을 지우면 예정이 되살아난다(파생의 유일한 존재 이유 — 저장했다면 여기서 굳는다)
 *   ④ 런레이트가 '진행 중인 달'에 오염되지 않는다
 *   ⑤ 분산이 돈을 잃지 않는다(회차 합계 = 연체 총액)
 *
 * 실행: node scripts/ap-settle-selftest.cjs   (실패 시 exit 1)
 */
'use strict'

const { compileTs } = require('./lib/compile-ts.cjs')
const path = require('path')

// FIFO 충당(매입 전용)과 연체 분산(매입·매출 공용)이 다른 모듈이라 각각 컴파일한다.
// apSettlement 는 overdueSpread 를 import 하므로 bundle 이 필요하다.
const AP_SRC = path.join(__dirname, '..', 'src', 'utils', 'apSettlement.ts')
const SPREAD_SRC = path.join(__dirname, '..', 'src', 'utils', 'overdueSpread.ts')
const { mod: apMod, cleanup: apCleanup } = compileTs(AP_SRC, { bundle: true })
const { mod: spMod, cleanup: spCleanup } = compileTs(SPREAD_SRC)
const { settleApFifo } = apMod
const { paymentRunRate, runRateFromMonthly, medianPaymentDay, medianDayFromCounts, median, spreadOverdue, daysBetween } = spMod
const cleanup = () => { apCleanup?.(); spCleanup?.() }

let pass = 0
const fails = []

function check(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected)
  if (a === e) { pass++; return }
  fails.push(`${name}\n    기대: ${e}\n    실제: ${a}`)
}

const ob = (ref, due, amount, extra) => Object.assign({ ref, supplierId: 1, entityId: 1, due, amount }, extra || {})
const pay = (date, amount, extra) => Object.assign({ supplierId: 1, entityId: 1, date, amount, kind: 'PAYMENT' }, extra || {})
const settledOf = (r, ref) => r.settledByRef.get(ref) || 0

// ── ① FIFO 충당 ─────────────────────────────────────────────────────────────
{
  // 오래된 예정부터 갚는다. 60만으로 50만(1월)을 다 갚고 10만이 2월로 넘어간다.
  const r = settleApFifo(
    [ob('po:1', '2026-01-31', 500000), ob('po:2', '2026-02-28', 300000)],
    [pay('2026-02-05', 600000)]
  )
  check('FIFO — 오래된 건이 먼저 닫힌다', settledOf(r, 'po:1'), 500000)
  check('FIFO — 남은 몫이 다음 건으로', settledOf(r, 'po:2'), 100000)
  check('FIFO — 과충당 없음', r.unappliedTotal, 0)
}
{
  // 예정일이 같으면 ref 순 — 순서가 미정의면 같은 입력에 다른 답이 나온다(목록 정렬 tie-break와 같은 이유).
  const r = settleApFifo(
    [ob('po:9', '2026-01-31', 100000), ob('po:2', '2026-01-31', 100000)],
    [pay('2026-02-01', 100000)]
  )
  check('FIFO — 동일 예정일은 ref 순 tie-break', [settledOf(r, 'po:2'), settledOf(r, 'po:9')], [100000, 0])
}
{
  const r = settleApFifo([ob('po:1', '2026-01-31', 500000)], [pay('2026-02-05', 200000)])
  check('부분 지급 — 잔여가 남는다', settledOf(r, 'po:1'), 200000)
}
{
  const r = settleApFifo([ob('po:1', '2026-01-31', 100000)], [pay('2026-02-05', 300000)])
  check('과지급 — 채무를 음수로 만들지 않는다', settledOf(r, 'po:1'), 100000)
  check('과지급 — 남은 지급은 unapplied 로', r.unappliedTotal, 200000)
}
{
  const r = settleApFifo([], [pay('2026-02-05', 70000)])
  check('발주 없는 지급 — 전액 unapplied', r.unappliedTotal, 70000)
  // 총액만으로는 아무도 못 고친다 — 어느 거래처인지가 남아야 한다.
  check('발주 없는 지급 — 거래처별로 남는다', [...r.unappliedBySupplier.entries()], [[1, 70000]])
}
{
  // 여러 공급처가 섞여도 각자에게 귀속된다.
  const r = settleApFifo(
    [ob('po:1', '2026-01-31', 100000)],
    [pay('2026-02-01', 130000), Object.assign(pay('2026-02-01', 50000), { supplierId: 7 })]
  )
  check('unapplied 귀속 — 공급처별', [r.unappliedBySupplier.get(1), r.unappliedBySupplier.get(7)], [30000, 50000])
}
{
  // 이미 DONE 처리된 행은 충당 대상이 아니되 풀은 소진시킨다. 안 그러면 같은 지급이 다른 예정을 또 지운다.
  const r = settleApFifo(
    [ob('cs:1', '2026-01-31', 200000, { done: true, doneAmount: 200000 }), ob('po:2', '2026-02-28', 300000)],
    [pay('2026-02-05', 200000)]
  )
  check('DONE — 자기 금액을 풀에서 뺀다', settledOf(r, 'cs:1'), 200000)
  check('DONE — 남의 예정을 지우지 않는다', settledOf(r, 'po:2'), 0)
}
{
  // 조정(감액)은 현금은 아니지만 채무를 줄이는 것은 같다.
  const r = settleApFifo(
    [ob('po:1', '2026-01-31', 500000)],
    [{ supplierId: 1, entityId: 1, date: '2026-02-01', amount: 500000, kind: 'ADJUSTMENT' }]
  )
  check('조정 — 채무를 줄인다', settledOf(r, 'po:1'), 500000)
}
{
  // 총액 보존: 충당 합계 + 잔여 = 채무 합계
  const obs = [ob('po:1', '2026-01-31', 500000), ob('po:2', '2026-02-28', 300000), ob('po:3', '2026-03-31', 200000)]
  const r = settleApFifo(obs, [pay('2026-02-05', 640000)])
  const settled = obs.reduce((a, o) => a + settledOf(r, o.ref), 0)
  const remaining = obs.reduce((a, o) => a + (o.amount - settledOf(r, o.ref)), 0)
  check('총액 보존 — 충당+잔여=채무', [settled, remaining, settled + remaining], [640000, 360000, 1000000])
}

// ── ② 경계 ─────────────────────────────────────────────────────────────────
{
  const r = settleApFifo(
    [ob('po:1', '2026-01-31', 100000), Object.assign(ob('po:2', '2026-01-31', 100000), { entityId: 2 })],
    [pay('2026-02-01', 100000)]
  )
  check('법인 경계 — E1 지급이 E2 채무를 못 지운다', [settledOf(r, 'po:1'), settledOf(r, 'po:2')], [100000, 0])
}
{
  const r = settleApFifo(
    [ob('po:1', '2026-01-31', 100000), Object.assign(ob('po:2', '2026-01-31', 100000), { supplierId: 2 })],
    [pay('2026-02-01', 100000)]
  )
  check('공급처 경계 — 다른 공급처를 못 지운다', [settledOf(r, 'po:1'), settledOf(r, 'po:2')], [100000, 0])
}

// ── ③ 파생의 성질: 되돌리기·멱등 ────────────────────────────────────────────
{
  const obs = [ob('po:1', '2026-01-31', 500000)]
  const before = settleApFifo(obs, [pay('2026-02-05', 500000)])
  const after = settleApFifo(obs, [])   // 지급을 지웠다
  check('되돌리기 — 지급을 지우면 예정이 되살아난다', [settledOf(before, 'po:1'), settledOf(after, 'po:1')], [500000, 0])
}
{
  const obs = [ob('po:1', '2026-01-31', 500000), ob('po:2', '2026-02-28', 300000)]
  const evs = [pay('2026-02-05', 600000)]
  const a = settleApFifo(obs, evs), b = settleApFifo(obs, evs)
  check('멱등 — 두 번 돌려도 같다', [settledOf(a, 'po:1'), settledOf(a, 'po:2')], [settledOf(b, 'po:1'), settledOf(b, 'po:2')])
}

// ── 관측 지연 ───────────────────────────────────────────────────────────────
{
  const r = settleApFifo([ob('po:1', '2026-01-01', 100000)], [pay('2026-01-11', 100000)])
  check('관측 지연 — 닫힌 건의 실지급일−예정일', r.lagSamples, [10])
}
{
  const r = settleApFifo([ob('po:1', '2026-01-01', 100000)], [pay('2026-01-11', 40000)])
  check('관측 지연 — 부분 지급은 표본이 아니다', r.lagSamples, [])
}
{
  // 예정보다 일찍 낸 경우 음수. 평균이 아니라 중앙값을 쓰는 이유가 이런 꼬리값이다.
  const r = settleApFifo([ob('po:1', '2026-02-01', 100000)], [pay('2026-01-20', 100000)])
  check('관측 지연 — 조기 지급은 음수', r.lagSamples, [-12])
}
{
  // 채무가 생기기 전의 지급으로 닫힌 짝은 표본이 아니다.
  // prod 에서 이 가드가 없어 중앙값이 −111일로 나왔다(이관이 지급 이력만 먼저 넣은 탓).
  const r = settleApFifo(
    [ob('po:1', '2026-05-01', 100000, { notBefore: '2026-04-01' })],
    [pay('2026-01-10', 100000)]
  )
  check('관측 지연 — 채무 생성 전 지급은 표본 제외', r.lagSamples, [])
  check('관측 지연 — 그래도 충당은 된다(잔액은 원장 항등식)', settledOf(r, 'po:1'), 100000)
}
{
  const r = settleApFifo(
    [ob('po:1', '2026-05-01', 100000, { notBefore: '2026-04-01' })],
    [pay('2026-04-20', 100000)]
  )
  check('관측 지연 — 생성 후 조기 지급은 표본에 남는다', r.lagSamples, [-11])
}
check('daysBetween', daysBetween('2026-01-01', '2026-01-11'), 10)
check('daysBetween — 잘못된 값은 null', daysBetween('', '2026-01-11'), null)
check('median — 홀수', median([1, 5, 3]), 3)
check('median — 짝수는 평균', median([1, 2, 4, 5]), 3)
check('median — 빈 표본은 null', median([]), null)

// ── ④ 런레이트 ─────────────────────────────────────────────────────────────
{
  // 마지막 입력월(3월)은 진행 중일 수 있으므로 평균에서 뺀다.
  // 이걸 안 빼면 prod 실측처럼 8월(4건)이 평균을 통째로 끌어내린다.
  const evs = [pay('2026-01-10', 300), pay('2026-02-10', 500), pay('2026-03-01', 10)]
  const rr = paymentRunRate(evs)
  check('런레이트 — 마지막 입력월 제외', [rr.rate, rr.months, rr.basis, rr.lastMonth], [400, 2, '2026-01~2026-02', '2026-03'])
}
{
  const rr = paymentRunRate([pay('2026-03-01', 900)])
  check('런레이트 — 표본이 한 달뿐이면 그 달을 쓴다', [rr.rate, rr.months], [900, 1])
}
{
  const rr = paymentRunRate([])
  check('런레이트 — 표본 없음', [rr.rate, rr.months, rr.lastMonth], [0, 0, null])
}
{
  const evs = [
    pay('2026-01-10', 100), { supplierId: 1, entityId: 1, date: '2026-01-20', amount: 999, kind: 'ADJUSTMENT' },
    pay('2026-02-10', 100),
  ]
  const rr = paymentRunRate(evs)
  check('런레이트 — 조정은 현금이 아니라 세지 않는다', rr.rate, 100)
}
{
  const evs = []
  for (let m = 1; m <= 9; m++) evs.push(pay('2026-' + String(m).padStart(2, '0') + '-10', m * 100))
  const rr = paymentRunRate(evs, 3)   // 완결월 1~8 중 최근 3개 = 6,7,8월 → (600+700+800)/3
  check('런레이트 — 최근 N개월만', [rr.rate, rr.months, rr.basis], [700, 3, '2026-06~2026-08'])
}
check('대표 지급일 — 중앙값', medianPaymentDay([pay('2026-01-05', 1), pay('2026-01-25', 1), pay('2026-02-15', 1)]), 15)
check('대표 지급일 — 표본 없으면 25일', medianPaymentDay([]), 25)
// 행이 수천 건인 수금 쪽은 GROUP BY 결과만 넘긴다 — 행 버전과 같은 답이 나와야 한다(사본이 아니라 위임).
check('월별합계 런레이트 — 행 버전과 동일',
  runRateFromMonthly(new Map([['2026-01', 300], ['2026-02', 500], ['2026-03', 10]])).rate,
  paymentRunRate([pay('2026-01-10', 300), pay('2026-02-10', 500), pay('2026-03-01', 10)]).rate)
check('일자별 건수 대표일 — 행 버전과 동일',
  medianDayFromCounts(new Map([[5, 1], [25, 1], [15, 1]])),
  medianPaymentDay([pay('2026-01-05', 1), pay('2026-01-25', 1), pay('2026-02-15', 1)]))
check('일자별 건수 — 표본 없으면 25일', medianDayFromCounts(new Map()), 25)

// ── ⑤ 연체 분산 ────────────────────────────────────────────────────────────
{
  const t = spreadOverdue(1000, 300, '2026-09-05', 25)
  check('분산 — 회차 수 = ceil(총액/런레이트)', t.length, 4)
  check('분산 — 돈을 잃지 않는다', t.reduce((a, x) => a + x.amount, 0), 1000)
  check('분산 — 마지막 회차가 나머지', t[3].amount, 100)
  check('분산 — 날짜가 월별로 넘어간다', t.map(x => x.date), ['2026-09-25', '2026-10-25', '2026-11-25', '2026-12-25'])
}
{
  // 이번 달 대표일이 이미 지났으면 예측 시작일로 당긴다 — 과거 날짜에 얹으면 곡선 밖으로 떨어져 돈이 사라진다.
  const t = spreadOverdue(500, 300, '2026-09-28', 25)
  check('분산 — 지난 대표일은 시작일로 당긴다', t[0].date, '2026-09-28')
  check('분산 — 둘째 회차는 정상 대표일', t[1].date, '2026-10-25')
}
{
  const t = spreadOverdue(1000, 300, '2026-11-05', 31)
  check('분산 — 말일 초과 대표일은 그 달 말일로', t.map(x => x.date), ['2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28'])
}
{
  check('분산 — 런레이트 0 이면 분산하지 않는다', spreadOverdue(1000, 0, '2026-09-05', 25), [])
  check('분산 — 연체 0 이면 빈 배열', spreadOverdue(0, 300, '2026-09-05', 25), [])
}
{
  const t = spreadOverdue(1000, 300, '2026-09-05', 25, 2)
  check('분산 — 상한 초과분은 마지막 회차에 몰아 넣는다', [t.length, t.reduce((a, x) => a + x.amount, 0)], [2, 1000])
}

cleanup()

if (fails.length) {
  console.error(`\n[ap-settle-selftest] FAIL ${fails.length}건 / 통과 ${pass}건\n`)
  for (const f of fails) console.error('  ✗ ' + f)
  process.exit(1)
}
console.log(`[ap-settle-selftest] OK — ${pass}개 항목 통과`)
