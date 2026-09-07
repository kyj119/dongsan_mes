#!/usr/bin/env node
/**
 * 매입 후보 판정 자체검증 — `src/utils/apCandidate.ts`
 *
 * 왜 있는가 (2026-09-07):
 *   발주 등록이 동산 08-06 · 선명 07-31 이후 0건이라, 통장 출금에서 매입 후보를 띄워
 *   빠뜨릴 수 없게 만든다. 그런데 이 판정은 **틀려도 200 이 나온다** — 후보가 하나 빠져도
 *   화면은 멀쩡하다. 값 대조만이 잡는다.
 *
 * 픽스처는 전부 **prod 실측 적요**다. 특히 두 개는 실제로 났던 오판의 재발 가드다:
 *   · 「운산직물6월외상대출금」이 제외어 **「대출」**에 걸려 1,330만이 통째로 빠졌다.
 *   · 「홈> 농협영광엔터김성」은 앞 **4자**만 공통이라 접두 5자로는 못 잡았다.
 *
 * 실행: node scripts/ap-candidate-selftest.cjs   (실패 시 exit 1)
 */
'use strict'

const path = require('path')
const { compileTs } = require('./lib/compile-ts.cjs')

const SRC = path.join(__dirname, '..', 'src', 'utils', 'apCandidate.ts')
const { mod, cleanup } = compileTs(SRC)
const { buildClientPool, classifyWithdrawal, normalizeName, isCandidate } = mod

let pass = 0
const fails = []

// ── 픽스처: prod 실측 거래처 (발주 건수는 2026-09-07 실측값) ──────────────────
const CLIENTS = [
  { id: 1, client_name: '운산직물', po_count: 96 },
  { id: 2, client_name: '영광엔터테인먼트', po_count: 9 },      // client_type 은 SALES 인데 발주가 있다
  { id: 3, client_name: '주식회사 가유텍스타일', po_count: 0 },  // 매출 명단에만 있다
  { id: 4, client_name: '(주)동산기획', po_count: 46 },          // 법인간 매입
  { id: 5, client_name: '호홍 주식회사', po_count: 16 },         // 정규화하면 2글자
  { id: 6, client_name: '바로', po_count: 6 },                   // 2글자 — 오탐의 원천
  { id: 7, client_name: '현대광고사(홍성)', po_count: 0 },       // 접두 오탐 가드용
  { id: 8, client_name: '(주)티피엠', po_count: 27 },
]
const POOL = buildClientPool(CLIENTS)

/** @param expect {verdict, client?, exact?} */
function check(name, tx, expect) {
  const got = classifyWithdrawal(tx, POOL)
  const okV = got.verdict === expect.verdict
  const okC = expect.client === undefined || got.client_name === expect.client
  const okE = expect.exact === undefined || got.exact === expect.exact
  if (okV && okC && okE) { pass++; return }
  fails.push(`${name}\n    기대 ${JSON.stringify(expect)}`
    + `\n    실제 verdict=${got.verdict} client="${got.client_name}" exact=${got.exact}`
    + `\n    근거 ${got.reasons.join(' · ')}`)
}

// ── ① 매입 확정어가 제외어보다 먼저다 (실제로 났던 사고) ─────────────────────
// 「외상대출금」 = 외상대 출금. 제외어 「대출」이 여기 걸려 운산직물 1,330만이 빠졌었다.
check('외상대출금이 「대출」로 제외되지 않는다', { counterpart_name: '운산직물6월외상대출금', entity_id: 2 },
  { verdict: 'STRONG', client: '운산직물' })
check('7월운산직물외상대출금도 같다', { counterpart_name: '7월운산직물외상대출금', entity_id: 2 },
  { verdict: 'STRONG', client: '운산직물' })
check('호홍(2글자)도 외상이면 후보로 남는다', { counterpart_name: '호홍6월외상대출금', entity_id: 2 },
  { verdict: 'LIKELY', client: '호홍 주식회사' })

// ── ② 은행 잡음 제거 + 이름 매칭 ─────────────────────────────────────────────
check('은행 접두(홈>·국민)를 떼고 이름을 찾는다', { counterpart_name: '홈> 국민운산직물', entity_id: 1 },
  { verdict: 'STRONG', client: '운산직물', exact: true })
check('(주)티.피.엠. 처럼 구분자가 껴도 찾는다', { counterpart_name: '(주)티.피.엠.7월외상', entity_id: 2 },
  { verdict: 'STRONG', client: '(주)티피엠' })

// ── ③ 잘린 이름 — 접두 4자 (실제로 났던 누락) ────────────────────────────────
// 「영광엔터김성」 ← 「영광엔터테인먼트」. 앞 4자만 공통이라 5자로는 못 잡는다.
check('적요가 이름을 잘라도 발주 이력이 있으면 찾는다',
  { counterpart_name: '홈> 농협영광엔터김성', entity_id: 1 },
  { verdict: 'LIKELY', client: '영광엔터테인먼트', exact: false })
// ⚠️그 대가로 4자 접두는 느슨하다 → **발주 이력이 없는 곳에는 쓰지 않는다**
check('발주 이력이 없으면 접두 매칭을 하지 않는다(오탐 가드)',
  { counterpart_name: '현대광고솜씨', entity_id: 1 },
  { verdict: 'UNKNOWN', client: '' })

// ── ④ 짧은 이름은 확실로 올리지 않는다 ───────────────────────────────────────
// 「홈> 기업바로장선부」가 공급처 「바로」(발주 6건)에 걸린다. 사람이 봐야 한다.
check('2글자 거래처 일치는 확실이 아니라 가능', { counterpart_name: '홈> 기업바로장선부', entity_id: 1 },
  { verdict: 'LIKELY', client: '바로' })

// ── ⑤ 자기법인 이체는 빼되, 법인간 매입은 살린다 ─────────────────────────────
check('동산이 동산에 보낸 것 = 계좌 이동', { counterpart_name: '(주)동산기획', entity_id: 1 },
  { verdict: 'EXCLUDE' })
check('선명이 동산에 보낸 것 = 법인간 매입', { counterpart_name: '(주)동산기획', entity_id: 2 },
  { verdict: 'STRONG', client: '(주)동산기획' })

// ── ⑥ 매입이 아닌 것 ────────────────────────────────────────────────────────
check('급여', { counterpart_name: '동산기획7월급여', entity_id: 1 }, { verdict: 'EXCLUDE' })
check('부가가치세', { counterpart_name: '부가가치세', entity_id: 1 }, { verdict: 'EXCLUDE' })
check('계좌간자금이체', { counterpart_name: '계좌간자금이체', entity_id: 2 }, { verdict: 'EXCLUDE' })
check('계정으로 제외 — 지급임차료', { counterpart_name: '8월분공장임차료지급', category_name: '지급임차료', entity_id: 2 },
  { verdict: 'EXCLUDE' })

// ── ⑦ 계정이 매입성이면 이름이 없어도 후보 ──────────────────────────────────
check('외주가공비는 이름을 못 찾아도 후보',
  { counterpart_name: '홈> 농협강설식_8월분', category_name: '외주가공비', entity_id: 1 },
  { verdict: 'LIKELY' })

// ── ⑧ 판정 불가 ────────────────────────────────────────────────────────────
check('미등록 개인명은 확인필요로 남는다', { counterpart_name: '김진수', entity_id: 1 },
  { verdict: 'UNKNOWN', client: '' })
check('적요 매입어만 있으면 가능', { counterpart_name: '스티커출력대금', entity_id: 1 },
  { verdict: 'LIKELY', client: '' })

// ── ⑨ 풀 구성 규약 ─────────────────────────────────────────────────────────
{
  // 2글자는 발주 이력이 있을 때만 들어온다 — 없으면 적요 아무 데나 걸린다
  const p = buildClientPool([{ id: 9, client_name: '초아', po_count: 0 }])
  if (p.length !== 0) fails.push('발주 없는 2글자 거래처는 풀에서 빠져야 한다 · 실제 ' + p.length)
  else pass++
  const p2 = buildClientPool([{ id: 10, client_name: '초아', po_count: 3 }])
  if (p2.length !== 1) fails.push('발주 있는 2글자 거래처는 풀에 남아야 한다 · 실제 ' + p2.length)
  else pass++
  // 긴 이름이 먼저 와야 **가장 구체적인 이름이 이긴다**
  const p3 = buildClientPool([
    { id: 11, client_name: '현대광고', po_count: 1 },
    { id: 12, client_name: '현대광고기획(배너)', po_count: 7 },
  ])
  if (p3[0].client.id !== 12) fails.push('긴 이름이 먼저 와야 한다 · 실제 ' + p3[0].client.client_name)
  else pass++
}

// ── ⑩ 정규화 ───────────────────────────────────────────────────────────────
{
  const cases = [
    ['주식회사 가유텍스타일', '가유텍스타일'],
    ['(주)티.피.엠.', '티피엠'],
    ['호홍 주식회사', '호홍'],
    ['（주）동산기획', '동산기획'],
  ]
  for (const [inp, want] of cases) {
    const got = normalizeName(inp)
    if (got !== want) fails.push(`정규화 "${inp}" → 기대 "${want}" · 실제 "${got}"`)
    else pass++
  }
}

// ── ⑪ 후보 판별 ────────────────────────────────────────────────────────────
for (const [v, want] of [['STRONG', true], ['LIKELY', true], ['UNKNOWN', true], ['EXCLUDE', false]]) {
  if (isCandidate(v) !== want) fails.push(`isCandidate(${v}) 기대 ${want}`)
  else pass++
}

cleanup()
if (fails.length) {
  console.error(`\n[ap-candidate] ❌ ${fails.length}건 실패 / ${pass + fails.length}건`)
  for (const f of fails) console.error('  - ' + f)
  process.exit(1)
}
console.log(`[ap-candidate] ✅ ${pass}건 통과`)
