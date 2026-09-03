#!/usr/bin/env node
/**
 * 정기변동비 추정 월 키 자체검증 — `src/utils/expenseEstimator.ts`
 *
 * ★왜 있는가 (2026-09-03):
 *   card_transactions·bank_transactions 의 transaction_date 는 'YYYYMMDD' 인데 추정기가 substr(…,1,7) 로
 *   'YYYY-MM' 과 비교했다 → 문자열 비교가 절대 참이 안 돼 **실적 0건 → estimate() 항상 null** → ESTIMATED
 *   고정비가 전부 등록금액으로 조용히 폴백했다. typecheck·smoke 는 200 을 돌려주므로 값 대조만이 잡는다.
 *
 * 무엇을 검증하나:
 *   ① LAST / AVG_3M / SAME_MONTH_LAST_YEAR 가 0 이 아닌 손계산 기댓값을 돌려준다
 *   ② 카드 실적은 순지출(취소 차감 · 상계쌍/가승인 제외) — utils/cardSpend 규칙
 *   ③ 대표자 개인통장(bank_accounts.is_personal=1) 출금은 빠진다
 *   ④ 실적 없는 달은 null (등록금액 폴백 신호) · 다른 법인은 null (entity 바인딩 위치)
 *
 * 실행: node scripts/expense-month-key-selftest.cjs   (실패 시 exit 1)
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

const SRC = path.join(__dirname, '..', 'src', 'utils', 'expenseEstimator.ts')
const { mod: _m, cleanup: _cleanup } = compileTs(SRC, { bundle: true })
const { buildExpenseEstimator, ymToKey, keyToYm } = _m

function makeDbShim(db) {
  return {
    prepare(sql) {
      const stmt = db.prepare(sql)
      const wrap = (args) => ({
        bind: (...more) => wrap(args.concat(more)),
        first: async () => stmt.get(...args) ?? null,
        all: async () => ({ results: stmt.all(...args) }),
        run: async () => { stmt.run(...args); return { meta: {} } },
      })
      return wrap([])
    },
  }
}
function makeCtx(db, entityId) {
  return { get: (k) => (k === 'entityId' ? entityId : undefined), env: { DB: makeDbShim(db) } }
}

function seed() {
  const db = new DatabaseSync(':memory:')
  db.exec(`
    CREATE TABLE card_transactions (
      id INTEGER PRIMARY KEY, card_id INTEGER, category_id INTEGER, transaction_date TEXT, amount REAL,
      approval_type TEXT DEFAULT 'APPROVAL', is_offset INTEGER DEFAULT 0, entity_id INTEGER DEFAULT 1
    );
    CREATE TABLE bank_accounts (id INTEGER PRIMARY KEY, is_personal INTEGER DEFAULT 0, entity_id INTEGER DEFAULT 1);
    CREATE TABLE bank_transactions (
      id INTEGER PRIMARY KEY, bank_account_id INTEGER, matched_category_id INTEGER, transaction_date TEXT,
      amount REAL, transaction_type TEXT, entity_id INTEGER DEFAULT 1
    );
  `)
  const card = db.prepare('INSERT INTO card_transactions (card_id, category_id, transaction_date, amount, approval_type, is_offset, entity_id) VALUES (1,?,?,?,?,?,?)')
  // 카테고리 10 — 2026-07: 100,000 + 50,000 − 취소 20,000(미상계) · 상계쌍 40,000/40,000 · 가승인 30,000 → 순 130,000
  card.run(10, '20260701', 100000, 'APPROVAL', 0, 1)
  card.run(10, '20260715', 50000, 'APPROVAL', 0, 1)
  card.run(10, '20260720', 20000, 'CANCEL', 0, 1)
  card.run(10, '20260722', 40000, 'APPROVAL', 1, 1)
  card.run(10, '20260722', 40000, 'CANCEL', 1, 1)
  card.run(10, '20260725', 30000, 'APPROVAL', 1, 1)   // 가승인(is_offset=1, 단독)
  // 2026-06: 카드 80,000 + 은행 20,000(법인계좌) · 개인통장 99,999 은 제외 → 100,000
  card.run(10, '20260610', 80000, 'APPROVAL', 0, 1)
  db.prepare('INSERT INTO bank_accounts (id, is_personal, entity_id) VALUES (1, 0, 1), (2, 1, 1)').run()
  const bank = db.prepare('INSERT INTO bank_transactions (bank_account_id, matched_category_id, transaction_date, amount, transaction_type, entity_id) VALUES (?,?,?,?,?,?)')
  bank.run(1, 10, '20260612', 20000, 'WITHDRAWAL', 1)
  bank.run(2, 10, '20260613', 99999, 'WITHDRAWAL', 1)
  bank.run(1, 10, '20260614', 77777, 'DEPOSIT', 1)      // 입금은 실적 아님
  // 2026-05: 60,000
  card.run(10, '20260505', 60000, 'APPROVAL', 0, 1)
  // 2025-08: 70,000 (전년 동월)
  card.run(10, '20250801', 70000, 'APPROVAL', 0, 1)
  // 타법인(2) 2026-07 실적 — entity 1 에서 보이면 안 된다
  card.run(10, '20260703', 999999, 'APPROVAL', 0, 2)
  return db
}

let pass = 0
const fails = []
const eq = (label, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { pass++; return }
  fails.push(`${label}\n      기대 ${w}\n      실제 ${g}`)
}

;(async () => {
  eq("ymToKey('2026-08')", ymToKey('2026-08'), '202608')
  eq("keyToYm('202608')", keyToYm('202608'), '2026-08')

  const db = seed()
  const est = await buildExpenseEstimator(makeCtx(db, 1), [10], '2026-08', '2026-09')

  // ① 월 키가 맞아야 0 이 아닌 값이 나온다 (사고 재현 방지 — 종전엔 전부 null)
  eq('LAST(2026-08) = 2026-07 순지출 130,000', est.estimate(10, 'LAST', '2026-08'), 130000)
  // ② AVG_3M(2026-08) = (7월 130,000 + 6월 100,000 + 5월 60,000) / 3
  eq('AVG_3M(2026-08) = 96,667', est.estimate(10, 'AVG_3M', '2026-08'), 96667)
  // ③ 전년 동월
  eq('SAME_MONTH_LAST_YEAR(2026-08) = 70,000', est.estimate(10, 'SAME_MONTH_LAST_YEAR', '2026-08'), 70000)
  // ④ 실적 없는 달은 null (2026-08 에 실적 없음 → LAST(2026-09) null)
  eq('LAST(2026-09) = null', est.estimate(10, 'LAST', '2026-09'), null)
  // ⑤ AVG_6M 은 데이터 있는 달만 평균 (7·6·5월 3개월만 존재 → 96,667)
  eq('AVG_6M(2026-08) = 96,667', est.estimate(10, 'AVG_6M', '2026-08'), 96667)
  // ⑥ 다른 법인으로 보면 entity 1 실적이 안 보인다 (entity 바인딩 위치)
  const est2 = await buildExpenseEstimator(makeCtx(db, 2), [10], '2026-08', '2026-08')
  eq('entity 2 LAST(2026-08) = 999,999', est2.estimate(10, 'LAST', '2026-08'), 999999)
  // ⑦ 전체모드(entityId 0) = 두 법인 합
  const est0 = await buildExpenseEstimator(makeCtx(db, 0), [10], '2026-08', '2026-08')
  eq('entity 0 LAST(2026-08) = 1,129,999', est0.estimate(10, 'LAST', '2026-08'), 1129999)
  // ⑧ 카테고리 없음 → null
  const estNone = await buildExpenseEstimator(makeCtx(db, 1), [], '2026-08', '2026-08')
  eq('카테고리 없음 → null', estNone.estimate(10, 'LAST', '2026-08'), null)

  _cleanup()
  if (fails.length > 0) {
    console.error(`\n✗ 정기변동비 추정 월키 자체검증 실패 ${fails.length}건 (통과 ${pass})\n`)
    for (const f of fails) console.error('  ✗ ' + f)
    process.exit(1)
  }
  console.log(`✓ 정기변동비 추정 월키 자체검증 ${pass}건 통과`)
})().catch(err => {
  console.error('✗ 정기변동비 추정 월키 자체검증 실행 오류:', err && err.message ? err.message : err)
  process.exit(1)
})
