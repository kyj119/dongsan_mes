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
const POLICY_SRC = path.join(__dirname, '..', 'src', 'utils', 'bankMatchPolicy.ts')
const { mod, cleanup: nameCleanup } = compileTs(SRC)
const { normalizeCounterpart, stripBankPrefix, isNonCounterpartName } = mod
// 정책 모듈은 constants/intercompany 를 import 하므로 bundle 이 필요하다.
const { mod: policy, cleanup: policyCleanup } = compileTs(POLICY_SRC, { bundle: true })
const { resolveInternalEntityMatch, buildSettlementClientMap } = policy
const cleanup = () => { nameCleanup?.(); policyCleanup?.() }

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
// ★prod 에 `홈)` 과 `홈>` 이 둘 다 있다. 구분자를 괄호로 못박으면 19건 41,214,700 이 통째로 빠진다.
check('접두 — 홈> 변형', stripBankPrefix('홈> 국민에코컴퍼니'), '에코컴퍼니')
check('접두 — 홈> + 기업', stripBankPrefix('홈> 기업더존섬유'), '더존섬유')
check('접두 — CD이체', stripBankPrefix('CD이체농협송재웅'), '송재웅')
check('접두 — 날짜 4자리', stripBankPrefix('0521유경컴퍼니'), '유경컴퍼니')
check('접두 없음은 그대로', stripBankPrefix('운산직물'), '운산직물')
check('접두 제거 후 조합', normalizeCounterpart(stripBankPrefix('홈) 기업(주)정운교역')), '정운교역')
check('접두 제거 후 잘림 키', normalizeCounterpart(stripBankPrefix('홈) 하나(주)케이엠테')), '케이엠테')

// ★은행명이 곧 상호인 경우를 깨뜨리면 안 된다 — 벗긴 결과가 비면 원문을 지킨다.
check('은행명 단독은 안 벗긴다', stripBankPrefix('국민'), '국민')
check('숫자만은 안 벗긴다(계좌번호)', stripBankPrefix('60298020073142'), '60298020073142')
check('은행명 + 공백은 접두 아님', stripBankPrefix('신한 은행'), '신한 은행')

// ── ③ 거래처 아님 판별 ──────────────────────────────────────────────────────
check('카드 정산 — KB', isNonCounterpartName('KB43229063'), { kind: 'CARD', brand: 'KB국민' })
check('카드 정산 — BC 접미', isNonCounterpartName('756921567BC'), { kind: 'CARD', brand: '비씨' })
check('카드 정산 — 하나', isNonCounterpartName('하나94108997'), { kind: 'CARD', brand: '하나' })
check('카드 정산 — 삼성', isNonCounterpartName('삼성117636309'), { kind: 'CARD', brand: '삼성' })
// ★통장은 '현대'를 '현'으로 줄여 쓴다. 정산 거래처 이름은 '현대카드(매출정산)' 이라 브랜드를 펴 줘야 붙는다.
check('카드 정산 — 현(현대 축약)', isNonCounterpartName('현300326494'), { kind: 'CARD', brand: '현대' })
check('카드 정산 — 롯데', isNonCounterpartName('롯데9213645955'), { kind: 'CARD', brand: '롯데' })
check('카드 정산 — NH', isNonCounterpartName('NH12345678'), { kind: 'CARD', brand: 'NH농협' })
// ★브랜드 표식이 없는 긴 숫자는 계좌번호다. 카드로 잘못 적으면 대출 계좌에 '카드매출 정산'이 남는다.
check('계좌번호', isNonCounterpartName('60298020073142'), { kind: 'ACCOUNT' })
check('계좌번호 — 하이픈', isNonCounterpartName('60298018641042-00001'), { kind: 'ACCOUNT' })
check('일반 거래처는 아님', isNonCounterpartName('(주)정운교역'), null)
check('짧은 숫자는 아님', isNonCounterpartName('12345'), null)
check('빈값', isNonCounterpartName(''), null)
// 은행명+상호는 카드가 아니다 — 숫자가 없으므로.
check('은행명+상호는 거래처', isNonCounterpartName('신한(주)동산기획'), null)

// ── ④ 붙여도 되는가(정책) ───────────────────────────────────────────────────
// ★이 판정이 틀리면 돈이 엉뚱한 원장에 들어간다. prod 에서 자기 계좌간 이체 54건 502,280,000 이
//   수금으로 확정돼 있었고, 시험 적용 직전에 사람 눈으로 겨우 잡혔다.
{
  // 동산기획(법인1) 계좌에 거래처 53(=동산기획)이 넣은 돈 → 자기 이체
  const d = resolveInternalEntityMatch(53, 1, 0.9)
  check('같은 법인 — 자기 이체로 무시', [d.status, d.clientId, d.reason], ['IGNORED', null, '자사 계좌간 이체(같은 법인)'])
}
{
  // 청주(법인3) 계좌에 선명(거래처 1271)이 넣은 돈 → 진짜 내부거래
  const d = resolveInternalEntityMatch(1271, 3, 0.9)
  check('다른 법인 — 내부거래는 사람이 본다', [d.status, d.clientId], ['SUGGESTED', 1271])
  check('내부거래 신뢰도 상한 0.7', d.confidence, 0.7)
}
check('낮은 신뢰도는 그대로', resolveInternalEntityMatch(1271, 3, 0.55).confidence, 0.55)
check('내부법인 아니면 판단 안 함', resolveInternalEntityMatch(719, 1, 0.9), null)
check('거래처 없으면 판단 안 함', resolveInternalEntityMatch(null, 1, 0.9), null)
// 관계사(오다플래그 1655)는 내부법인이 아니다 — 매입 집계에서만 빼는 축이라 여기 대상이 아니다.
check('관계사는 이 정책 대상 아님', resolveInternalEntityMatch(1655, 1, 0.9), null)

{
  const m = buildSettlementClientMap([
    { id: 3777, client_name: '현대카드(매출정산)' },
    { id: 3783, client_name: 'NH농협카드(매출정산)' },
    { id: 719, client_name: '동산플래그' },
    { id: 9999, client_name: '현대카드(매출정산)' },   // 중복 등록 — 먼저 만난 것을 쓴다
  ])
  check('정산 거래처 맵 — 브랜드 키', [m.get('현대'), m.get('NH농협')], [3777, 3783])
  check('정산 거래처 맵 — 일반 거래처 제외', m.has('동산플래그'), false)
  check('정산 거래처 맵 — 중복은 먼저 것', m.get('현대'), 3777)
  // 이름 판정과 이어붙였을 때 실제로 찾아지는지 — 통장은 현대를 '현'으로 쓴다.
  const kind = isNonCounterpartName('현300326494')
  check('통장 표기 → 정산 거래처까지 연결', m.get(kind.brand), 3777)
}

cleanup()

if (fails.length) {
  console.error(`\n✗ 통장 상대방명 판정 자체검증 실패 ${fails.length}건 (통과 ${pass})`)
  for (const f of fails) console.error('  · ' + f)
  process.exit(1)
}
console.log(`✓ 통장 상대방명·정책 판정 자체검증 통과 ${pass}항목`)
