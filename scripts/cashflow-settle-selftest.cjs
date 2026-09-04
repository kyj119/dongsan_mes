#!/usr/bin/env node
/**
 * 입금예정 FIFO 충당 자체검증 — `src/utils/cashflowEngine.ts` §0
 *
 * ★왜 있는가:
 *   은행거래 적용은 `거래처+법인+금액 완전일치` 인 예정 행 1건만 DONE 으로 찍었다(bank.ts).
 *   그래서 **부분입금·여러 건 합산입금·상계 후 입금은 영영 매칭되지 않고** 예정이 남아
 *   달력·예측·연체 KPI 가 실제보다 부풀었다. 게다가 적용 취소(`/cancel-apply`)는 그 DONE 을
 *   되돌리지 않아 한 번 찍힌 예정은 굳었다.
 *
 *   해결은 저장이 아니라 **파생**이다 — payments·adjustments 를 거래처×법인 안에서 예정일 순으로
 *   충당해 '아직 안 들어온 잔여'를 조회 시점에 계산한다. 수금을 지우면 다음 조회에서 저절로 복구되므로
 *   되돌리기 코드가 아예 필요 없다(수금 생성 경로 2곳·삭제 경로 2곳에 각각 심을 필요가 없다).
 *
 *   ⚠️ 이 부류는 **기존 게이트가 전부 통과시킨다** — 금액이 틀려도 200 이고 SQL 도 멀쩡하다.
 *      typecheck·build·check:dom·smoke 어느 것도 못 잡는다. **값 대조만이 잡는다.**
 *      로컬 D1 이 비면 전부 0 이라 판별이 안 되므로 in-memory SQLite 에 결정론적 픽스처를 심는다.
 *
 * 무엇을 검증하나:
 *   ① 부분입금 → 잔여만 예정에 남는다 (전액이 남던 과대계상)
 *   ② 합산입금 → 여러 예정이 한 입금으로 정리된다 (금액 완전일치가 못 하던 것)
 *   ③ FIFO 순서 = 예정일 이른 것부터
 *   ④ 수동 DONE 행은 회수 풀을 소비한다 (같은 입금이 다른 예정을 또 지우지 않게)
 *   ⑤ 초과입금은 남는 예정을 만들지 않는다
 *   ⑥ **되돌리기 대칭** — 수금을 지우면 잔여가 원래대로 복구된다
 *   ⑦ 법인 분리 — 다른 법인의 입금은 충당하지 않는다
 *   ⑧ §4b 이중계상 방지 — 물질화 예정(잔여) + 미수 합성의 합이 실제 미수와 같다
 *
 * 실행: node scripts/cashflow-settle-selftest.cjs   (실패 시 exit 1)
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

const SRC = path.join(__dirname, '..', 'src', 'utils', 'cashflowEngine.ts')
const { mod: _m, cleanup: _cleanup } = compileTs(SRC, { bundle: true })
const { buildCashflowDays } = _m

// ── D1 흉내 (credit-selftest 와 같은 shim) ────────────────────────────────────
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

const KST_TODAY = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)
const YM = KST_TODAY.slice(0, 7)
const D = (day) => `${YM}-${String(day).padStart(2, '0')}`

// ── 픽스처 ────────────────────────────────────────────────────────────────────
// 기댓값을 손으로 계산할 수 있게 최소로 만든다. 카드·급여·고정비·대출은 비워 둔다
// (각 블록이 '행 없음'이면 통째로 건너뛰므로 이 테스트의 관심사만 남는다).
function seed() {
  const db = new DatabaseSync(':memory:')
  db.exec(`
    CREATE TABLE clients (
      id INTEGER PRIMARY KEY, client_name TEXT,
      payment_terms_days INTEGER, payment_cycle_type TEXT,
      closing_day INTEGER, payment_month_offset INTEGER, payment_day INTEGER
    );
    CREATE TABLE cash_schedule (
      id INTEGER PRIMARY KEY, schedule_date TEXT, flow_type TEXT, source_type TEXT,
      source_id INTEGER, client_id INTEGER, amount REAL, description TEXT,
      status TEXT DEFAULT 'PENDING', actual_amount REAL, entity_id INTEGER DEFAULT 1
    );
    CREATE TABLE payments (id INTEGER PRIMARY KEY, client_id INTEGER, amount REAL, entity_id INTEGER);
    CREATE TABLE adjustments (id INTEGER PRIMARY KEY, client_id INTEGER, amount REAL, entity_id INTEGER);
    CREATE TABLE orders (
      id INTEGER PRIMARY KEY, client_id INTEGER, status TEXT DEFAULT 'CONFIRMED',
      order_number TEXT, delivery_date TEXT, created_at TEXT
    );
    CREATE TABLE order_billing_groups (
      id INTEGER PRIMARY KEY, order_id INTEGER, entity_id INTEGER, billing_status TEXT,
      billed_amount REAL, supply_amount REAL, tax_amount REAL, billed_at TEXT, accounting_date TEXT
    );
    -- 아래는 엔진이 조회만 하고 이 테스트에서는 비워 두는 것들
    CREATE TABLE fixed_expenses (
      name TEXT, category TEXT, amount REAL, payment_day INTEGER, frequency TEXT,
      start_date TEXT, end_date TEXT, amount_type TEXT, estimate_method TEXT,
      linked_category_id INTEGER, is_active INTEGER DEFAULT 1, entity_id INTEGER DEFAULT 1
    );
    CREATE TABLE loans (id INTEGER PRIMARY KEY, creditor TEXT, entity_id INTEGER DEFAULT 1);
    CREATE TABLE loan_payments (
      id INTEGER PRIMARY KEY, loan_id INTEGER, scheduled_date TEXT,
      total_amount REAL, actual_paid_amount REAL, status TEXT
    );
    CREATE TABLE purchase_orders (
      id INTEGER PRIMARY KEY, po_number TEXT, final_amount REAL, delivery_date TEXT,
      created_at TEXT, supplier_id INTEGER, status TEXT, entity_id INTEGER DEFAULT 1
    );
    CREATE TABLE payment_requests (id INTEGER PRIMARY KEY, related_po_id INTEGER, status TEXT);
    CREATE TABLE corporate_cards (
      id INTEGER PRIMARY KEY, card_name TEXT, cutoff_day INTEGER, payment_day INTEGER,
      is_active INTEGER DEFAULT 1, entity_id INTEGER DEFAULT 1
    );
    CREATE TABLE card_transactions (
      id INTEGER PRIMARY KEY, card_id INTEGER, transaction_date TEXT, amount REAL,
      approval_type TEXT, is_offset INTEGER DEFAULT 0, category_id INTEGER, entity_id INTEGER DEFAULT 1
    );
    CREATE TABLE payroll (
      id INTEGER PRIMARY KEY, pay_period TEXT, pay_date TEXT, net_pay REAL,
      total_deduction REAL, status TEXT, entity_id INTEGER DEFAULT 1
    );
  `)

  const clients = [
    [1, '부분수금'], [2, '합산입금'], [3, 'FIFO순서'], [4, '수동DONE'],
    [5, '초과입금'], [6, '미충당'], [7, '타법인'], [8, '미수합성'], [9, '혼합'],
  ]
  // 결제조건 0일 = 청구일이 곧 입금예정일. 30일로 두면 §4b 합성분이 다음 달로 밀려
  // 이번 달 조회창 밖으로 나가 버려 ⑧ 검증이 0 을 보게 된다(기능 문제가 아니라 픽스처 문제).
  for (const [id, name] of clients) {
    db.prepare('INSERT INTO clients (id, client_name, payment_terms_days) VALUES (?,?,0)').run(id, name)
  }

  // 물질화 입금예정 (전부 이번 달)
  const sched = [
    // id, 거래처, 예정일,  금액,      상태,      actual, entity
    [1, 1, D(10), 1000000, 'PENDING', null, 1],   // ① 부분수금 40만 → 잔여 60만
    [2, 2, D(10), 500000, 'PENDING', null, 1],    // ② 합산 80만이 두 건을 정리
    [3, 2, D(12), 300000, 'PENDING', null, 1],
    [4, 3, D(8), 300000, 'PENDING', null, 1],     // ③ FIFO — 이른 건부터
    [5, 3, D(20), 500000, 'PENDING', null, 1],
    [6, 4, D(9), 500000, 'DONE', 500000, 1],      // ④ 수동 DONE 이 풀을 소비
    [7, 4, D(15), 300000, 'PENDING', null, 1],
    [8, 5, D(11), 500000, 'PENDING', null, 1],    // ⑤ 초과입금 70만
    [9, 6, D(13), 1000000, 'PENDING', null, 1],   // ⑥ 미충당 → 그대로
    [10, 7, D(14), 1000000, 'PENDING', null, 1],  // ⑦ 타법인 입금은 충당 안 함
    [11, 9, D(16), 1000000, 'PENDING', null, 1],  // ⑧ 미수 합성과 합쳐 실제 미수와 맞아야
  ]
  for (const [id, cid, date, amt, st, actual, eid] of sched) {
    db.prepare(`INSERT INTO cash_schedule (id, schedule_date, flow_type, source_type, source_id, client_id, amount, description, status, actual_amount, entity_id)
                VALUES (?,?,'IN','ORDER',?,?,?,?,?,?,?)`)
      .run(id, date, id === 11 ? 900 : null, cid, amt, `예정${id}`, st, actual, eid)
  }

  const pay = [
    [1, 400000, 1],    // ① 부분
    [2, 800000, 1],    // ② 합산(50+30)
    [3, 400000, 1],    // ③ FIFO(30 완납 + 10 충당)
    [4, 800000, 1],    // ④ DONE 50 소비 후 30 충당
    [5, 700000, 1],    // ⑤ 초과(예정 50)
    [7, 1000000, 2],   // ⑦ 법인 2 입금 — 법인 1 예정에 닿으면 안 된다
    [9, 400000, 1],    // ⑧ 혼합: 예정 100만 + 청구 100만 중 40만 수금
  ]
  for (const [cid, amt, eid] of pay) {
    db.prepare('INSERT INTO payments (client_id, amount, entity_id) VALUES (?,?,?)').run(cid, amt, eid)
  }

  // ⑧ 미수 합성(§4b) — 청구 그룹. c8=물질화 없음 / c9=예정 1건이 물질화(주문 900)
  //    c8: 청구 100만 · 수금 0        → 합성 100만
  //    c9: 청구 200만(주문 900·901) · 수금 40만 · 물질화 예정 100만(잔여 60만)
  //        → 실제 미수 = 200 − 40 = 160만. 예정 잔여 60만 + 합성 100만 = 160만 이어야 한다.
  const grp = [
    [900, 9, 1000000], [901, 9, 1000000], [902, 8, 1000000],
  ]
  for (const [oid, cid, amt] of grp) {
    db.prepare('INSERT INTO orders (id, client_id, status, order_number, delivery_date, created_at) VALUES (?,?,?,?,?,?)')
      .run(oid, cid, 'CONFIRMED', `O-${oid}`, D(5), `${D(5)} 00:00:00`)
    db.prepare(`INSERT INTO order_billing_groups (order_id, entity_id, billing_status, billed_amount, supply_amount, tax_amount, billed_at, accounting_date)
                VALUES (?,1,'BILLED',?,?,0,?,?)`).run(oid, amt, amt, `${D(5)} 00:00:00`, D(5))
  }
  return db
}

// ── 실행 헬퍼 ─────────────────────────────────────────────────────────────────
// 달력과 같은 조건(원래 예정일 유지)으로 이번 달을 만든다.
async function runMonth(db, entityId = 1) {
  const c = makeCtx(db, entityId)
  const lastDay = new Date(Number(YM.slice(0, 4)), Number(YM.slice(5, 7)), 0).getDate()
  return buildCashflowDays(c, `${YM}-01`, `${YM}-${String(lastDay).padStart(2, '0')}`, { carryOverdueToStart: false })
}
/** 물질화 예정 행 id → { amount(잔여), settled, status } */
function byScheduleId(dayMap) {
  const out = {}
  for (const day of Object.values(dayMap)) {
    for (const it of day.items) {
      if (it.schedule_id != null) out[it.schedule_id] = { amount: it.amount, settled: it.settled_amount || 0, status: it.status }
    }
  }
  return out
}
/** 거래처 이름이 들어간 ORDER_EXPECTED(미수 합성) 합계 */
function expectedSumFor(dayMap, namePart) {
  let sum = 0
  for (const day of Object.values(dayMap)) {
    for (const it of day.items) {
      if (it.type === 'ORDER_EXPECTED' && String(it.name).includes(namePart)) sum += it.amount
    }
  }
  return sum
}

let pass = 0
const fails = []
const eq = (label, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { pass++; return }
  fails.push(`${label}\n      기대 ${w}\n      실제 ${g}`)
}

;(async () => {
  const db = seed()
  const m = byScheduleId(await runMonth(db))

  // ① 부분입금 — 잔여만 남는다. 종전엔 100만 전액이 남아 미수를 부풀렸다.
  eq('① 부분입금 잔여', m[1].amount, 600000)
  eq('① 부분입금 회수액', m[1].settled, 400000)
  eq('① 부분입금 상태 유지', m[1].status, 'PENDING')

  // ② 합산입금 — 한 입금이 두 예정을 정리한다(금액 완전일치로는 하나도 못 잡던 경우).
  eq('② 합산입금 1번 잔여', m[2].amount, 0)
  eq('② 합산입금 2번 잔여', m[3].amount, 0)
  eq('② 합산입금 완료 표시', [m[2].status, m[3].status], ['DONE', 'DONE'])

  // ③ FIFO — 예정일 이른 건부터 채운다.
  eq('③ FIFO 이른 건 완납', m[4].amount, 0)
  eq('③ FIFO 늦은 건 잔여', m[5].amount, 400000)
  eq('③ FIFO 늦은 건 충당액', m[5].settled, 100000)

  // ④ 수동 DONE 이 풀을 소비한다 — 안 그러면 같은 80만이 DONE 건을 또 갚고 남은 예정까지 지운다.
  eq('④ 수동 DONE 잔여', m[6].amount, 0)
  eq('④ 수동 DONE 뒤 예정 잔여', m[7].amount, 0)

  // ⑤ 초과입금 — 남는 예정을 만들지 않는다(음수 금지).
  eq('⑤ 초과입금 잔여', m[8].amount, 0)

  // ⑥ 미충당은 그대로
  eq('⑥ 미충당 잔여', m[9].amount, 1000000)

  // ⑦ 법인 분리 — 법인 2 의 입금은 법인 1 예정에 닿지 않는다.
  eq('⑦ 타법인 입금 미충당', m[10].amount, 1000000)

  // ⑧ §4b 이중계상 방지 — 물질화 잔여 + 미수 합성 = 실제 미수
  //    c9: 청구 200만 − 수금 40만 = 160만  (예정 잔여 60만 + 합성 100만)
  const dayMap = await runMonth(db)
  const mm = byScheduleId(dayMap)
  eq('⑧ 혼합 예정 잔여', mm[11].amount, 600000)
  eq('⑧ 혼합 미수 합성', expectedSumFor(dayMap, '혼합'), 1000000)
  eq('⑧ 혼합 미수 총합', mm[11].amount + expectedSumFor(dayMap, '혼합'), 1600000)
  //    c8: 물질화 없음 · 수금 없음 → 청구 전액이 합성
  eq('⑧ 물질화 없는 거래처 합성', expectedSumFor(dayMap, '미수합성'), 1000000)

  // ⑥ 되돌리기 대칭 — 수금을 지우면 잔여가 원래대로 돌아온다.
  //    파생이라 복원 코드가 없다. 저장 방식이었다면 여기가 깨진 채로 남았을 자리다(현행 bank.ts 가 그랬다).
  db.prepare('DELETE FROM payments WHERE client_id = 1').run()
  const after = byScheduleId(await runMonth(db))
  eq('⑨ 수금 삭제 후 잔여 복구', after[1].amount, 1000000)
  eq('⑨ 수금 삭제 후 회수액 0', after[1].settled, 0)

  // 재적용해도 같은 값 — 멱등(두 번 돌려도 두 번 깎이지 않는다)
  db.prepare('INSERT INTO payments (client_id, amount, entity_id) VALUES (1,400000,1)').run()
  const again = byScheduleId(await runMonth(db))
  eq('⑩ 재적용 멱등', [again[1].amount, again[1].settled], [600000, 400000])

  if (fails.length) {
    console.error(`\n✗ 입금예정 FIFO 충당 자체검증 실패 ${fails.length}건 (통과 ${pass})`)
    for (const f of fails) console.error(`  · ${f}`)
    _cleanup?.()
    process.exit(1)
  }
  console.log(`✓ 입금예정 FIFO 충당 자체검증 통과 ${pass}항목`)
  _cleanup?.()
})().catch((e) => {
  console.error('✗ 실행 오류:', e)
  _cleanup?.()
  process.exit(1)
})
