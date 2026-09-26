#!/usr/bin/env node
/**
 * 배송비 = 출고 박스 수 자체검증 — `src/utils/shippingFee.ts` + 마이그 `0621`
 *
 * ★왜 있는가 (2026-09-17 결정 「나」)
 *   배송비는 `order_items` 한 줄인데 실제 배송은 **박스(출고 묶음)** 에서 일어난다. 축이 달라
 *   합포장하면 두 주문에 각각 붙어 **이중청구**가 된다(prod 2026 배송비 1,625라인 · 762만원).
 *   → 「출고에서 입력한 박스 수가 대표 주문 라인의 수량을 정하고, 부속은 0」으로 축을 맞췄다.
 *   금액이 바뀌는 경로라 **값 대조로만** 잡힌다 — 문법은 어느 쪽이든 멀쩡하다.
 *
 * 검사
 *   ① 단독 주문 — 박스 수가 그대로 수량·금액
 *   ② 합포장 — 대표만 청구, 부속은 0
 *   ③ 멱등 — 두 번 돌려도 같다 · 박스 수 0 이면 손대지 않는다
 *   ④ 가드 — 청구된(BILLED/PAID) 주문 · `fee_source` 없는 라인은 건드리지 않는다
 *   ⑤ 취소된 출고는 묶음에서 빠진다
 *   ⑥ 마이그 0621 — 배송비 품목 표시가 켜지고 컬럼이 생긴다
 *
 * 실행: node scripts/shipping-fee-selftest.cjs   (실패 시 exit 1) — test:calc 편입
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
const { mod, cleanup } = compileTs(path.join(ROOT, 'src', 'utils', 'shippingFee.ts'), { bundle: true })
const { syncShippingFeeFromBoxes } = mod

let fails = 0
const check = (name, cond, detail) => {
  if (cond) console.log('  ✓', name)
  else { fails++; console.log('  ✗', name, detail !== undefined ? '→ ' + JSON.stringify(detail) : '') }
}

function makeShim(db) {
  const wrap = (sql, args) => ({
    bind: (...more) => wrap(sql, args.concat(more)),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { db.prepare(sql).run(...args); return { meta: {} } },
    _exec: () => db.prepare(sql).run(...args),
  })
  return {
    prepare: (sql) => wrap(sql, []),
    batch: async (stmts) => { db.exec('BEGIN'); try { for (const s of stmts) s._exec() ; db.exec('COMMIT') } catch (e) { db.exec('ROLLBACK'); throw e } return [] },
  }
}

function seed() {
  const db = new DatabaseSync(':memory:')
  db.exec(`
    CREATE TABLE orders (id INTEGER PRIMARY KEY, billing_status TEXT, total_amount REAL DEFAULT 0, vat_amount INTEGER DEFAULT 0,
                         discount_amount INTEGER DEFAULT 0, final_amount INTEGER DEFAULT 0, updated_at TEXT);
    CREATE TABLE order_billing_groups (id INTEGER PRIMARY KEY, order_id INTEGER, billing_status TEXT);
    CREATE TABLE settings (setting_key TEXT, setting_value TEXT);
    INSERT INTO settings VALUES ('vat_rate', '0.1');
    CREATE TABLE shipments (id INTEGER PRIMARY KEY, order_id INTEGER, merged_into_id INTEGER, box_count INTEGER, status TEXT);
    CREATE TABLE order_items (id INTEGER PRIMARY KEY, order_id INTEGER, quantity REAL, unit_price REAL, amount REAL, auto_amount REAL, fee_source TEXT, updated_at TEXT, vat_included INTEGER DEFAULT 1);
    INSERT INTO orders (id, billing_status) VALUES (1, NULL), (2, NULL), (3, 'BILLED'), (4, NULL), (5, NULL);
    -- 단독: 주문1 / 합포장: 주문2(대표 shipment 20) + 주문4(부속) / 청구됨: 주문3 / 취소 출고: 주문5
    INSERT INTO shipments (id, order_id, merged_into_id, box_count, status) VALUES
      (10, 1, NULL, 3, 'SHIPPED'),
      (20, 2, NULL, 2, 'SHIPPED'),
      (21, 4, 20,   9, 'SHIPPED'),
      (30, 3, NULL, 5, 'SHIPPED'),
      (40, 5, 20,   1, 'CANCELLED');
    INSERT INTO order_items (id, order_id, quantity, unit_price, amount, auto_amount, fee_source) VALUES
      (100, 1, 1, 4200, 4200, 4200, 'SHIPMENT_BOX'),
      (101, 1, 5, 1000, 5000, 5000, NULL),            -- 일반 라인 — 안 건드린다
      (200, 2, 1, 4200, 4200, 4200, 'SHIPMENT_BOX'),
      (400, 4, 1, 4200, 4200, 4200, 'SHIPMENT_BOX'),
      (300, 3, 1, 4200, 4200, 4200, 'SHIPMENT_BOX'),  -- 청구된 주문 — 안 건드린다
      (500, 5, 1, 4200, 4200, 4200, 'SHIPMENT_BOX');  -- 취소 출고 — 묶음에서 빠진다
  `)
  return db
}

;(async () => {
  const db = seed()
  const shim = makeShim(db)
  const line = (id) => db.prepare('SELECT quantity q, amount a, auto_amount aa FROM order_items WHERE id=?').get(id)

  console.log('[shipping-fee] ① 단독 주문')
  const r1 = await syncShippingFeeFromBoxes(shim, 10)
  check('박스 3 → 수량 3 · 금액 12,600', line(100).q === 3 && line(100).a === 12600 && line(100).aa === 12600, line(100))
  check('일반 라인은 그대로', line(101).q === 5 && line(101).a === 5000, line(101))
  check('바뀐 주문을 돌려준다', JSON.stringify(r1.orderIds) === JSON.stringify([1]) && r1.boxCount === 3, r1)
  {
    // 헤더 동기(2026-09-27) — 라인 12,600 + 5,000 = 17,600 · 부가세 1,760 · 에누리 0 → 최종 19,360
    const h = db.prepare('SELECT total_amount t, vat_amount v, discount_amount d, final_amount f FROM orders WHERE id=1').get()
    check('헤더 공급가·부가세·최종액이 라인을 따라간다', h.t === 17600 && h.v === 1760 && h.d === 0 && h.f === 19360, h)
  }

  console.log('[shipping-fee] ② 합포장 — 대표만 청구')
  const r2 = await syncShippingFeeFromBoxes(shim, 21)   // 부속으로 불러도 묶음으로 올라간다
  check('대표(주문2) 수량 = 대표 출고의 박스 2', line(200).q === 2 && line(200).a === 8400, line(200))
  check('부속(주문4) 수량 0 · 금액 0 — 이중청구 없음', line(400).q === 0 && line(400).a === 0 && line(400).aa === 0, line(400))
  check('부속 자신의 박스 수(9)는 무시된다', line(400).q !== 9, line(400))
  check('대표 주문 id 를 돌려준다', r2.primaryOrderId === 2, r2)
  {
    const h4 = db.prepare('SELECT total_amount t, vat_amount v, final_amount f FROM orders WHERE id=4').get()
    check('부속 주문 헤더도 0 으로 따라간다', h4.t === 0 && h4.v === 0 && h4.f === 0, h4)
  }

  console.log('[shipping-fee] ③ 멱등·박스 0')
  const r3 = await syncShippingFeeFromBoxes(shim, 21)
  check('두 번째 호출은 바꿀 게 없다', r3.orderIds.length === 0, r3)
  check('값도 그대로', line(200).q === 2 && line(400).q === 0)
  db.prepare('UPDATE shipments SET box_count = 0 WHERE id = 10').run()
  const r4 = await syncShippingFeeFromBoxes(shim, 10)
  check('박스 수 0(아직 안 셌다) → 손대지 않는다', r4.orderIds.length === 0 && line(100).q === 3, { r4, line: line(100) })

  console.log('[shipping-fee] ④ 가드')
  const r5 = await syncShippingFeeFromBoxes(shim, 30)
  check('청구된(BILLED) 주문은 안 건드린다', r5.orderIds.length === 0 && line(300).q === 1, line(300))
  check('청구돼서 못 맞춘 주문을 돌려준다(호출부 경고용)', JSON.stringify(r5.skippedBilled) === JSON.stringify([3]), r5)
  {
    // 청구그룹만 BILLED(주문 미러는 NULL)인 혼합 주문도 청구된 것으로 본다
    db.exec(`INSERT INTO orders (id, billing_status) VALUES (6, NULL);
             INSERT INTO order_billing_groups (order_id, billing_status) VALUES (6, 'BILLED');
             INSERT INTO shipments (id, order_id, merged_into_id, box_count, status) VALUES (60, 6, NULL, 4, 'SHIPPED');
             INSERT INTO order_items (id, order_id, quantity, unit_price, amount, auto_amount, fee_source) VALUES (600, 6, 1, 4200, 4200, 4200, 'SHIPMENT_BOX');`)
    const r6 = await syncShippingFeeFromBoxes(shim, 60)
    check('청구그룹 BILLED 주문도 안 건드린다', r6.orderIds.length === 0 && line(600).q === 1 && JSON.stringify(r6.skippedBilled) === '[6]', r6)
  }
  {
    // 에누리 clamp — 에누리가 새 총액보다 크면 총액까지만(음수 미수 방지)
    db.exec(`INSERT INTO orders (id, billing_status, discount_amount) VALUES (7, NULL, 999999);
             INSERT INTO shipments (id, order_id, merged_into_id, box_count, status) VALUES (70, 7, NULL, 2, 'SHIPPED');
             INSERT INTO order_items (id, order_id, quantity, unit_price, amount, auto_amount, fee_source, vat_included) VALUES (700, 7, 1, 4200, 4200, 4200, 'SHIPMENT_BOX', 0);`)
    await syncShippingFeeFromBoxes(shim, 70)
    const h7 = db.prepare('SELECT total_amount t, vat_amount v, discount_amount d, final_amount f FROM orders WHERE id=7').get()
    check('비과세 라인 부가세 0 · 에누리 clamp → 최종 0', h7.t === 8400 && h7.v === 0 && h7.d === 8400 && h7.f === 0, h7)
  }

  console.log('[shipping-fee] ⑤ 취소된 출고')
  check('취소 출고(주문5)는 묶음에서 빠져 0 으로 안 밀린다', line(500).q === 1, line(500))

  console.log('[shipping-fee] ⑥ 마이그 0621')
  {
    const m = new DatabaseSync(':memory:')
    m.exec(`CREATE TABLE items (id INTEGER PRIMARY KEY, item_code TEXT);
            CREATE TABLE order_items (id INTEGER PRIMARY KEY, order_id INTEGER);
            CREATE TABLE quotation_items (id INTEGER PRIMARY KEY, quotation_id INTEGER);
            INSERT INTO items (id, item_code) VALUES (1,'ETC-SHIP'), (2,'ETC-EXP'), (3,'TRB-PO-180');`)
    m.exec(fs.readFileSync(path.join(ROOT, 'migrations', '0621_shipping_fee_by_boxes.sql'), 'utf8'))
    const flagged = m.prepare('SELECT item_code FROM items WHERE is_shipping_fee = 1 ORDER BY id').all().map((r) => r.item_code)
    check('배송비 품목 2종만 표시된다', JSON.stringify(flagged) === JSON.stringify(['ETC-SHIP', 'ETC-EXP']), flagged)
    const cols = m.prepare("SELECT COUNT(*) n FROM pragma_table_info('order_items') WHERE name='fee_source'").get().n
    const qcols = m.prepare("SELECT COUNT(*) n FROM pragma_table_info('quotation_items') WHERE name='fee_source'").get().n
    check('order_items·quotation_items 에 fee_source 가 생긴다', cols === 1 && qcols === 1, { cols, qcols })
  }

  cleanup && cleanup()
  console.log(fails ? `[shipping-fee] FAIL ${fails}건` : '[shipping-fee] OK — 단독·합포장·멱등·가드·마이그 전부 통과')
  process.exit(fails ? 1 : 0)
})().catch((e) => { console.error('[shipping-fee] ERR', e); process.exit(1) })
