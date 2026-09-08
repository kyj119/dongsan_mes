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
const ROLE_SRC = path.join(__dirname, '..', 'src', 'utils', 'expenseRole.ts')
const { mod: roleMod, cleanup: roleCleanup } = compileTs(ROLE_SRC)
const { normalizeRole, canAttachToDeposit, countsAsExpense } = roleMod
const LOAN_SRC = path.join(__dirname, '..', 'src', 'utils', 'loanAccountMatch.ts')
const { mod: loanMod, cleanup: loanCleanup } = compileTs(LOAN_SRC)
const { parseLoanAccountRef, classifyLoanTransaction } = loanMod
const { resolveInternalEntityMatch, buildSettlementClientMap, resolveHistoryMatch, allowAmountOnlyMatch,
        shouldPromoteSuggestion, isWeakSuggestion, SUGGESTION_WEAK_BELOW } = policy
const cleanup = () => { nameCleanup?.(); policyCleanup?.(); roleCleanup?.(); loanCleanup?.() }

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

// ── 확정 이력 판정 (2026-09-07) ──────────────────────────────────────────
//   실사고: 적요 `홍익` 이 홍익(익산)에 26회 확정돼 있었는데, 「홍익」이 세 거래처의 접두라
//   이름 규칙이 하나도 안 걸리고 220,000 이 온오프컴퍼니 미수와 우연히 같아 금액일치로 붙었다.
{
  const many = resolveHistoryMatch(2638, 1, 26)
  check('이력 2회 이상 → 0.95(자동 확정)', many.confidence, 0.95)
  check('이력 근거를 사유에 남긴다', many.reason, '확정 이력 26회')
  check('이력이 가리키는 거래처', many.clientId, 2638)
  check('이력 1회 → 0.75(사람이 본다)', resolveHistoryMatch(1713, 1, 1).confidence, 0.75)
  // ★두 거래처 이상에 붙은 적요는 모호하다 — 이력으로 못 가른다(이름·금액 규칙으로 넘긴다)
  check('두 거래처 이상이면 쓰지 않는다', resolveHistoryMatch(2638, 2, 30), null)
  check('이력 없으면 판단 안 함', resolveHistoryMatch(null, 1, 5), null)
  check('건수 0이면 판단 안 함', resolveHistoryMatch(2638, 1, 0), null)
}

// ── 금액 단독 매칭 억제 ───────────────────────────────────────────────────
//   ★금액만으로 붙이면 그 금액과 미수가 같은 거래처가 흡인점이 된다(1,000,000→프로테크 6건).
{
  check('한글 상호가 있으면 금액 단독 금지', allowAmountOnlyMatch('홍익'), false)
  check('괄호 표기도 이름이다', allowAmountOnlyMatch('최종일(우림기획)'), false)
  check('영문 상호도 이름이다', allowAmountOnlyMatch('LJM기획이진미'), false)
  check('숫자 섞인 상호도 이름이다', allowAmountOnlyMatch('6312부대태극'), false)
  // 이름이 하나도 없으면 금액이 유일한 단서다
  check('순수 숫자 적요는 금액 단독 허용', allowAmountOnlyMatch('300326494'), true)
  check('빈 적요도 허용', allowAmountOnlyMatch(''), true)
  check('null 도 허용', allowAmountOnlyMatch(null), true)
}

// ---------------------------------------------------------------------------
// 제안 승격·약한 제안 — 스윕이 UNMATCHED 만 보던 사각지대
//   본 루프 밖이라 회귀가 나도 200 이고 화면도 멀쩡하다. 여기가 유일한 감시다.
// ---------------------------------------------------------------------------
{
  const sug = (conf, cid) => ({ status: 'SUGGESTED', confidence: conf, clientId: cid })
  // 승격만 — 더 센 근거일 때만 갈아탄다
  check('약한 제안 → 이력 0.95 승격', shouldPromoteSuggestion(sug(0.65, 111), { confidence: 0.95, clientId: 222 }), true)
  check('0.7 제안 → 0.75 승격', shouldPromoteSuggestion(sug(0.7, 111), { confidence: 0.75, clientId: 222 }), true)
  check('신뢰도 없는 제안도 승격', shouldPromoteSuggestion(sug(null, null), { confidence: 0.75, clientId: 222 }), true)
  // 강등·횡보 금지 — 돌릴 때마다 결과가 바뀌면 멱등이 아니다
  check('더 센 제안은 강등 안 함', shouldPromoteSuggestion(sug(0.9, 111), { confidence: 0.75, clientId: 222 }), false)
  check('같은 신뢰도면 거래처를 안 바꾼다', shouldPromoteSuggestion(sug(0.95, 111), { confidence: 0.95, clientId: 222 }), false)
  check('같은 신뢰도·같은 거래처는 무동작', shouldPromoteSuggestion(sug(0.95, 222), { confidence: 0.95, clientId: 222 }), false)
  // 사람의 판단은 건드리지 않는다
  check('CONFIRMED 는 대상 아님', shouldPromoteSuggestion({ status: 'CONFIRMED', confidence: 0.6, clientId: 111 }, { confidence: 0.95, clientId: 222 }), false)
  check('APPLIED 는 대상 아님', shouldPromoteSuggestion({ status: 'APPLIED', confidence: 0.6, clientId: 111 }, { confidence: 0.95, clientId: 222 }), false)
  check('IGNORED 는 대상 아님', shouldPromoteSuggestion({ status: 'IGNORED', confidence: null, clientId: null }, { confidence: 0.95, clientId: 222 }), false)
  check('UNMATCHED 는 본 루프 몫', shouldPromoteSuggestion({ status: 'UNMATCHED', confidence: null, clientId: null }, { confidence: 0.95, clientId: 222 }), false)
  check('거래처 없는 승격은 무효', shouldPromoteSuggestion(sug(0.6, null), { confidence: 0.95, clientId: null }), false)

  // 약한 제안 경계 — 실제 prod 근거들이 어느 쪽에 떨어지는지 고정한다
  check('경계값 0.7 은 약하지 않다', isWeakSuggestion(SUGGESTION_WEAK_BELOW), false)
  check('대표자명 일치 0.65 = 약함', isWeakSuggestion(0.65), true)
  check('적요에 거래처명 포함 0.6 = 약함', isWeakSuggestion(0.6), true)
  check('상호 표기 일치 0.7 = 강함', isWeakSuggestion(0.7), false)
  check('학습된 규칙 0.8 = 강함', isWeakSuggestion(0.8), false)
  check('확정 이력 0.75 = 강함', isWeakSuggestion(0.75), false)
  check('신뢰도 null 은 약함으로 본다', isWeakSuggestion(null), true)}

// ---------------------------------------------------------------------------
// 계정 역할 — **입금에 비용 계정**이 붙으면 손익이 조용히 틀린다
//   규칙 학습(bank_match_rules CONTAINS)이 입출금을 안 가려 입금 32,670 에 운반비가 붙었다.
//   마이그레이션(0583)으로 지웠더니 스윕이 **그대로 다시 만들었다**(2026-09-08).
//   데이터를 지우는 것으로는 안 끝난다 — 그걸 만든 규칙을 막아야 한다.
// ---------------------------------------------------------------------------
{
  check('모르는 값은 SGA(비용)로 떨어진다', normalizeRole('WAT'), 'SGA')
  check('빈값도 SGA', normalizeRole(null), 'SGA')
  check('소문자도 인식', normalizeRole('not_expense'), 'NOT_EXPENSE')
  check('앞뒤 공백 허용', normalizeRole('  COGS '), 'COGS')
  check('NOT_EXPENSE 는 비용 아님', countsAsExpense('NOT_EXPENSE'), false)
  check('SGA 는 비용', countsAsExpense('SGA'), true)
  check('입금에 운반비(SGA) 금지', canAttachToDeposit('SGA'), false)
  check('입금에 원재료비(COGS) 금지', canAttachToDeposit('COGS'), false)
  check('입금에 이자비용(NONOP) 금지', canAttachToDeposit('NONOP'), false)
  check('입금에 법인세(TAX) 금지', canAttachToDeposit('TAX'), false)
  check('차입금 입금은 허용', canAttachToDeposit('NOT_EXPENSE'), true)
  check('역할 없는 계정은 금지', canAttachToDeposit(null), false)}

// ---------------------------------------------------------------------------
// 대출계좌 적요 판정 — 이자를 원금상환으로 잡으면 손익에서 통째로 사라진다
//   실측 2026-09-08: 만기일시 대출 이자 44건 40,233,462 가 「차입금상환」(NOT_EXPENSE)에
//   들어가 MES 이자비용이 3,187,533(세무장부 정본 56,960,000 의 5.6%)이었다.
// ---------------------------------------------------------------------------
{
  const ref = parseLoanAccountRef
  check('계좌-일련 형식을 가른다', JSON.stringify(ref('60298020073142-00012')), JSON.stringify({ accountNo: '60298020073142', tranche: '00012' }))
  check('계좌번호만도 인정(실행 입금)', JSON.stringify(ref('60298020073142')), JSON.stringify({ accountNo: '60298020073142', tranche: null }))
  check('상호는 대출계좌가 아니다', ref('(주)동산기획'), null)
  check('짧은 숫자는 대출계좌가 아니다', ref('12345'), null)
  check('숫자+한글 혼합도 아니다', ref('60298020073142대출'), null)
  check('빈값', ref(''), null)

  const io = { repayment_type: 'INTEREST_ONLY', monthly_payment_amount: 2302191 }
  const eq = { repayment_type: 'EQUAL_PRINCIPAL', monthly_payment_amount: 2624763 }
  // 입금은 종류 무관 실행이다
  check('입금 = 차입 실행', classifyLoanTransaction('DEPOSIT', 47298438, io), 'DRAWDOWN')
  check('원금혼재형 입금도 실행', classifyLoanTransaction('DEPOSIT', 50000000, eq), 'DRAWDOWN')
  check('대출을 못 찾아도 입금은 실행', classifyLoanTransaction('DEPOSIT', 1000, null), 'DRAWDOWN')
  // 만기일시 = 월 납입이 전액 이자
  check('월납 근처는 이자', classifyLoanTransaction('WITHDRAWAL', 2418000, io), 'INTEREST')
  check('월납 정확값도 이자', classifyLoanTransaction('WITHDRAWAL', 2302191, io), 'INTEREST')
  check('월납보다 작아도 이자(회전 tranche)', classifyLoanTransaction('WITHDRAWAL', 615325, io), 'INTEREST')
  // 회전대출의 원금 상환 — 실측 최소 8,321,611 (월납 802,245 의 10배)
  check('월납 3배 이상은 원금', classifyLoanTransaction('WITHDRAWAL', 8321611, { repayment_type: 'INTEREST_ONLY', monthly_payment_amount: 802245 }), 'PRINCIPAL')
  check('경계 3배는 원금', classifyLoanTransaction('WITHDRAWAL', 2302191 * 3, io), 'PRINCIPAL')
  check('1.5배~3배 사이는 판정 안 함', classifyLoanTransaction('WITHDRAWAL', 2302191 * 2, io), null)
  // 원금·이자가 섞이는 유형은 통장 한 줄로 못 가른다
  check('원금균등은 판정 안 함', classifyLoanTransaction('WITHDRAWAL', 2624763, eq), null)
  check('원리금균등도 판정 안 함', classifyLoanTransaction('WITHDRAWAL', 745630, { repayment_type: 'EQUAL_INSTALLMENT', monthly_payment_amount: 745630 }), null)
  check('월납액이 없으면 판정 안 함', classifyLoanTransaction('WITHDRAWAL', 100000, { repayment_type: 'INTEREST_ONLY', monthly_payment_amount: 0 }), null)
  check('대출을 못 찾으면 출금은 판정 안 함', classifyLoanTransaction('WITHDRAWAL', 100000, null), null)
}

cleanup()

if (fails.length) {
  console.error(`\n✗ 통장 상대방명 판정 자체검증 실패 ${fails.length}건 (통과 ${pass})`)
  for (const f of fails) console.error('  · ' + f)
  process.exit(1)
}
console.log(`✓ 통장 상대방명·정책 판정 자체검증 통과 ${pass}항목`)
