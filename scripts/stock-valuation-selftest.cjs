#!/usr/bin/env node
/**
 * 재고 평가액 축 자체검증 — 「재고 금액」이 base_unit 당 단가로 계산되는지
 *
 * 왜 있는가 (2026-08-26): 재고 화면 3곳이 `수량 × items.base_price` 로 금액을 냈다.
 *   2026-08-19 단위 정합화로 **수량은 base(M·개)** 가 됐는데 `base_price` 는 **포장 단가(롤당)**
 *   그대로라, 시트류(pack_size 50)에서 금액이 50배 부풀었다. prod 실측 **4억 6,512만 vs 정본 6,147만**.
 *   평가 정본은 `inventoryValuation /report`(WEIGHTED_AVG = 수량 × avg_unit_cost)다.
 *
 * 이 종류는 타입체크·빌드·smoke·sort-audit 을 전부 통과한다 — 금액도 숫자고 200 도 나온다.
 * 값 대조와 소스 검사만이 잡는다.
 *
 * ① 값: 픽스처로 화면 축(avg_unit_cost)과 정본 축이 같은 금액을 내는지, 포장 단가를 곱하면
 *       실제로 pack_size 배가 되는지 확인한다.
 * ② 소스: `src/routes/inventory.ts` 의 금액 계산에 base_price 가 다시 끼어들면 실패시킨다.
 *
 * 실행: node scripts/stock-valuation-selftest.cjs   (실패 시 exit 1)
 */
'use strict'

const fs = require('fs')
const path = require('path')

let DatabaseSync
try {
  ({ DatabaseSync } = require('node:sqlite'))
} catch (_e) {
  console.error(`✗ node:sqlite 를 못 찾았다 (현재 Node ${process.version}). Node 22.5 이상이 필요하다.`)
  process.exit(1)
}

let pass = 0
const fails = []

function check(name, got, expect) {
  if (Math.abs(got - expect) > 0.5) fails.push(`${name}\n    기대 ${expect.toLocaleString()} · 실제 ${got.toLocaleString()}`)
  else pass++
}

// ── ① 값 대조 ────────────────────────────────────────────────────────
const db = new DatabaseSync(':memory:')
db.exec(`
  CREATE TABLE items (
    id INTEGER PRIMARY KEY, item_name TEXT, unit TEXT, base_unit TEXT,
    pack_size REAL, base_price REAL, avg_unit_cost REAL,
    is_active INTEGER DEFAULT 1, is_purchase_item INTEGER DEFAULT 1
  );
  CREATE TABLE inventory (item_id INTEGER, entity_id INTEGER, storage_zone_id INTEGER, quantity REAL);
`)

// prod 실제 값(일반시트 SPM011G): 16롤 = 800M · 롤당 115,000 · 미터당 2,325
db.exec(`INSERT INTO items (id, item_name, unit, base_unit, pack_size, base_price, avg_unit_cost)
         VALUES (1, '일반시트', '롤', 'M', 50, 115000, 2325)`)
// 포장 개념이 없는 자재 — 두 단가가 같은 축이라 어느 쪽을 곱해도 같아야 한다
db.exec(`INSERT INTO items (id, item_name, unit, base_unit, pack_size, base_price, avg_unit_cost)
         VALUES (2, '갈바', 'EA', NULL, NULL, 8000, 7900)`)
db.exec(`INSERT INTO inventory VALUES (1, 1, 1, 800), (2, 1, 1, 10)`)

const sum = (expr) => db.prepare(
  `SELECT COALESCE(SUM(inv.quantity * COALESCE(${expr}, 0)), 0) v
     FROM items i JOIN inventory inv ON i.id = inv.item_id WHERE inv.entity_id = 1`
).get().v

const byAvg = sum('i.avg_unit_cost')
const byPack = sum('i.base_price')

// 800M × 2,325 = 1,860,000 · 10EA × 7,900 = 79,000
check('평가액 = 수량 × avg_unit_cost(base 축)', byAvg, 1_860_000 + 79_000)
// 800 × 115,000 = 92,000,000 — 롤당 단가를 base 수량에 곱한 결과(= 사고 당시 화면 값)
check('포장 단가를 곱하면 부풀어야 한다(회귀 재현)', byPack, 92_000_000 + 80_000)

const roll = db.prepare(`SELECT i.pack_size, i.base_price, i.avg_unit_cost, inv.quantity
                           FROM items i JOIN inventory inv ON i.id = inv.item_id WHERE i.id = 1`).get()
// 롤 수 × 롤당 단가 ≈ base 수량 × base 단가 (원가와 기준단가 차이만큼만 벌어진다)
const viaPack = (roll.quantity / roll.pack_size) * roll.base_price   // 16롤 × 115,000
const viaBase = roll.quantity * roll.avg_unit_cost                    // 800M × 2,325
if (Math.abs(viaPack - viaBase) / viaPack > 0.05) {
  fails.push(`포장 환산액과 base 환산액이 5% 넘게 벌어진다\n    ${viaPack.toLocaleString()} vs ${viaBase.toLocaleString()}`)
} else pass++

// ── ② 소스 검사: 금액 계산에 base_price 가 돌아오면 실패 ────────────────
const SRC = path.join(__dirname, '..', 'src', 'routes', 'inventory.ts')
const src = fs.readFileSync(SRC, 'utf8')

// "수량 × base_price" 꼴 — SQL(quantity * ... base_price)과 JS(current_stock * ... base_price) 양쪽
const badSql = /quantity[^)\n]*\)?\s*\*\s*COALESCE\(\s*i\.base_price/i
const badJs = /current_stock[^)\n]*\)\s*\*\s*\(?\s*i\.base_price/i
if (badSql.test(src) || badJs.test(src)) {
  fails.push('src/routes/inventory.ts 의 금액 계산이 다시 base_price(포장 단가)를 곱한다 — avg_unit_cost 를 쓸 것')
} else pass++

// 정본이 avg_unit_cost 축을 유지하는지도 같이 본다(정본이 흔들리면 이 게이트의 기준이 사라진다)
const VAL = path.join(__dirname, '..', 'src', 'routes', 'inventoryValuation.ts')
const valSrc = fs.readFileSync(VAL, 'utf8')
if (!/quantity\s*\*\s*COALESCE\(i\.avg_unit_cost/.test(valSrc)) {
  fails.push('inventoryValuation /report 가 더 이상 수량 × avg_unit_cost 가 아니다 — 평가 정본이 바뀌었는지 확인할 것')
} else pass++


// ── ③ 발주 수량 축: 부족량(base) → 발주 단위(pack) 환산 ───────────────
// 2026-08-27 실증: 부족 80M 을 그대로 발주하면 입고가 `수량 × pack_size` 로 쌓아 재고가 +4,000M 이 된다.
// createPRForZone 이 쓰는 zoneOrderQty 를 파일에서 그대로 떼어내 픽스처로 돌린다(사본을 두지 않는다).
const DASH = path.join(__dirname, '..', 'src', 'scripts', 'inventoryDashboard.js')
const dashSrc = fs.readFileSync(DASH, 'utf8')
// 정규식 대신 마커로 자른다 — 여러 줄 패턴은 이 파일 안에서 읽기 어렵고 깨지기 쉽다
const FN_START = 'function zoneOrderPack'
const FN_END = 'return { qty: qty, unitPrice: unitPrice, pack: pack, shortageBase: shortageBase };'
const startIdx = dashSrc.indexOf(FN_START)
const endIdx = dashSrc.indexOf(FN_END)
const fnBlock = (startIdx >= 0 && endIdx > startIdx) ? dashSrc.slice(startIdx, endIdx + FN_END.length) + '\n}' : null
if (!fnBlock) {
  fails.push('inventoryDashboard.js 에서 zoneOrderPack/zoneOrderQty 를 못 찾았다 — 발주 수량 환산이 사라졌는지 확인할 것')
} else {
  // eslint-disable-next-line no-new-func
  const zoneOrderQty = new Function(fnBlock + '; return zoneOrderQty;')()

  // 롤 자재: 재고 520M · 안전 600M · pack 50 → 부족 80M = 2롤(올림), 단가는 롤당
  const rollOrder = zoneOrderQty({ current_stock: 520, safe_stock: 600, pack_size: 50, unit: '롤', base_unit: 'M', base_price: 115000, avg_unit_cost: 2325 })
  check('롤 자재 발주 수량(부족 80M → 2롤)', rollOrder.qty, 2)
  check('롤 자재 발주 단가(롤당)', rollOrder.unitPrice, 115000)

  // AQ 계열: base_unit 없음 · pack_size 130 은 실사 편의 계수 → 환산하지 않는다
  const aq = zoneOrderQty({ current_stock: 100, safe_stock: 300, pack_size: 130, unit: 'yd', base_unit: null, base_price: 978, avg_unit_cost: 1011 })
  check('AQ 계열은 환산 없음(부족 200yd → 200)', aq.qty, 200)
  check('AQ 계열 단가는 그대로', aq.unitPrice, 978)

  // 포장 단가가 없으면 base 원가 × 포장수량
  const noPack = zoneOrderQty({ current_stock: 0, safe_stock: 10, pack_size: 50, unit: '롤', base_unit: 'M', base_price: 0, avg_unit_cost: 2000 })
  check('포장 단가 부재 시 base 원가 × pack', noPack.unitPrice, 100000)

  // 부족이 포장 하나에 못 미쳐도 최소 1포장은 발주해야 한다
  const tiny = zoneOrderQty({ current_stock: 495, safe_stock: 500, pack_size: 50, unit: '롤', base_unit: 'M', base_price: 115000, avg_unit_cost: 2325 })
  check('부족 5M 이어도 최소 1롤', tiny.qty, 1)
}

// ── 결과 ─────────────────────────────────────────────────────────────
if (fails.length) {
  console.error(`\n✗ 재고 평가 축 검증 실패 ${fails.length}건 (통과 ${pass})\n`)
  for (const f of fails) console.error('  - ' + f)
  process.exit(1)
}
console.log(`✅ 재고 평가 축 ${pass}항목 통과 — 금액은 base_unit 당 단가(avg_unit_cost)로 계산된다`)
