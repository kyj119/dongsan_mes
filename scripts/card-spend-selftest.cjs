#!/usr/bin/env node
/**
 * 법인카드 순지출 규칙 자체검증 — `src/utils/cardSpend.ts`
 *
 * ★왜 있는가 (2026-09-03):
 *   같은 card_transactions 를 세 곳이 세 가지로 셌다 — accounting /summary(취소 −, offset 무필터) ·
 *   cashFlow /projection(취소 → 0, 차감 안 함) · cashflowEngine CARD_EXPECTED(전부 +).
 *   100만 승인 + 100만 취소가 같은 사이클에 있으면 카드대금 예정액이 0 이 아니라 200만으로 잡혔다.
 *
 * 규칙: 취소(approval_type='CANCEL')는 **차감**, is_offset=1(상계쌍 양쪽 + 가승인)은 **행 제외**.
 *   둘 중 하나만 걸면 틀린다 — 상계 실패한 취소는 is_offset=0 이고, 가승인은 approval_type 이 승인이다.
 *
 * 2026-09-07 추가 — **청구 기준**(마이그 0575 offset_reason). 「우리 장부의 비용」과 「카드사가 청구한
 *   금액」은 다른 축이다: 카드로 결제한 매입은 비용에선 빠지지만 카드사는 그대로 청구한다. 두 축이
 *   같은 값이 되면 이 테스트가 실패한다 — 그게 마커를 넣은 이유 자체다.
 *
 * 실행: node scripts/card-spend-selftest.cjs   (실패 시 exit 1)
 */
'use strict'

const { compileTs } = require('./lib/compile-ts.cjs')
let DatabaseSync
try {
  ({ DatabaseSync } = require('node:sqlite'))
} catch (_) {
  console.error(`✗ node:sqlite 를 못 찾았다 (현재 Node ${process.version}). Node 22.5 이상이 필요하다.`)
  process.exit(1)
}
const path = require('path')

const SRC = path.join(__dirname, '..', 'src', 'utils', 'cardSpend.ts')
const { mod: _m, cleanup: _cleanup } = compileTs(SRC)
const { cardNetAmountSql, cardSpendFilterSql, cardNetAmount, cardBillingFilterSql, cardBillingAmount } = _m

let pass = 0
const fails = []
const eq = (label, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { pass++; return }
  fails.push(`${label}\n      기대 ${w}\n      실제 ${g}`)
}

const db = new DatabaseSync(':memory:')
db.exec(`CREATE TABLE card_transactions (
  id INTEGER PRIMARY KEY, card_id INTEGER, transaction_date TEXT, amount REAL,
  approval_type TEXT, is_offset INTEGER DEFAULT 0, offset_reason TEXT
)`)
const ins0 = db.prepare('INSERT INTO card_transactions (card_id, transaction_date, amount, approval_type, is_offset, offset_reason) VALUES (1,?,?,?,?,?)')
// 승인 100,000 · 미상계 취소 100,000 (is_offset=0 — ±30일 밖·가맹점명 상이 등으로 상계 실패)
ins0.run('20260801', 100000, 'APPROVAL', 0, null)
ins0.run('20260805', 100000, 'CANCEL', 0, null)
// 상계쌍 50,000 (양쪽 is_offset=1)
ins0.run('20260810', 50000, 'APPROVAL', 1, 'PAIR')
ins0.run('20260811', 50000, 'CANCEL', 1, 'PAIR')
// 가승인 30,000 (단독 is_offset=1, approval_type 은 승인)
ins0.run('20260812', 30000, 'APPROVAL', 1, 'PREAUTH')
// 정상 승인 20,000 · is_offset NULL(구 행) 도 포함돼야 한다
ins0.run('20260815', 20000, 'APPROVAL', null, null)
// 카드로 결제한 매입 70,000 — 비용에선 빠지지만 카드사는 **청구한다**
ins0.run('20260816', 70000, 'APPROVAL', 1, 'PURCHASE')
// 짝없는 취소 5,000 — 원승인이 청구된 적 없어 환급도 없다(양쪽 축에서 제외)
ins0.run('20260817', 5000, 'CANCEL', 1, 'ORPHAN_CANCEL')

const rows = db.prepare('SELECT amount, approval_type, is_offset, offset_reason FROM card_transactions').all()

// ① 정본 규칙 = 100,000 − 100,000 + 20,000 = 20,000
const net = db.prepare(`SELECT COALESCE(SUM(${cardNetAmountSql()}), 0) AS v FROM card_transactions WHERE 1=1${cardSpendFilterSql()}`).get().v
eq('순지출(취소 차감 + offset 제외) = 20,000', net, 20000)

// ② 별칭 버전도 같은 값
const netAlias = db.prepare(`SELECT COALESCE(SUM(${cardNetAmountSql('ct')}), 0) AS v FROM card_transactions ct WHERE 1=1${cardSpendFilterSql('ct')}`).get().v
eq('별칭 ct 순지출 = 20,000', netAlias, 20000)

// ③ 사고 재현 — 둘 중 하나만 걸면 틀린다 (기댓값이 정본과 달라야 이 테스트가 의미 있다)
const noFilter = db.prepare(`SELECT COALESCE(SUM(${cardNetAmountSql()}), 0) AS v FROM card_transactions`).get().v
eq('offset 무필터(취소 차감만) = 115,000 (가승인·매입·짝없는취소가 섞인다)', noFilter, 115000)
const noCancel = db.prepare(`SELECT COALESCE(SUM(amount), 0) AS v FROM card_transactions WHERE 1=1${cardSpendFilterSql()}`).get().v
eq('취소 미차감(offset 필터만) = 220,000 (미상계 취소가 +로 더해진다)', noCancel, 220000)
const allPlus = db.prepare(`SELECT COALESCE(SUM(amount), 0) AS v FROM card_transactions`).get().v
eq('전부 + (종전 CARD_EXPECTED) = 425,000', allPlus, 425000)

// ④ 메모리 합산(cardNetAmount) = SQL 과 동일
const jsNet = rows.reduce((s, r) => s + cardNetAmount(r), 0)
eq('cardNetAmount 합 = 20,000', jsNet, 20000)
eq('cardNetAmount(취소) 음수', cardNetAmount({ amount: 100, approval_type: 'CANCEL', is_offset: 0 }), -100)
eq('cardNetAmount(offset) 0', cardNetAmount({ amount: 100, approval_type: 'APPROVAL', is_offset: 1 }), 0)
eq('cardNetAmount(문자열 금액) 숫자화', cardNetAmount({ amount: '250', approval_type: 'APPROVAL' }), 250)

// ⑤ 필터 조각은 ' AND ' 로 시작한다 (entityFilter 와 같은 결합 방식 — WHERE 1=1 뒤에 붙는다)
eq("cardSpendFilterSql 은 ' AND ' 로 시작", cardSpendFilterSql().startsWith(' AND '), true)

// ⑥ 청구 기준 — 카드사가 실제로 청구한 금액 (마이그 0575)
//    100,000 − 100,000 + 50,000 − 50,000 + 20,000 + 70,000 = 90,000
//    (가승인 30,000 제외 · 짝없는 취소 −5,000 제외 · **매입 70,000 은 포함**)
const billed = db.prepare(`SELECT COALESCE(SUM(${cardNetAmountSql()}), 0) AS v FROM card_transactions WHERE 1=1${cardBillingFilterSql()}`).get().v
eq('청구 기준 = 90,000', billed, 90000)
eq('별칭 ct 청구 기준 = 90,000',
  db.prepare(`SELECT COALESCE(SUM(${cardNetAmountSql('ct')}), 0) AS v FROM card_transactions ct WHERE 1=1${cardBillingFilterSql('ct')}`).get().v, 90000)

// ★두 축은 **달라야** 한다 — 같아지면 마커가 죽은 것이다(매입 70,000 이 차이의 전부)
eq('청구 − 비용 = 매입 카드결제 70,000', billed - net, 70000)

// ⑦ 메모리 합산도 SQL 과 같은 값
eq('cardBillingAmount 합 = 90,000', rows.reduce((s2, r) => s2 + cardBillingAmount(r), 0), 90000)
eq('cardBillingAmount(매입) 은 포함', cardBillingAmount({ amount: 100, approval_type: 'APPROVAL', offset_reason: 'PURCHASE' }), 100)
eq('cardBillingAmount(가승인) 0', cardBillingAmount({ amount: 100, approval_type: 'APPROVAL', offset_reason: 'PREAUTH' }), 0)
eq('cardBillingAmount(짝없는취소) 0', cardBillingAmount({ amount: 100, approval_type: 'CANCEL', offset_reason: 'ORPHAN_CANCEL' }), 0)
eq('cardBillingAmount(사유없음) 은 포함', cardBillingAmount({ amount: 100, approval_type: 'APPROVAL', offset_reason: null }), 100)
eq("cardBillingFilterSql 은 ' AND ' 로 시작", cardBillingFilterSql().startsWith(' AND '), true)

_cleanup()
if (fails.length > 0) {
  console.error(`\n✗ 법인카드 순지출 자체검증 실패 ${fails.length}건 (통과 ${pass})\n`)
  for (const f of fails) console.error('  ✗ ' + f)
  process.exit(1)
}
console.log(`✓ 법인카드 순지출 자체검증 ${pass}건 통과`)
