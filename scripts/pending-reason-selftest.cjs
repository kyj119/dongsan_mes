#!/usr/bin/env node
/**
 * 미반영 사유 판정 자체검증 — `src/utils/bankPendingReason.ts`
 *
 * 왜 있는가: 이 판정은 **SQL 한 벌·TS 한 벌**로 존재한다(목록·집계는 SQL, 검증·소비처는 TS).
 * 두 벌이 갈려도 화면은 200 이고, 틀린 사유는 「분류된 것처럼」 보인다 — 이 프로젝트에서
 * 가장 자주 재발한 형태다(계산 규칙·마감 표기·누적 캐시가 전부 같은 병이었다).
 * 그래서 같은 픽스처를 in-memory SQLite 와 TS 함수에 각각 먹여 **답이 같은지** 본다.
 *
 * ★같이 지키는 것: 사유는 「미반영」 행에만 있다. 반영·무시된 행에 사유가 붙으면
 *   탭 숫자(미반영 N)와 칩 합계가 어긋나 어느 쪽이 맞는지 알 수 없게 된다.
 *
 * 실행: node scripts/pending-reason-selftest.cjs   (실패 시 exit 1)
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

const SRC = path.join(__dirname, '..', 'src', 'utils', 'bankPendingReason.ts')
// bankMatchPolicy → constants/intercompany 를 타고 들어가므로 번들이 필요하다.
const { mod, cleanup } = compileTs(SRC, { bundle: true })
const { pendingReasonOf, pendingReasonSql, PENDING_REASONS, PENDING_REASON_KEYS, isPendingReasonKey } = mod

let pass = 0
const fails = []
const eq = (label, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { pass++; return }
  fails.push(`${label}\n      기대 ${w}\n      실제 ${g}`)
}

// ---------------------------------------------------------------------------
// 픽스처 — prod 2026-09-09 실측에서 실제로 나온 형태를 그대로 옮겼다
// ---------------------------------------------------------------------------
const ROWS = [
  // [설명, 행, 기대]
  ['내부거래(제안)',            { match_status: 'SUGGESTED', match_reason: '내부거래 — 회계허브에서 확인', match_confidence: 0.8 }, 'INTERNAL'],
  ['내부거래(약한 제안)',        { match_status: 'SUGGESTED', match_reason: '내부거래 — 회계허브에서 확인', match_confidence: 0.65 }, 'INTERNAL'],
  ['매입지급·전표없음',          { match_status: 'UNMATCHED', match_reason: '매입대금 지급(규칙판정 0812)', match_confidence: 0.9 }, 'NO_INVOICE'],
  ['매입전표없음(WEHAGO)',      { match_status: 'UNMATCHED', match_reason: '거래처 확정·매입전표 없음(대표자명 매칭 0813)' }, 'NO_INVOICE'],
  ['매입지급인데 전표가 이미 있음', { match_status: 'SUGGESTED', match_reason: '매입대금 지급(규칙판정 0812)', match_confidence: 0.9, matched_purchase_payment_id: 12 }, 'SUGGESTED'],
  ['확정·적용 대기',            { match_status: 'CONFIRMED', match_reason: '입금자명 일치(은행표기 접두 제거)', match_confidence: 0.8 }, 'CONFIRMED'],
  ['확정인데 사유 없음',         { match_status: 'CONFIRMED', match_reason: null }, 'CONFIRMED'],
  ['약한 제안(대표자명)',        { match_status: 'SUGGESTED', match_reason: '대표자명 일치', match_confidence: 0.65 }, 'WEAK'],
  ['약한 제안(부분일치)',        { match_status: 'SUGGESTED', match_reason: '거래처명 부분일치', match_confidence: 0.65 }, 'WEAK'],
  ['제안(경계값 0.7)',          { match_status: 'SUGGESTED', match_reason: '적요에 거래처명 포함', match_confidence: 0.7 }, 'SUGGESTED'],
  ['제안인데 신뢰도 없음',        { match_status: 'SUGGESTED', match_reason: '학습된 규칙' }, 'WEAK'],
  ['근거 없음',                { match_status: 'UNMATCHED', match_reason: null }, 'NONE'],
  ['근거 없음(빈 문자열)',       { match_status: 'UNMATCHED', match_reason: '' }, 'NONE'],
  // ★미반영이 아닌 행에는 사유가 없다
  ['반영된 행',                { match_status: 'APPLIED', match_reason: '매입대금 지급(규칙판정 0812)' }, null],
  ['무시된 행',                { match_status: 'IGNORED', match_reason: '내부거래' }, null],
  ['상태가 비어 있는 행',        { match_status: null, match_reason: '대표자명 일치' }, null],
]

// ---------------------------------------------------------------------------
// 1. TS 판정
// ---------------------------------------------------------------------------
for (const [label, row, want] of ROWS) eq(`TS  ${label}`, pendingReasonOf(row), want)

// ---------------------------------------------------------------------------
// 2. SQL 판정 — **같은 픽스처, 같은 답**이어야 한다
// ---------------------------------------------------------------------------
const db = new DatabaseSync(':memory:')
db.exec(`CREATE TABLE bank_transactions (
  id INTEGER PRIMARY KEY, match_status TEXT, match_reason TEXT,
  match_confidence REAL, matched_purchase_payment_id INTEGER
)`)
const ins = db.prepare('INSERT INTO bank_transactions (id, match_status, match_reason, match_confidence, matched_purchase_payment_id) VALUES (?,?,?,?,?)')
ROWS.forEach((r, i) => ins.run(i + 1, r[1].match_status ?? null, r[1].match_reason ?? null,
  r[1].match_confidence ?? null, r[1].matched_purchase_payment_id ?? null))

const sql = pendingReasonSql('bt')
const got = db.prepare(`SELECT bt.id, ${sql} AS pending_reason FROM bank_transactions bt ORDER BY bt.id`).all()
ROWS.forEach((r, i) => eq(`SQL ${r[0]}`, got[i].pending_reason ?? null, r[2]))

// 3. 필터로 쓸 때도 같은 집합을 고른다(목록 필터가 이 식을 WHERE 에서 그대로 쓴다)
for (const key of PENDING_REASON_KEYS) {
  const viaWhere = db.prepare(`SELECT COUNT(*) n FROM bank_transactions bt WHERE ${sql} = ?`).get(key).n
  const viaTs = ROWS.filter(r => r[2] === key).length
  eq(`필터 ${key}`, viaWhere, viaTs)
}

// 4. 사유 합계 = 미반영 건수. 어긋나면 칩 숫자와 탭 숫자가 다른 말을 한다.
const pendingRows = ROWS.filter(r => r[2] !== null).length
const sumByKey = PENDING_REASON_KEYS.reduce((a, k) => a + ROWS.filter(r => r[2] === k).length, 0)
eq('사유 합계 = 미반영 건수', sumByKey, pendingRows)

// 5. 정의 자체 — 키 중복 없음·모든 키에 라벨과 다음 행동(hint)이 있음
eq('키 중복 없음', new Set(PENDING_REASON_KEYS).size, PENDING_REASON_KEYS.length)
eq('라벨·설명 누락 없음', PENDING_REASONS.filter(r => !r.label || !r.hint).length, 0)
eq('행 뱃지는 「행만 봐선 모르는」 것만', PENDING_REASONS.filter(r => r.rowBadge).map(r => r.key), ['INTERNAL', 'NO_INVOICE'])
eq('모르는 키는 거른다', [isPendingReasonKey('NONE'), isPendingReasonKey('nope'), isPendingReasonKey(null)], [true, false, false])

db.close()
cleanup?.()

if (fails.length) {
  console.error(`\n✗ 미반영 사유 판정 ${fails.length}건 실패 (통과 ${pass})\n`)
  for (const f of fails) console.error('  - ' + f)
  process.exit(1)
}
console.log(`✓ 미반영 사유 판정 ${pass}항목 통과 (TS·SQL 동일 판정 대조 포함)`)
