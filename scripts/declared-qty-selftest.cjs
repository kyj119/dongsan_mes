#!/usr/bin/env node
/**
 * 과다 출력 판정의 분모 — `src/utils/printFileName.ts` parseDeclaredQty()
 *
 * 두 축의 파일명을 다 읽는가. 2026-09-22 실기를 못박는다 — TOPM-01 에 1EA 주문을 2매 출력했는데
 * 과다가 안 떴다: 판정이 패널 축 정규식(`-N장)`)만 갖고 있어 에이전트 축 이름(`-1EA-E1-…`)을 아예 안 읽었다.
 *
 * 실행: node scripts/declared-qty-selftest.cjs  (= npm run test:declared-qty, test:calc 체인 포함)
 */
'use strict'
const { compileTs } = require('./lib/compile-ts.cjs')
const path = require('path')

const { mod, cleanup } = compileTs(path.join(__dirname, '..', 'src', 'utils', 'printFileName.ts'))
const { parseDeclaredQty } = mod

let pass = 0
const fails = []
function eq(name, got, want) {
  if (got === want) pass++
  else fails.push(name + ': got ' + got + ' want ' + want)
}

// 패널 축 — 「(폭-높이-N조|N장)」
eq('패널 N장', parseDeclaredQty('(현수막)두용기획 북부임영진(490-60-2장)열재단_퇴근'), 2)
eq('패널 N조', parseDeclaredQty('디자인뱅크(논산) 강경젓갈축제(60-180-80조)'), 80)
eq('패널 공백 허용', parseDeclaredQty('07-매일안전-김종천(800X120-15 장)각목조립'), 15)

// 에이전트 축 — 「…-NEA-E1-yyyymmdd-nnn-nnn」 (2026-09-22 실기 이름 그대로)
eq('★에이전트 NEA', parseDeclaredQty('에이블D-500x120_1-10-BYD광주전시장-원형나무-1EA-E1-20260922-001-001'), 1)
eq('에이전트 여러 자리', parseDeclaredQty('거래처-내용-12EA-E1-20260922-003-001'), 12)

// 양면 = 앞뒤 2매가 정상 → ×2. 규칙은 한 곳(호출부가 아니라 여기).
eq('양면 ×2', parseDeclaredQty('거래처 양면배너(60-180-3조)'), 6)

// 못 읽으면 null — 추측으로 배지를 찍지 않는다
eq('UNMATCHED', parseDeclaredQty('UNMATCHED-20260922123810'), null)
eq('수량 없음', parseDeclaredQty('08 (77x77)'), null)
eq('빈 값', parseDeclaredQty(null), null)
eq('0 은 선언이 아니다', parseDeclaredQty('x(60-180-0장)'), null)

if (typeof cleanup === 'function') cleanup()
console.log('\n선언 수량 판독 (utils/printFileName) — ' + pass + ' 통과' + (fails.length ? ' · ' + fails.length + ' 실패' : ''))
for (const f of fails) console.log('  FAIL ' + f)
process.exit(fails.length ? 1 : 0)
