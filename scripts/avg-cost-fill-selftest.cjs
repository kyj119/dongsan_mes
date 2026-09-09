#!/usr/bin/env node
/**
 * 평균원가 채우기 판정 자체검증 — `src/utils/avgCostFill.ts`
 *
 * 왜 있는가: `items.avg_unit_cost` 는 소모 금액·수익성 추정원가·재고 평가액이 전부 읽는 칸인데
 *   틀려도 응답은 200 이다. 특히 **덮어쓰기**는 되돌릴 수 없다 —
 *   0555(AQ2-200)·0559(TPM 잉크)·0576(롤 단위축)이 손으로 넣은 값이고 원장에 근거가 없다.
 *
 * 두 겹을 다 검증한다: ①순수 판정 ②실제 `AVG_COST_FILL_SQL` 의 WHERE 가드(경합 대비 자기교정).
 *
 * 실행: node scripts/avg-cost-fill-selftest.cjs   (실패 시 exit 1)
 */
'use strict'

const path = require('path')
const { DatabaseSync } = require('node:sqlite')
const { compileTs } = require('./lib/compile-ts.cjs')

const SRC = path.join(__dirname, '..', 'src', 'utils', 'avgCostFill.ts')
const { mod: A, cleanup } = compileTs(SRC)

let pass = 0, fail = 0
function eq(label, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { pass++; return }
  fail++
  console.error(`❌ ${label}: got ${g}, want ${w}`)
}
function judge(label, item, qty, amount, want) {
  eq(label, A.judgeAvgCostFill(item, qty, amount), want)
}

// ── 채운다 (공백일 때만)
judge('공백(0) → 채운다', { avg_unit_cost: 0 }, 20, 158000, { fill: true, value: 7900 })
judge('공백(NULL) → 채운다', { avg_unit_cost: null }, 50, 230000, { fill: true, value: 4600 })
judge('칸 자체가 없음 → 채운다', {}, 10, 1000, { fill: true, value: 100 })
judge('음수(비정상) → 채운다', { avg_unit_cost: -5 }, 10, 1000, { fill: true, value: 100 })

// ── ★덮지 않는다 — 이게 이 모듈의 존재 이유다
judge('값이 있으면 보존', { avg_unit_cost: 7900 }, 20, 100000, { fill: false, reason: 'ALREADY_SET' })
judge('아주 작은 값도 값이다', { avg_unit_cost: 0.01 }, 10, 99999, { fill: false, reason: 'ALREADY_SET' })

// ── 근거가 없으면 채우지 않는다. ★0 은 「공짜」가 아니라 「미상」 — 미상으로 미상을 못 채운다
judge('금액 0 → NO_PRICE', { avg_unit_cost: 0 }, 20, 0, { fill: false, reason: 'NO_PRICE' })
judge('금액 음수 → NO_PRICE', { avg_unit_cost: 0 }, 20, -1, { fill: false, reason: 'NO_PRICE' })
judge('수량 0 → NO_QTY', { avg_unit_cost: 0 }, 0, 158000, { fill: false, reason: 'NO_QTY' })
judge('수량 음수 → NO_QTY', { avg_unit_cost: 0 }, -20, 158000, { fill: false, reason: 'NO_QTY' })
judge('수량 NaN → NO_QTY', { avg_unit_cost: 0 }, NaN, 158000, { fill: false, reason: 'NO_QTY' })
judge('금액 NaN → NO_PRICE', { avg_unit_cost: 0 }, 20, NaN, { fill: false, reason: 'NO_PRICE' })
judge('품목 없음 → NOT_FOUND', null, 20, 158000, { fill: false, reason: 'NOT_FOUND' })
judge('품목 undefined → NOT_FOUND', undefined, 20, 158000, { fill: false, reason: 'NOT_FOUND' })
// 수량이 먼저 걸러진다 — 0으로 나눠 Infinity 를 만들면 안 된다
judge('수량 0 + 금액 0 → NO_QTY 가 먼저', { avg_unit_cost: 0 }, 0, 0, { fill: false, reason: 'NO_QTY' })

// ── ★단위 축: base 당이다. 관리단위(롤)로 넘기면 pack_size 배 부푼다
//    0576 실측 — SVCV-127 은 1롤=20M·롤당 158,000 → **M 당 7,900** 이 정답.
judge('롤 1개(=20M) 158,000 → M당 7,900', { avg_unit_cost: 0 }, 20, 158000, { fill: true, value: 7900 })
judge('롤 3개(=150M) 690,000 → M당 4,600', { avg_unit_cost: 0 }, 150, 690000, { fill: true, value: 4600 })

// ── prod 실측 회귀: 손으로 넣은 값은 어떤 매입가가 와도 살아남아야 한다
const HAND_SET = [
  ['SVCV-127 솔벤캔버스 (0576)', 7900],
  ['KMT-UVONEWAY 원웨이 (0576)', 4600],
  ['AQ2-200 (0555)', 2630],
  ['AQ 095 BOM (0555)', 3100.6],
]
for (const [name, cost] of HAND_SET) {
  judge(`실측 보존: ${name}`, { avg_unit_cost: cost }, 100, 999999, { fill: false, reason: 'ALREADY_SET' })
}

// ── ②SQL 가드 — JS 판정이 통과해도 그 사이 값이 들어왔으면 SQL 이 막는다(자기교정)
const db = new DatabaseSync(':memory:')
db.exec(`CREATE TABLE items (id INTEGER PRIMARY KEY, avg_unit_cost REAL, updated_at TEXT);
         INSERT INTO items (id, avg_unit_cost) VALUES (1, 0), (2, NULL), (3, 7900), (4, -5);`)
const sql = A.AVG_COST_FILL_SQL
function runFill(id, value) {
  const r = db.prepare(sql).run(value, id)
  return { changes: Number(r.changes), after: db.prepare('SELECT avg_unit_cost c FROM items WHERE id = ?').get(id).c }
}
eq('SQL: 0 이면 채운다', runFill(1, 7900), { changes: 1, after: 7900 })
eq('SQL: NULL 이면 채운다', runFill(2, 4600), { changes: 1, after: 4600 })
eq('SQL: 값이 있으면 안 바꾼다', runFill(3, 111), { changes: 0, after: 7900 })
eq('SQL: 음수는 공백으로 본다', runFill(4, 500), { changes: 1, after: 500 })
// 멱등 — 두 번째 호출은 아무 일도 하지 않는다(CLAUDE.md 자기교정 산식)
eq('SQL: 재실행은 no-op', runFill(1, 12345), { changes: 0, after: 7900 })

// ── 사유 라벨
for (const r of ['ALREADY_SET', 'NO_PRICE', 'NO_QTY', 'NOT_FOUND']) {
  const label = A.avgCostFillReasonLabel(r)
  if (typeof label === 'string' && label.length > 0) pass++
  else { fail++; console.error(`❌ 라벨 누락: ${r}`) }
}

console.log(fail === 0
  ? `✓ 평균원가 채우기 자체검증 ${pass}건 통과`
  : `✗ ${fail}건 실패 / ${pass}건 통과`)
cleanup && cleanup()
process.exit(fail === 0 ? 0 : 1)
