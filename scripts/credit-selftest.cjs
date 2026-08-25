#!/usr/bin/env node
/**
 * 여신 판정 자체검증 — `src/routes/ledger/credit-helpers.ts`
 *
 * ★왜 있는가 (2026-08-25 사고):
 *   공유 SQL(`buildCreditEvalSql`)을 서브쿼리로 감싸면서 **바깥 SELECT 에 `?` 를 하나 두는 바람에**
 *   파라미터가 통째로 한 칸씩 밀렸다. 밀린 값이 `adjustments` 의 entity 필터에 들어가 `a.entity_id = 6` 이 되어
 *   **조정 전표가 전량 누락** → 초과 37곳 3.55억이 **108곳 5.52억**으로 표시됐다.
 *
 *   이 부류는 **기존 게이트가 전부 통과시킨다** — SQL 이 문법상 멀쩡하기 때문이다.
 *   typecheck·build·check:dom·sort-audit·entity-audit·smoke 어느 것도 못 잡는다.
 *   **값 대조만이 잡는다.** 그래서 이 테스트는 "손으로 계산한 기댓값"과 실제 반환값을 비교한다.
 *
 *   ⚠️ 로컬 D1 이 비어 있으면 전부 0 이라 판별이 안 된다(사고가 로컬 검증을 통과한 실제 이유).
 *      그래서 여기서는 **in-memory SQLite 에 결정론적 픽스처**를 심는다 — 0 이 아닌 답이 나와야 한다.
 *
 * 무엇을 검증하나:
 *   ① 한도 파생 = clamp(월평균 × 배수, 하한, 상한)  ② 수동값(>0) 우선 · 음수 = 무제한
 *   ③ **adjustments 가 잔액에 반영된다** ← 바인딩이 밀리면 여기가 먼저 깨진다
 *   ④ payments 반영 · 경고 구간 경계 · 초과 판정
 *   ⑤ AR 제외(내부법인·현금소매)가 집계에서 빠진다
 *   ⑥ 원장 활동이 없는 거래처는 대상에서 빠진다(credit_hold 여도)
 *   ⑦ 배치(queryCreditExceeded)와 시뮬(queryCreditImpact)의 초과 건수가 서로 일치한다
 *
 * 실행: node scripts/credit-selftest.cjs   (실패 시 exit 1)
 */
'use strict'

const { compileTs } = require('./lib/compile-ts.cjs')
// node:sqlite = Node 22.5+ 내장(실험적). 없으면 **조용히 건너뛰지 않고 실패**시킨다 —
// 게이트가 소리 없이 사라지는 것이 이 테스트가 막으려는 사고보다 나쁘다.
let DatabaseSync
try {
  ({ DatabaseSync } = require('node:sqlite'))
} catch (_) {
  console.error(`✗ node:sqlite 를 못 찾았다 (현재 Node ${process.version}). Node 22.5 이상이 필요하다.`)
  console.error('  CI 는 .github/workflows/deploy.yml 의 node-version 을 올릴 것.')
  process.exit(1)
}
const path = require('path')

// ── 대상 모듈 컴파일 (다른 selftest 와 같은 공용 헬퍼) ─────────────────────────
//    bundle=true — credit-helpers 는 entityFilter·arPolicy·ar-helpers 를 import 한다.
const SRC = path.join(__dirname, '..', 'src', 'routes', 'ledger', 'credit-helpers.ts')
const { mod: _m, cleanup: _cleanup } = compileTs(SRC, { bundle: true })
const { buildCreditEvalSql, queryCreditImpact, queryCreditExceeded, CREDIT_POLICY_DEFAULTS } = _m

// ── D1 흉내: node:sqlite 위에 prepare().bind().first()/.all() 얹기 ────────────
//    D1 의 bind()는 새 statement 를 돌려주고, first()/all()은 Promise 다.
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

// entityFilter 는 c.get('entityId') 만 본다.
function makeCtx(db, entityId) {
  return { get: (k) => (k === 'entityId' ? entityId : undefined), env: { DB: makeDbShim(db) } }
}

// ── 픽스처 ────────────────────────────────────────────────────────────────────
// 기댓값을 손으로 계산할 수 있게 최소로 만든다. 기간 안에 들어오도록 청구일은 '오늘'.
function seed() {
  const db = new DatabaseSync(':memory:')
  db.exec(`
    CREATE TABLE clients (
      id INTEGER PRIMARY KEY, client_name TEXT, client_code TEXT,
      is_active INTEGER DEFAULT 1, credit_limit REAL DEFAULT 0, credit_hold INTEGER DEFAULT 0
    );
    CREATE TABLE orders (id INTEGER PRIMARY KEY, client_id INTEGER, status TEXT DEFAULT 'CONFIRMED');
    CREATE TABLE order_billing_groups (
      id INTEGER PRIMARY KEY, order_id INTEGER, entity_id INTEGER,
      billing_status TEXT, billed_amount REAL, accounting_date TEXT, billed_at TEXT
    );
    CREATE TABLE payments (id INTEGER PRIMARY KEY, client_id INTEGER, amount REAL, entity_id INTEGER);
    CREATE TABLE adjustments (id INTEGER PRIMARY KEY, client_id INTEGER, amount REAL, entity_id INTEGER);
    -- 비워 둔다 → getCreditPolicy 가 CREDIT_POLICY_DEFAULTS 로 떨어진다(기댓값이 기본 정책 기준이라 의도한 것).
    CREATE TABLE settings (setting_key TEXT PRIMARY KEY, setting_value TEXT);
  `)

  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)
  const clients = [
    // id, 이름,        코드,            한도,      hold
    [1, '초과-파생', '111-11-11111', 0, 0],
    [2, '정상',      '222-22-22222', 0, 0],
    [3, '경고경계',  '333-33-33333', 0, 0],
    [4, '수동한도',  '444-44-44444', 2000000, 0],
    [5, '무제한',    '555-55-55555', -1, 0],
    [6, '현금소매',  '000-00-00000', 0, 0],   // AR 제외
    [7, '활동없음차단', '777-77-77777', 0, 1], // 원장 활동 0 + hold
    [8, '타법인',    '888-88-88888', 0, 0],   // entity 2 청구만 → entity 1 집계에서 빠져야
  ]
  for (const [id, name, code, lim, hold] of clients) {
    db.prepare('INSERT INTO clients (id, client_name, client_code, is_active, credit_limit, credit_hold) VALUES (?,?,?,1,?,?)')
      .run(id, name, code, lim, hold)
  }

  // 청구 (entity 1). 6개월 창 안이라 전부 avg 에 들어간다.
  const billed = [[1, 5000000], [2, 6000000], [3, 6000000], [4, 6000000], [5, 6000000], [6, 9000000]]
  let oid = 1
  for (const [cid, amt] of billed) {
    db.prepare('INSERT INTO orders (id, client_id, status) VALUES (?,?,?)').run(oid, cid, 'CONFIRMED')
    db.prepare(`INSERT INTO order_billing_groups (order_id, entity_id, billing_status, billed_amount, accounting_date, billed_at)
                VALUES (?,1,'BILLED',?,?,?)`).run(oid, amt, today, today + ' 00:00:00')
    oid++
  }
  // 거래처 8 은 entity 2 청구만
  db.prepare('INSERT INTO orders (id, client_id, status) VALUES (?,?,?)').run(oid, 8, 'CONFIRMED')
  db.prepare(`INSERT INTO order_billing_groups (order_id, entity_id, billing_status, billed_amount, accounting_date, billed_at)
              VALUES (?,2,'BILLED',?,?,?)`).run(oid, 9000000, today, today + ' 00:00:00')

  db.prepare('INSERT INTO payments (client_id, amount, entity_id) VALUES (?,?,1)').run(2, 5600000)
  db.prepare('INSERT INTO payments (client_id, amount, entity_id) VALUES (?,?,1)').run(3, 4400000)
  db.prepare('INSERT INTO payments (client_id, amount, entity_id) VALUES (?,?,1)').run(4, 5000000)
  // ★ 이 조정이 반영돼야 한다. 파라미터가 밀리면 entity 필터가 틀어져 통째로 빠지고 잔액이 500만이 된다.
  db.prepare('INSERT INTO adjustments (client_id, amount, entity_id) VALUES (?,?,1)').run(1, 1000000)
  return db
}

// 기댓값 (배수 2 · 6개월 · 하한 100만 · 상한 5,000만 · 경고 0.8)
//   c1 청구 500만 → avg 83.3만 → 한도 166.7만 / 잔액 500만 − 조정 100만 = 400만  → 초과
//   c2 청구 600만 → avg 100만  → 한도 200만   / 잔액 600만 − 입금 560만 = 40만    → 정상
//   c3 청구 600만 → 한도 200만 / 잔액 600만 − 440만 = 160만 = 200만×0.8           → 경고(경계 포함)
//   c4 수동 200만 / 잔액 600만 − 500만 = 100만                                     → 정상(수동값 우선)
//   c5 무제한(−1) / 잔액 600만                                                     → 판정 제외
//   c6 현금소매 · c7 활동없음 · c8 타법인                                          → 집계에서 빠짐
const EXPECT_IMPACT = { total: 5, exceeded: 1, warning: 1, exceeded_balance: 4000000, held: 0, unlimited: 1 }

let pass = 0
const fails = []
const eq = (label, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { pass++; return }
  fails.push(`${label}\n      기대 ${w}\n      실제 ${g}`)
}

;(async () => {
  const db = seed()
  const c = makeCtx(db, 1)
  const policy = { ...CREDIT_POLICY_DEFAULTS }

  // ① 파라미터 개수 = SQL 의 ? 개수 (밀림의 1차 징후)
  const { sql, params } = buildCreditEvalSql(c, policy)
  eq('플레이스홀더 수 = params 수', (sql.match(/\?/g) || []).length, params.length)

  // ② 영향 집계 — adjustments 반영 여부가 여기서 갈린다
  const impact = await queryCreditImpact(c, policy)
  eq('영향 집계', impact, EXPECT_IMPACT)

  // ③ 조정 누락이면 초과액이 500만이 된다 — 사고 재현 방지 못
  if (impact.exceeded_balance === 5000000) {
    fails.push('adjustments 가 잔액에 반영되지 않았다 (파라미터 밀림 의심 — 2026-08-25 사고와 동일 증상)')
  }

  // ④ 배치 목록과 시뮬 초과 건수 일치 (두 합성이 같은 판정을 내야 한다)
  const rows = await queryCreditExceeded(c)
  eq('배치 초과 건수 = 시뮬 exceeded', rows.length, impact.exceeded)
  eq('배치 대상 = 거래처 1', rows.map(r => r.client_id), [1])
  eq('배치 잔액', Math.round(rows[0] ? rows[0].balance : -1), 4000000)
  eq('배치 한도(파생 clamp)', Math.round(rows[0] ? rows[0].limit : -1), 1666667)
  eq('배치 한도출처', rows[0] && rows[0].limit_source, 'DERIVED')

  // ⑤ 배수를 올리면 초과가 줄어야 한다 (배수 파라미터가 제자리에 바인딩되는지)
  const loose = await queryCreditImpact(c, { ...policy, multiplier: 10 })
  eq('배수 10배 → 초과 0', loose.exceeded, 0)

  // ⑥ 하한을 올리면 한도가 올라가 초과가 사라진다 (하한 파라미터 위치)
  const highFloor = await queryCreditImpact(c, { ...policy, floor: 9000000 })
  eq('하한 900만 → 초과 0', highFloor.exceeded, 0)

  // ⑦ 상한을 낮추면 한도가 깎여 초과가 늘어난다 (상한 파라미터 위치)
  //    상한 10만 → 파생 한도 전부 10만. c1(400만)·c2(40만)·c3(160만) 초과,
  //    c4 는 수동 200만(상한 무관·잔액 100만)이라 정상, c5 는 무제한 → 3곳.
  const lowCap = await queryCreditImpact(c, { ...policy, cap: 100000 })
  eq('상한 10만 → 초과 3', lowCap.exceeded, 3)

  // ⑧ 다른 법인으로 보면 거래처 8 만 잡힌다 (entity 필터가 제자리에 바인딩되는지)
  const e2 = await queryCreditImpact(makeCtx(db, 2), policy)
  eq('entity 2 판정대상', e2.total, 1)

  _cleanup()

  if (fails.length > 0) {
    console.error(`\n✗ 여신 판정 자체검증 실패 ${fails.length}건 (통과 ${pass})\n`)
    for (const f of fails) console.error('  ✗ ' + f)
    console.error('\n  ⚠️ 파라미터 밀림이면 memory feedback-sqlite-placeholder-subquery-order 를 볼 것.\n')
    process.exit(1)
  }
  console.log(`✓ 여신 판정 자체검증 ${pass}건 통과`)
})().catch(err => {
  console.error('✗ 여신 판정 자체검증 실행 오류:', err && err.message ? err.message : err)
  process.exit(1)
})
