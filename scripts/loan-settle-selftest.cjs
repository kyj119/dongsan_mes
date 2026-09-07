#!/usr/bin/env node
/**
 * 차입금 상환 대사 자체검증 — `src/utils/loanSettlement.ts`
 *
 * ★왜 있는가 (2026-09-07 prod)
 *   `loan_payments` 는 **344회차 전부** `bank_transaction_id` 가 비어 있었다. 상환 실적을 사람이
 *   손으로 PAID 처리하는 구조인데 아무도 안 하니 지난 회차 15건 19,251,119 이 SCHEDULED 로 남았고,
 *   자금예측의 `carryOverdue` 가 그걸 예측 시작일로 끌어와 **이미 나간 돈을 유출로 한 번 더** 셌다.
 *   타입체크·smoke 는 이걸 못 잡는다 — 숫자가 틀려도 200 이다.
 *
 * ★거래처 매칭과 반대로 금액이 1차 근거다
 *   입금 매칭은 「이 이름이 누구인가」를 모르는 상태라 금액 단독이 위험하다(`홍익`→온오프컴퍼니 사고).
 *   상환은 **언제 얼마가 나갈지 이미 아는** 상태에서 「나갔나」를 확인하는 것이라 성립한다.
 *   단 창 안에 후보가 **유일할 때만** — 둘이면 어느 쪽인지 모르므로 안 붙인다.
 *
 * 실행: node scripts/loan-settle-selftest.cjs   (실패 시 exit 1)
 */
'use strict'

const path = require('path')
const { compileTs } = require('./lib/compile-ts.cjs')
const SRC = path.join(__dirname, '..', 'src', 'utils', 'loanSettlement.ts')
const { mod, cleanup } = compileTs(SRC)
const { settleLoanPayments, creditorMatches, normalizeCreditor } = mod

let pass = 0
const fails = []
const eq = (label, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { pass++; return }
  fails.push(`${label}\n      기대 ${w}\n      실제 ${g}`)
}
const inst = (id, creditor, due, amount, entityId = 1) => ({ id, loanId: id * 10, entityId, creditor, due, amount })
const wd = (id, date, amount, counterpartName, entityId = 1) => ({ id, entityId, date, amount, counterpartName })

// ── 채권자명 대조 ─────────────────────────────────────────────────────────
// prod 표기가 제각각이다: `오릭스캐피탈코리아(주)` ↔ `CMS 오릭스코리아` · `신한카드` ↔ `신한카드할부`
eq('법인격·CMS 접두 제거', normalizeCreditor('CMS 오릭스코리아'), '오릭스코리아')
eq('한쪽이 다른 쪽을 품으면 같다', creditorMatches('신한카드', '신한카드할부'), true)
eq('오릭스 표기 2종', creditorMatches('오릭스캐피탈코리아(주)', 'CMS 오릭스코리아'), false)  // 캐피탈 유무로 안 겹친다 → 금액 경로로 간다
eq('현대캐피탈 표기 흔들림', creditorMatches('현대캐피탈', '현대캐피탈(주)'), true)
eq('빈 이름은 판단 안 함', creditorMatches('신한카드', ''), false)
eq('1자는 판단 안 함', creditorMatches('신', '신한카드'), false)

// ── 기본 대사 ─────────────────────────────────────────────────────────────
{
  const r = settleLoanPayments(
    [inst(1, '비씨카드', '2026-08-23', 2332300), inst(2, '신한카드', '2026-08-26', 745630)],
    [wd(101, '20260824', 2332300, '비씨카드'), wd(102, '20260826', 745630, '신한카드할부')]
  )
  eq('둘 다 상환으로 판정', [...r.settledIds].sort(), [1, 2])
  eq('근거는 이름+금액', r.matches.map(m => m.basis), ['이름+금액', '이름+금액'])
  eq('휴일 이월 하루는 창 안', r.matches.find(m => m.installmentId === 1).lagDays, 1)
}

// ── 이름이 안 이어져도 창 안에 후보가 유일하면 붙인다 ──────────────────────
{
  const r = settleLoanPayments(
    [inst(1, '제일은행', '2026-08-20', 4009492)],
    [wd(101, '20260820', 4009492, '652-73-159234')]   // 적요가 계좌번호다
  )
  eq('계좌번호 적요도 유일하면 붙는다', [...r.settledIds], [1])
  eq('근거를 남긴다', r.matches[0].basis, '금액(후보 유일)')
}

// ── ★후보가 둘이면 붙이지 않는다 ──────────────────────────────────────────
//   어느 출금이 그 회차인지 모른다. 잘못 붙이면 **안 나간 회차가 나간 것으로** 바뀐다.
{
  const r = settleLoanPayments(
    [inst(1, '알수없는곳', '2026-08-20', 1000000)],
    [wd(101, '20260820', 1000000, '가나다'), wd(102, '20260821', 1000000, '라마바')]
  )
  eq('모호하면 미대사', [...r.settledIds], [])
  eq('미대사로 남는다', r.unsettledIds, [1])
}

// ── ★출금 하나는 회차 하나만 갚는다 ───────────────────────────────────────
{
  const r = settleLoanPayments(
    [inst(1, '현대캐피탈', '2026-08-15', 882236), inst(2, '현대캐피탈', '2026-09-15', 882236)],
    [wd(101, '20260818', 882236, '현대캐피탈')]
  )
  eq('한 출금이 두 회차를 갚지 않는다', [...r.settledIds], [1])
  eq('나머지는 미대사', r.unsettledIds, [2])
}

// ── 창·허용오차 경계 ──────────────────────────────────────────────────────
{
  const base = [inst(1, '하나은행', '2026-08-07', 2302191)]
  eq('11일 뒤는 창 밖', [...settleLoanPayments(base, [wd(101, '20260818', 2302191, '하나은행')]).settledIds], [])
  eq('10일 뒤는 창 안', [...settleLoanPayments(base, [wd(101, '20260817', 2302191, '하나은행')]).settledIds], [1])
  eq('6일 전은 창 밖(선납은 드물다)', [...settleLoanPayments(base, [wd(101, '20260801', 2302191, '하나은행')]).settledIds], [])
  eq('금액 1,000원 차는 흡수', [...settleLoanPayments(base, [wd(101, '20260807', 2301191, '하나은행')]).settledIds], [1])
  eq('금액 2만원 차는 다른 건', [...settleLoanPayments(base, [wd(101, '20260807', 2282191, '하나은행')]).settledIds], [])
}

// ── 법인이 다르면 붙이지 않는다 ───────────────────────────────────────────
{
  const r = settleLoanPayments([inst(1, '하나은행', '2026-08-07', 500000, 1)], [wd(101, '20260807', 500000, '하나은행', 2)])
  eq('법인 다르면 미대사', [...r.settledIds], [])
}

// ── 이름 후보를 금액 후보보다 먼저 가져간다 ───────────────────────────────
{
  const r = settleLoanPayments(
    [inst(1, '신한카드', '2026-08-26', 745630)],
    [wd(101, '20260826', 745630, '엉뚱한곳'), wd(102, '20260827', 745630, '신한카드할부')]
  )
  eq('이름이 이어지는 쪽을 고른다', r.matches[0].bankTxId, 102)
}

// ── 빈 입력 ───────────────────────────────────────────────────────────────
eq('회차 없으면 빈 결과', settleLoanPayments([], [wd(1, '20260101', 100, 'x')]).matches, [])
eq('출금 없으면 전부 미대사', settleLoanPayments([inst(1, 'a', '2026-01-01', 100)], []).unsettledIds, [1])

cleanup()
if (fails.length) {
  console.error(`\n✗ 차입금 상환 대사 자체검증 실패 ${fails.length}건 (통과 ${pass})\n`)
  for (const f of fails) console.error('  ✗ ' + f)
  process.exit(1)
}
console.log(`✓ 차입금 상환 대사 자체검증 ${pass}건 통과`)
