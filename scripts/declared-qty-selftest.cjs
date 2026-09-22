#!/usr/bin/env node
/**
 * 과다 출력 판정의 분모 — `src/utils/printFileName.ts`
 *
 * ① parseDeclaredQty — 두 축의 파일명을 다 읽는가. 2026-09-22 실기를 못박는다: TOPM-01 에 1EA 주문을
 *    2매 출력했는데 과다가 안 떴다 — 판정이 패널 축 정규식(`-N장)`)만 갖고 있어 에이전트 축(`-1EA-E1-…`)을 안 읽었다.
 * ② declaredQtyFor — **카드 수량이 있으면 그것이 정본**, 없으면 파일명(2026-09-22 구조개선). 양면 배수는 두 경로가 같이 쓴다.
 *
 * 실행: node scripts/declared-qty-selftest.cjs  (= npm run test:declared-qty, test:calc 체인 포함)
 */
'use strict'
const { compileTs } = require('./lib/compile-ts.cjs')
const path = require('path')

const { mod, cleanup } = compileTs(path.join(__dirname, '..', 'src', 'utils', 'printFileName.ts'))
const { parseDeclaredQty, declaredQtyFor, doubleSidedFactor } = mod

let pass = 0
const fails = []
function eq(name, got, want) {
  if (got === want) pass++
  else fails.push(name + ': got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want))
}

// ① 파일명 — 패널 축 「(폭-높이-N조|N장)」
eq('패널 N장', parseDeclaredQty('(현수막)두용기획 북부임영진(490-60-2장)열재단_퇴근'), 2)
eq('패널 N조', parseDeclaredQty('디자인뱅크(논산) 강경젓갈축제(60-180-80조)'), 80)
eq('패널 공백 허용', parseDeclaredQty('07-매일안전-김종천(800X120-15 장)각목조립'), 15)
// ① 파일명 — 에이전트 축 「…-NEA-E1-yyyymmdd-nnn-nnn」 (실기 이름 그대로)
eq('★에이전트 NEA', parseDeclaredQty('에이블D-500x120_1-10-BYD광주전시장-원형나무-1EA-E1-20260922-001-001'), 1)
eq('에이전트 여러 자리', parseDeclaredQty('거래처-내용-12EA-E1-20260922-003-001'), 12)
// 양면 = 앞뒤 2매 → ×2 (규칙은 한 곳)
eq('양면 ×2', parseDeclaredQty('거래처 양면배너(60-180-3조)'), 6)
eq('양면 배수', doubleSidedFactor('x 양면 y'), 2)
eq('단면 배수', doubleSidedFactor('x y'), 1)
// 못 읽으면 null — 추측으로 배지를 찍지 않는다
eq('UNMATCHED', parseDeclaredQty('UNMATCHED-20260922123810'), null)
eq('수량 없음', parseDeclaredQty('08 (77x77)'), null)
eq('빈 값', parseDeclaredQty(null), null)
eq('0 은 선언이 아니다', parseDeclaredQty('x(60-180-0장)'), null)

// ② 분모 선택 — 카드가 정본
const agentName = '에이블D-500x120_1-10-BYD광주전시장-원형나무-1EA-E1-20260922-001-001'
let d = declaredQtyFor(agentName, 1)
eq('★카드 수량이 있으면 카드', d.qty, 1); eq('  source=card', d.source, 'card')
d = declaredQtyFor('(패트베너)BYD(62x182-1장)사방큰펀칭', 3)
eq('카드 3 ≠ 파일명 1 이면 카드가 이긴다', d.qty, 3); eq('  source=card', d.source, 'card')
d = declaredQtyFor('(패트베너)BYD(62x182-1장)사방큰펀칭', null)
eq('카드 없으면 파일명', d.qty, 1); eq('  source=file', d.source, 'file')
d = declaredQtyFor('거래처 양면배너(60-180-3조)', 3)
eq('카드 경로도 양면 ×2', d.qty, 6)
d = declaredQtyFor('UNMATCHED-20260922123810', null)
eq('둘 다 없으면 판정하지 않는다', d.qty, null); eq('  source=null', d.source, null)
d = declaredQtyFor('UNMATCHED-20260922123810', 0)
eq('카드 수량 0 은 정본이 아니다 → 파일명 → null', d.qty, null)

if (typeof cleanup === 'function') cleanup()
console.log('\n선언 수량 판독 (utils/printFileName) — ' + pass + ' 통과' + (fails.length ? ' · ' + fails.length + ' 실패' : ''))
for (const f of fails) console.log('  FAIL ' + f)
process.exit(fails.length ? 1 : 0)
