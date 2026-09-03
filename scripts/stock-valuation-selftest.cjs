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
 * ③ 발주 축: 부족량(base) → 발주 단위(pack) 환산과 **단가 출처**. 2026-08-27 전수조사에서
 *    `items.base_price` 가 발주 단가가 아니라 **판매 기준단가**임이 확인됐다(08-11 판매 실거래 백필).
 * ④ 입고 축: 쓰기 경로 5곳이 `base_unit` 을 보지 않고 환산해 현수막 원단이 130배로 들어오던 것.
 *    규칙 정본 = `src/utils/unitConvert.ts` packFactor().
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
  check('롤 자재 발주 단가(= 매입원가 × pack)', rollOrder.unitPrice, 2325 * 50)

  // AQ 계열: base_unit 없음 · pack_size 130 은 실사 편의 계수 → 환산하지 않는다
  const aq = zoneOrderQty({ current_stock: 100, safe_stock: 300, pack_size: 130, unit: 'yd', base_unit: null, base_price: 978, avg_unit_cost: 1011 })
  check('AQ 계열은 환산 없음(부족 200yd → 200)', aq.qty, 200)
  check('AQ 계열 단가도 환산 없음(yd 당)', aq.unitPrice, 1011)

  // 매입 이력이 없을 때만 base_price 로 대체한다
  const noAvg = zoneOrderQty({ current_stock: 0, safe_stock: 10, pack_size: 50, unit: '롤', base_unit: 'M', base_price: 79000, avg_unit_cost: 0 })
  check('매입 이력 없으면 base_price 폴백', noAvg.unitPrice, 79000)

  // ★핵심 회귀: base_price 에 **판매가**가 들어 있어도 발주 단가는 매입 원가를 쓴다.
  //   prod 실측 FLEXN-090 — base_price 123,500(판매) vs 실제 매입 78,750. auc×pack = 75,375.
  const sales = zoneOrderQty({ current_stock: 0, safe_stock: 10, pack_size: 50, unit: '롤', base_unit: 'M', base_price: 123500, avg_unit_cost: 1507.5 })
  check('판매가가 base_price 에 있어도 매입원가를 쓴다', sales.unitPrice, 75375)

  // ★prod 실측 SPT031M — base_price 가 base 축(4,057/M)으로 어긋나 있어도 발주 단가는 정상
  const skew = zoneOrderQty({ current_stock: 0, safe_stock: 10, pack_size: 50, unit: '롤', base_unit: 'M', base_price: 4057, avg_unit_cost: 4291.67 })
  check('base_price 축이 어긋나도 발주 단가 정상(SPT031M)', skew.unitPrice, Math.round(4291.67 * 50))

  // 부족이 포장 하나에 못 미쳐도 최소 1포장은 발주해야 한다
  const tiny = zoneOrderQty({ current_stock: 495, safe_stock: 500, pack_size: 50, unit: '롤', base_unit: 'M', base_price: 115000, avg_unit_cost: 2325 })
  check('부족 5M 이어도 최소 1롤', tiny.qty, 1)
}

// ── ④ 입고 환산 축: 서버 4곳이 packFactor() 단일 소스를 쓰는지 ──────────────
// 2026-08-27 전수조사: 입고·취소·스캔 4곳이 `pack_size > 0 ? pack_size : 1` 을 손으로 복사해
//   **base_unit 을 보지 않았다**. 현수막 원단(AQ*, base_unit 없음·pack 130)을 MES 로 입고하면
//   재고가 130배가 된다. 활성 품목 49건 노출. prod 입고가 사실상 0건이라 아직 안 터졌을 뿐이다.
//   맞는 규칙은 `inventoryCount.ts` 소모량 계산에만 있었다(`m.baseUnit ? m.pack : 1`).
const UC = path.join(__dirname, '..', 'src', 'utils', 'unitConvert.ts')
const ucSrc = fs.readFileSync(UC, 'utf8')
if (!/export function packFactor/.test(ucSrc)) {
  fails.push('src/utils/unitConvert.ts 에 packFactor() 가 없다 — 쓰기 경로 환산 규칙의 단일 소스가 사라졌다')
} else {
  // TS 규칙을 그대로 실행한다(타입 표기만 걷어내면 JS 다) — 사본을 두지 않기 위해 소스에서 떼어낸다
  const grab = (marker, sig, name) => {
    const i = ucSrc.indexOf(marker)
    const j = ucSrc.indexOf('\n}', i)
    return ucSrc.slice(i, j + 2).replace(sig, 'function ' + name + '(item)')
  }
  const jsBody = [
    grab('export function packSize', 'export function packSize(item: UomItem): number', 'packSize'),
    grab('export function isMultiUom', 'export function isMultiUom(item: UomItem): boolean', 'isMultiUom'),
    grab('export function packFactor', 'export function packFactor(item: UomItem | null | undefined): number', 'packFactor'),
  ].join('\n')
  // eslint-disable-next-line no-new-func
  const packFactor = new Function(jsBody + '; return packFactor;')()
  check('시트류는 환산한다(롤→M ×50)', packFactor({ unit: '롤', base_unit: 'M', pack_size: 50 }), 50)
  check('AQ 현수막은 환산하지 않는다(base_unit 없음)', packFactor({ unit: 'yd', base_unit: null, pack_size: 130 }), 1)
  check('base_unit 이 빈 문자열이어도 환산하지 않는다', packFactor({ unit: '롤', base_unit: '', pack_size: 50 }), 1)
  check('pack_size 없으면 불변', packFactor({ unit: '롤', base_unit: 'M', pack_size: null }), 1)

  // 클라이언트 쌍(UOM_JS)도 같은 판정이어야 한다 — 표시와 쓰기가 갈리면 화면과 재고가 어긋난다
  const jsTwin = /window\.uomPackFactor\s*=\s*function\(it\)\{\s*return window\.uomIsMulti\(it\)\s*\?\s*window\.uomPackSize\(it\)\s*:\s*1;/
  if (!jsTwin.test(ucSrc)) fails.push('UOM_JS 의 uomPackFactor 가 uomIsMulti 가드를 잃었다 — TS 쌍과 갈린다')
  else pass++
  if (!/window\.uomToBase[^\n]*uomPackFactor/.test(ucSrc) || !/window\.uomFromBase[^\n]*uomPackFactor/.test(ucSrc)) {
    fails.push('UOM_JS 의 uomToBase/uomFromBase 가 uomPackFactor 를 거치지 않는다')
  } else pass++

  // 4곳이 옛 규칙으로 되돌아가면 실패시킨다
  const SITES = [
    ['src/routes/purchaseOrders/po-receive.ts', '발주 입고'],
    ['src/routes/inventory.ts', '수기입고·입고취소'],
    ['src/routes/scan.ts', '스캔 입고·출고'],
  ]
  const legacy = /pack_size\s*&&\s*\w*\.?pack_size\s*>\s*0\s*\)\s*\?/
  for (const [rel, label] of SITES) {
    const site = fs.readFileSync(path.join(__dirname, '..', rel), 'utf8')
    if (legacy.test(site)) {
      fails.push(`${rel} (${label}) 가 base_unit 을 보지 않는 옛 환산 규칙으로 돌아갔다 — packFactor() 를 쓸 것`)
    } else if (!site.includes('packFactor(')) {
      fails.push(`${rel} (${label}) 가 packFactor() 를 쓰지 않는다 — 입고 환산 규칙이 갈렸다`)
    } else pass++
  }
}

// ── ⑤ 판매 라인 환산 축: salesBaseQtySql 이 isMultiUom 과 같은 규칙인지 ──────
// 2026-09-03: 이 식만 `base_unit IS NULL` 로 판정하고 있었다. unitConvert.isMultiUom 은
//   `base_unit && base_unit !== unit && pack_size > 0` 을 요구한다. 오늘 값으로는 결과가
//   같지만(base_unit=unit 이면서 pack>1 인 품목 prod 0건), AQ* 현수막 47종은 pack_size=130 을
//   **실사 편의 계수**로 달고 있어서, base_unit 을 채우는 순간 130 이 환산계수로 살아나
//   재료원가가 130배가 된다. 「base_unit 공백을 채운다」는 정비 작업이 곧 그 방아쇠다.
{
  const { compileTs } = require('./lib/compile-ts.cjs')
  const SBQ = path.join(__dirname, '..', 'src', 'utils', 'salesBaseQty.ts')
  const { mod, cleanup } = compileTs(SBQ, { bundle: true })
  try {
    const sql = mod.salesBaseQtySql('oi', 'i')
    const costSql = mod.estMaterialCostSql('oi', 'i')

    db.exec(`CREATE TABLE order_items (id INTEGER PRIMARY KEY, item_id INTEGER, quantity REAL, unit_price REAL)`)
    // 90 시트(롤 판매) · 91 AQ 현수막(base 공백) · 92 AQ 에 base_unit 이 채워진 상태 · 93 base 공백문자열
    db.exec(`INSERT INTO items (id, item_name, unit, base_unit, pack_size, base_price, avg_unit_cost) VALUES
      (90, '일반시트',     '롤', 'M',  50, 115000, 2325),
      (91, 'AQ2 현수막원단', 'yd', NULL, 130,   1200,  459),
      (92, 'AQ2 현수막원단', 'yd', 'yd', 130,   1200,  459),
      (93, '빈 base_unit',  '롤', '',    50, 115000, 2325)`)
    db.exec(`INSERT INTO order_items (id, item_id, quantity, unit_price) VALUES
      (1, 90,  2, 115000),
      (2, 91, 60,   1200),
      (3, 92,  1,  60000),
      (4, 90, 60,   2500),
      (5, 93,  3, 115000)`)

    const q = (id, expr) => Number(db.prepare(
      `SELECT ${expr} AS v FROM order_items oi JOIN items i ON i.id = oi.item_id WHERE oi.id = ?`
    ).get(id).v)

    check('롤 판매 라인은 base 로 환산한다(2롤 → 100M)', q(1, sql), 100)
    check('AQ 현수막(base_unit 공백)은 환산하지 않는다', q(2, sql), 60)
    check('★AQ 롤 판매 라인 — base_unit=unit 이 채워져도 환산하지 않는다(130배 방지)', q(3, sql), 1)
    check('같은 시트라도 미터 단가로 팔린 라인은 환산하지 않는다', q(4, sql), 60)
    check('base_unit 이 빈 문자열이면 환산하지 않는다', q(5, sql), 3)
    check('추정 재료원가 = base 단가 × base 수량', q(1, costSql), 232500)
    check('★가드가 빠지면 이 값이 59,670(=130배) 이 된다', q(3, costSql), 459)
  } finally { cleanup() }
}


// ── 결과 ─────────────────────────────────────────────────────────────
if (fails.length) {
  console.error(`\n✗ 재고 평가 축 검증 실패 ${fails.length}건 (통과 ${pass})\n`)
  for (const f of fails) console.error('  - ' + f)
  process.exit(1)
}
console.log(`✅ 재고 단위 축 ${pass}항목 통과 — 금액=base 단가 · 발주=포장 수량/원가 · 입고 환산=packFactor()`)
