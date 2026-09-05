#!/usr/bin/env node
/**
 * 통장 상대방명 판정 자체검증 — `src/utils/counterpartName.ts`
 *
 * 왜 있는가: 이 판정이 틀려도 화면은 200 이고, 틀린 표시는 「매칭 안 됨」이라 **정상처럼 보인다**.
 * prod 백로그 2,240건 41.2억을 분류해 보고서야 원인이 정규화 세 군데였다는 게 드러났다:
 *   ① 은행앱 접두(`홈) `·은행명)   118건 752,300,935원이 매칭에 **도달조차 못 함**
 *   ② 카드 매출 정산금(가맹점번호) 428건 537,964,046원이 UNMATCHED 에 쌓여 사람 눈을 가림
 *   ③ 전각 괄호 `（주）`           반각 제거 규칙을 빠져나가 영영 안 맞음
 *
 * ★특히 지키는 것: `new RegExp('...(?=\\S)')` 처럼 문자열로 만든 정규식은 JS 문자열 단계에서
 *   `\S` 가 `S` 로 죽어 **조용히 아무것도 안 벗긴다**. 실제로 이 작업 중 한 번 당했고,
 *   당했을 때 증상은 "회수량 0" 이지 오류가 아니었다. 아래 접두 제거 케이스가 그 감시다.
 *
 * 실행: node scripts/counterpart-selftest.cjs   (실패 시 exit 1)
 */
'use strict'

const { compileTs } = require('./lib/compile-ts.cjs')
const path = require('path')

const SRC = path.join(__dirname, '..', 'src', 'utils', 'counterpartName.ts')
const { mod, cleanup } = compileTs(SRC)
const { normalizeCounterpart, stripBankPrefix, isNonCounterpartName } = mod

let pass = 0
const fails = []
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual), e = JSON.stringify(expected)
  if (a === e) { pass++; return }
  fails.push(`${name}\n    기대: ${e}\n    실제: ${a}`)
}

// ── ① 정규화 ────────────────────────────────────────────────────────────────
check('법인격 제거 — 반각', normalizeCounterpart('(주)정운교역'), '정운교역')
check('법인격 제거 — 주식회사', normalizeCounterpart('주식회사 엘이디포유'), '엘이디포유')
check('법인격 제거 — ㈜', normalizeCounterpart('㈜케이엠테크'), '케이엠테크')
// ★전각 괄호. 반각만 지우면 '주애니룩스' 가 남아 '애니룩스' 와 영영 안 맞는다(prod 3건 3,024만).
check('법인격 제거 — 전각 괄호', normalizeCounterpart('（주）애니룩스'), '애니룩스')
check('법인격 제거 — 전각 (유)', normalizeCounterpart('（유）한빛'), '한빛')
check('공백·구두점 제거', normalizeCounterpart(' (주) 세영씨앤씨 · 그래픽스 '), '세영씨앤씨그래픽스')
check('빈값', normalizeCounterpart(null), '')

// ── ② 은행앱 접두 제거 ──────────────────────────────────────────────────────
// 이 묶음이 통째로 원문을 돌려주면 정규식이 죽은 것이다(회수량 0 의 정체).
check('접두 — 홈) + 은행명', stripBankPrefix('홈) 기업(주)정운교역'), '(주)정운교역')
check('접두 — 홈) + 농협', stripBankPrefix('홈) 농협주식회사엘이'), '주식회사엘이')
check('접두 — 홈) + 하나', stripBankPrefix('홈) 하나(주)케이엠테'), '(주)케이엠테')
check('접두 — 은행명만', stripBankPrefix('신한(주)동산기획'), '(주)동산기획')
check('접두 — 전각 괄호 홈）', stripBankPrefix('홈） 국민솜씨'), '솜씨')
check('접두 — 날짜 4자리', stripBankPrefix('0521유경컴퍼니'), '유경컴퍼니')
check('접두 없음은 그대로', stripBankPrefix('운산직물'), '운산직물')
check('접두 제거 후 조합', normalizeCounterpart(stripBankPrefix('홈) 기업(주)정운교역')), '정운교역')
check('접두 제거 후 잘림 키', normalizeCounterpart(stripBankPrefix('홈) 하나(주)케이엠테')), '케이엠테')

// ★은행명이 곧 상호인 경우를 깨뜨리면 안 된다 — 벗긴 결과가 비면 원문을 지킨다.
check('은행명 단독은 안 벗긴다', stripBankPrefix('국민'), '국민')
check('숫자만은 안 벗긴다(계좌번호)', stripBankPrefix('60298020073142'), '60298020073142')
check('은행명 + 공백은 접두 아님', stripBankPrefix('신한 은행'), '신한 은행')

// ── ③ 거래처 아님 판별 ──────────────────────────────────────────────────────
check('카드 정산 — KB', isNonCounterpartName('KB43229063'), 'CARD')
check('카드 정산 — BC 접미', isNonCounterpartName('756921567BC'), 'CARD')
check('카드 정산 — 하나', isNonCounterpartName('하나94108997'), 'CARD')
check('카드 정산 — 삼성', isNonCounterpartName('삼성117636309'), 'CARD')
check('카드 정산 — 현(현대 축약)', isNonCounterpartName('현300326494'), 'CARD')
check('카드 정산 — 롯데', isNonCounterpartName('롯데9213645955'), 'CARD')
// ★브랜드 표식이 없는 긴 숫자는 계좌번호다. 둘 다 IGNORED 로 가지만 사유가 달라 라벨이 틀리면 안 된다.
check('계좌번호', isNonCounterpartName('60298020073142'), 'ACCOUNT')
check('계좌번호 — 하이픈', isNonCounterpartName('60298018641042-00001'), 'ACCOUNT')
check('일반 거래처는 아님', isNonCounterpartName('(주)정운교역'), null)
check('짧은 숫자는 아님', isNonCounterpartName('12345'), null)
check('빈값', isNonCounterpartName(''), null)
// 은행명+상호는 카드가 아니다 — 숫자가 없으므로.
check('은행명+상호는 거래처', isNonCounterpartName('신한(주)동산기획'), null)

cleanup()

if (fails.length) {
  console.error(`\n✗ 통장 상대방명 판정 자체검증 실패 ${fails.length}건 (통과 ${pass})`)
  for (const f of fails) console.error('  · ' + f)
  process.exit(1)
}
console.log(`✓ 통장 상대방명 판정 자체검증 통과 ${pass}항목`)
