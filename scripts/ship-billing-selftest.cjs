#!/usr/bin/env node
/**
 * 출고 → 청구 타이밍 자체검증 — `src/utils/shipBilling.ts`
 *
 * ★왜 있는가 (2026-09-17 전수 점검)
 *   자동 회계반영(sync-statuses Step 2)은 `billable_after IS NOT NULL AND billable_after <= 오늘` 을 본다.
 *   그런데 그 값을 세우는 경로가 셋뿐이었고 **카드 3경로와 주문 상태변경 경로는 비어 있었다** —
 *   `auto_billing=1` 거래처 주문을 인쇄현장이 카드 보드에서 출고하면 자동 회계반영에서 **영영 빠진다**.
 *   화면에 아무 표시도 안 나는 부류라(청구 대기 목록에 안 뜨고 경고도 없다) 값 대조로만 잡힌다.
 *
 *   ⚠️ 이 테스트의 핵심은 ②다 — **새 출고 경로가 생겼을 때 스탬프를 빠뜨리면 여기서 걸린다.**
 *   (CLAUDE.md §조용한 격하 — 「공유 지점에 제약을 걸면 그 지점을 지나는 경로를 전부 열거한다」)
 *
 * 검사
 *   ① 지연일수 규칙 — 퀵·방문·직접 계열 1일, 그 외 2일(공백·널 포함)
 *   ② **소스 스캔** — `UPDATE orders SET status = 'SHIPPED'` 를 쓰는 모든 라우트가
 *      같은 파일에서 `billable_after` 를 직접 세우거나 `applyShipBillingDates` 를 부르는가
 *   ③ 스탬프 동작 — 새로 SHIPPED 된 주문에만 찍고, 이미 값이 있는 `auto_complete_date` 는 보존
 *
 * 실행: node scripts/ship-billing-selftest.cjs   (실패 시 exit 1) — test:calc 편입
 */
'use strict'
const fs = require('fs')
const path = require('path')
const { compileTs } = require('./lib/compile-ts.cjs')
let DatabaseSync
try { ({ DatabaseSync } = require('node:sqlite')) } catch (_) {
  console.error(`✗ node:sqlite 를 못 찾았다 (현재 Node ${process.version}). Node 22.5 이상이 필요하다.`)
  process.exit(1)
}

const ROOT = path.join(__dirname, '..')
const { mod, cleanup } = compileTs(path.join(ROOT, 'src', 'utils', 'shipBilling.ts'), { bundle: true })
const { shipDelayDays, applyShipBillingDates } = mod

let fails = 0
const check = (name, cond, detail) => {
  if (cond) console.log('  ✓', name)
  else { fails++; console.log('  ✗', name, detail !== undefined ? '→ ' + JSON.stringify(detail) : '') }
}

console.log('[ship-billing] ① 지연일수 규칙')
for (const m of ['방문수령', '직접수령', '직접배송', '퀵']) check(`${m} → 1일`, shipDelayDays(m) === 1)
for (const m of ['한진택배', '대신택배', '대신화물', '용차', '', null, undefined, ' 한진택배 ']) {
  const exp = (String(m || '').trim() === '') ? 2 : 2
  check(`${m === null ? 'null' : m === undefined ? 'undefined' : `"${m}"`} → ${exp}일`, shipDelayDays(m) === exp)
}
check('공백 padding 을 무시한다(" 퀵 " → 1일)', shipDelayDays(' 퀵 ') === 1)

console.log('[ship-billing] ② 소스 스캔 — 출고 전이 경로가 전부 스탬프를 찍는가')
{
  function walk(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p, out)
      else if (e.name.endsWith('.ts')) out.push(p)
    }
    return out
  }
  // `UPDATE orders SET status = 'SHIPPED'` (공백·개행 변형 허용)
  const RE_SHIP = /UPDATE\s+orders\s+SET[\s\S]{0,200}?status\s*=\s*'SHIPPED'/g
  const offenders = []
  let scanned = 0
  for (const f of walk(path.join(ROOT, 'src', 'routes'))) {
    const src = fs.readFileSync(f, 'utf8')
    RE_SHIP.lastIndex = 0
    if (!RE_SHIP.test(src)) continue
    scanned++
    const stamps = /billable_after\s*=/.test(src) || /applyShipBillingDates\s*\(/.test(src)
    if (!stamps) offenders.push(path.relative(ROOT, f).split(path.sep).join('/'))
  }
  check(`출고 전이를 쓰는 라우트 ${scanned}개 전부 청구 타이밍을 찍는다`, offenders.length === 0, offenders)
  check('스캔 대상이 실제로 잡혔다(패턴이 죽지 않았다)', scanned >= 3, scanned)
  // 패턴이 살아 있는지 자체 확인 — 스탬프를 지운 소스를 주면 잡혀야 한다
  const fake = `UPDATE orders SET status = 'SHIPPED', shipped_at = CURRENT_TIMESTAMP WHERE id = ?`
  check('스탬프 없는 소스는 검출된다', RE_SHIP.test(fake) && !/billable_after\s*=|applyShipBillingDates\s*\(/.test(fake))
}

console.log('[ship-billing] ③ 스탬프 동작')
{
  const db = new DatabaseSync(':memory:')
  db.exec(`CREATE TABLE orders (id INTEGER PRIMARY KEY, status TEXT, delivery_method TEXT, billable_after TEXT, auto_complete_date TEXT);
           INSERT INTO orders (id, status, delivery_method, billable_after, auto_complete_date) VALUES
             (1, 'SHIPPED', '한진택배', NULL, NULL),
             (2, 'SHIPPED', '퀵', NULL, '2020-01-01'),
             (3, 'PRINT_DONE', '한진택배', NULL, NULL);`)
  const shim = {
    prepare(sql) {
      const wrap = (args) => ({
        bind: (...more) => wrap(args.concat(more)),
        run: async () => { db.prepare(sql).run(...args); return { meta: {} } },
        first: async () => db.prepare(sql).get(...args) ?? null,
        all: async () => ({ results: db.prepare(sql).all(...args) }),
      })
      return wrap([])
    },
  }
  ;(async () => {
    await applyShipBillingDates(shim, 1, '한진택배')
    await applyShipBillingDates(shim, 2, '퀵')
    await applyShipBillingDates(shim, 3, '한진택배')
    const rows = db.prepare('SELECT id, billable_after, auto_complete_date FROM orders ORDER BY id').all()
    const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)
    const plus = (n) => new Date(Date.now() + 9 * 3600 * 1000 + n * 864e5).toISOString().slice(0, 10)
    check('택배(2일) → 오늘 +4일', rows[0].billable_after === plus(4), rows[0])
    check('퀵(1일) → 오늘 +2일', rows[1].billable_after === plus(2), rows[1])
    check('auto_complete_date 는 오늘로', rows[0].auto_complete_date === today, rows[0])
    check('이미 있는 auto_complete_date 는 보존', rows[1].auto_complete_date === '2020-01-01', rows[1])
    check('SHIPPED 가 아닌 주문은 안 찍는다', rows[2].billable_after === null && rows[2].auto_complete_date === null, rows[2])
    cleanup && cleanup()
    console.log(fails ? `[ship-billing] FAIL ${fails}건` : '[ship-billing] OK — 지연일수·소스 스캔·스탬프 동작 전부 통과')
    process.exit(fails ? 1 : 0)
  })().catch((e) => { console.error('[ship-billing] ERR', e); process.exit(1) })
}
