#!/usr/bin/env node
/**
 * 품목 단위표 자체검증 — `src/utils/itemUnits.ts` + 마이그 `0619_item_units.sql` 백필
 *
 * 왜 있는가: 단위 축이 어긋나면 재고가 50배·130배 튀는 부류다(memory design-stock-base-unit-rebase).
 *   표(item_units)와 파생 열(items.unit/base_unit/pack_size)이 서로 어긋나는 순간 unitConvert.packFactor()
 *   가 엉뚱한 계수를 쓴다. 이 테스트는 ①검증 규칙 ②표→열 파생 ③열→표 보정 ④백필 SQL 을 픽스처로 대조한다.
 *
 * 실행: node scripts/item-units-selftest.cjs   (실패 시 exit 1) — test:calc 편입
 */
'use strict'
const path = require('path')
const fs = require('fs')
const { compileTs } = require('./lib/compile-ts.cjs')
let DatabaseSync
try { ({ DatabaseSync } = require('node:sqlite')) } catch (_) {
  console.error(`✗ node:sqlite 를 못 찾았다 (현재 Node ${process.version}). Node 22.5 이상이 필요하다.`)
  process.exit(1)
}

const SRC = path.join(__dirname, '..', 'src', 'utils', 'itemUnits.ts')
const { mod, cleanup } = compileTs(SRC, { bundle: true })
const { normalizeUnitSet, deriveLegacyPair, unitsFromLegacyPair, replaceItemUnits, syncUnitsFromPair, loadItemUnits, multiUnitBlockReason } = mod

let fails = 0
function check(name, cond, detail) {
  if (cond) console.log('  ✓', name)
  else { fails++; console.log('  ✗', name, detail !== undefined ? '→ ' + JSON.stringify(detail) : '') }
}

// D1 흉내 — batch 포함
function makeDbShim(db) {
  const wrapStmt = (sql, args) => ({
    bind: (...more) => wrapStmt(sql, args.concat(more)),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { db.prepare(sql).run(...args); return { meta: {} } },
    _exec: () => db.prepare(sql).run(...args),
  })
  return {
    prepare: (sql) => wrapStmt(sql, []),
    batch: async (stmts) => { db.exec('BEGIN'); try { for (const s of stmts) s._exec(); db.exec('COMMIT') } catch (e) { db.exec('ROLLBACK'); throw e } return [] },
  }
}

function seed() {
  const db = new DatabaseSync(':memory:')
  db.exec(`
    CREATE TABLE items (id INTEGER PRIMARY KEY, item_code TEXT, item_name TEXT, unit TEXT, base_unit TEXT, pack_size REAL, sheet_spec TEXT, updated_at TEXT);
    INSERT INTO items (id, item_code, item_name, unit, base_unit, pack_size, sheet_spec) VALUES
      (1, 'SPM011G-127', '일반시트 롤', '롤', 'M', 50, NULL),          -- 다단위: 롤=50M
      (2, 'AQ-STB-60', '수성 현수막원단', 'yd', NULL, 130, NULL),     -- 단일 + 실사 편의계수 130 (환산 아님)
      (3, 'RM-I0001', '잉크 1L', '통', NULL, NULL, NULL),             -- 잉크: 단일
      (4, 'FMX-YES-3T-36', '포맥스 3T', '장', NULL, NULL, '3x6'),       -- 판재 3x6 → 단 10장 후보
      (5, 'FMX-YES-3T-48', '포맥스 3T', '장', NULL, NULL, '4x8'),       -- 판재 4x8 → 단 5장 후보
      (6, 'TRB-PO-180', '가로등배너', 'EA', NULL, NULL, NULL),          -- 판매품 EA
      (7, 'X-EMPTY', '단위 빈 품목', '', NULL, NULL, NULL);            -- unit '' → EA
  `)
  return db
}

console.log('[item-units] ① normalizeUnitSet')
{
  const r = normalizeUnitSet([{ unit: 'EA', factor: 1, is_base: 1 }, { unit: '조', factor: 2 }], 'TRB-PO-180')
  check('기본 1행 + 조=2EA 통과', !r.error && r.rows.length === 2, r.error)
  check('역할 없으면 기본단위에 붙는다', r.rows && r.rows[0].role_purchase === 1 && r.rows[0].role_sales === 1 && r.rows[0].role_count === 1)
  check('기본단위 계수는 1로 강제', !normalizeUnitSet([{ unit: 'EA', factor: 5, is_base: 1 }]).error && normalizeUnitSet([{ unit: 'EA', factor: 5, is_base: 1 }]).rows[0].factor === 1)
  check('기본단위 0행 거부', !!normalizeUnitSet([{ unit: 'EA', factor: 1 }]).error)
  check('기본단위 2행 거부', !!normalizeUnitSet([{ unit: 'EA', factor: 1, is_base: 1 }, { unit: '조', factor: 2, is_base: 1 }]).error)
  check('단위 중복 거부', !!normalizeUnitSet([{ unit: 'EA', factor: 1, is_base: 1 }, { unit: 'EA', factor: 2 }]).error)
  check('계수 0 거부', !!normalizeUnitSet([{ unit: 'EA', factor: 1, is_base: 1 }, { unit: '조', factor: 0 }]).error)
  check('역할 2행 거부', !!normalizeUnitSet([{ unit: 'EA', factor: 1, is_base: 1, role_sales: 1 }, { unit: '조', factor: 2, role_sales: 1 }]).error)
  check('잉크 다단위 거부', !!normalizeUnitSet([{ unit: '통', factor: 1, is_base: 1 }, { unit: 'L', factor: 1.5 }], 'RM-I0001').error)
  check('AQ 다단위 거부', !!normalizeUnitSet([{ unit: 'yd', factor: 1, is_base: 1 }, { unit: '롤', factor: 130 }], 'AQ-STB-60').error)
  check('잉크·AQ 단일은 통과', !normalizeUnitSet([{ unit: '통', factor: 1, is_base: 1 }], 'RM-I0001').error && !multiUnitBlockReason('FMX-YES-3T-36'))
  check('7행 거부', !!normalizeUnitSet(Array.from({ length: 7 }, (_, i) => ({ unit: 'U' + i, factor: i + 1, is_base: i === 0 ? 1 : 0 }))).error)
}

console.log('[item-units] ② deriveLegacyPair (표 → 열)')
{
  const rows = normalizeUnitSet([{ unit: '장', factor: 1, is_base: 1 }, { unit: '단', factor: 10, role_purchase: 1 }]).rows
  const p = deriveLegacyPair(rows, { unit: '장', base_unit: null, pack_size: null })
  check('발주=단(10장) → unit 단 · base_unit 장 · pack 10', p.unit === '단' && p.base_unit === '장' && p.pack_size === 10, p)
  const single = deriveLegacyPair(normalizeUnitSet([{ unit: 'yd', factor: 1, is_base: 1 }]).rows, { unit: 'yd', base_unit: null, pack_size: 130 })
  check('단일단위는 pack_size(AQ 편의계수 130) 보존', single.unit === 'yd' && single.base_unit === null && single.pack_size === 130, single)
  const unpair = deriveLegacyPair(normalizeUnitSet([{ unit: 'M', factor: 1, is_base: 1 }]).rows, { unit: '롤', base_unit: 'M', pack_size: 50 })
  check('다단위였다가 단일로 → 쌍 해제(pack NULL)', unpair.unit === 'M' && unpair.base_unit === null && unpair.pack_size === null, unpair)
  const degenerate = deriveLegacyPair(normalizeUnitSet([{ unit: '장', factor: 1, is_base: 1 }, { unit: '단', factor: 10 }]).rows, { unit: '장', base_unit: '장', pack_size: 10 })
  check('퇴화한 쌍(장/장/10)도 해제 — 중간 PUT 이 unit 만 바꾼 경우(프로브 실측)', degenerate.base_unit === null && degenerate.pack_size === null, degenerate)
  const candidate = deriveLegacyPair(normalizeUnitSet([{ unit: '장', factor: 1, is_base: 1 }, { unit: '단', factor: 10 }]).rows, { unit: '장', base_unit: null, pack_size: null })
  check('단이 후보(발주 역할 없음)면 열은 단일 그대로', candidate.unit === '장' && candidate.base_unit === null && candidate.pack_size === null, candidate)
}

console.log('[item-units] ③ unitsFromLegacyPair (열 → 표, 보정)')
{
  const rows = unitsFromLegacyPair({ unit: '롤', base_unit: 'M', pack_size: 50 }, [])
  check('롤=50M 쌍 → 기본 M + 발주 롤', rows.length === 2 && rows[0].unit === 'M' && rows[0].is_base === 1 && rows[1].unit === '롤' && rows[1].factor === 50 && rows[1].role_purchase === 1, rows)
  const keep = unitsFromLegacyPair({ unit: 'EA', base_unit: null, pack_size: null }, [{ unit: 'EA', factor: 1, is_base: 1, role_purchase: 1, role_sales: 0, role_count: 1 }, { unit: '조', factor: 2, is_base: 0, role_purchase: 0, role_sales: 1, role_count: 0 }])
  check('레거시 쓰기 뒤에도 판매 단위(조) 행과 역할 보존', keep.length === 2 && keep.some((r) => r.unit === '조' && r.role_sales === 1) && keep[0].role_sales === 0, keep)
  const empty = unitsFromLegacyPair({ unit: '', base_unit: null, pack_size: null }, [])
  check("unit '' → EA", empty.length === 1 && empty[0].unit === 'EA')
}

console.log('[item-units] ④ 마이그 백필 SQL (0619)')
{
  const db = seed()
  const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '0619_item_units.sql'), 'utf8')
  db.exec(sql)
  db.exec(sql) // 멱등
  const cnt = db.prepare('SELECT COUNT(*) n FROM item_units').get().n
  check('행 수 = 기본 7 + 발주(롤) 1 + 단 후보 2 = 10 (두 번 실행해도 같다)', cnt === 10, cnt)
  const roll = db.prepare("SELECT unit, factor, is_base, role_purchase FROM item_units WHERE item_id=1 ORDER BY is_base DESC").all()
  check('롤=50M: 기본 M + 발주 롤(50)', roll.length === 2 && roll[0].unit === 'M' && roll[1].unit === '롤' && roll[1].factor === 50 && roll[1].role_purchase === 1, roll)
  const aq = db.prepare('SELECT unit, is_base FROM item_units WHERE item_id=2').all()
  check('AQ: yd 단일(130 은 환산 행이 아님)', aq.length === 1 && aq[0].unit === 'yd', aq)
  const ink = db.prepare('SELECT unit FROM item_units WHERE item_id=3').all()
  check('잉크: 통 단일', ink.length === 1 && ink[0].unit === '통', ink)
  const fmx36 = db.prepare("SELECT unit, factor, role_purchase FROM item_units WHERE item_id=4 AND unit='단'").get()
  const fmx48 = db.prepare("SELECT unit, factor, role_purchase FROM item_units WHERE item_id=5 AND unit='단'").get()
  check('포맥스 3x6 → 단=10장 후보(발주 역할 0)', fmx36 && fmx36.factor === 10 && fmx36.role_purchase === 0, fmx36)
  check('포맥스 4x8 → 단=5장 후보', fmx48 && fmx48.factor === 5, fmx48)
  const emptyUnit = db.prepare('SELECT unit FROM item_units WHERE item_id=7').get()
  check("unit '' 품목 → 기본단위 EA", emptyUnit && emptyUnit.unit === 'EA', emptyUnit)
  const baseDup = db.prepare('SELECT item_id, COUNT(*) n FROM item_units WHERE is_base=1 GROUP BY item_id HAVING n>1').all()
  check('품목당 기본단위 1행(부분 유니크 인덱스)', baseDup.length === 0, baseDup)

  // ⑤ D1 경로: replaceItemUnits → 파생 열 / syncUnitsFromPair → 표 보정
  ;(async () => {
    const shim = makeDbShim(db)
    const rows = normalizeUnitSet([{ unit: '장', factor: 1, is_base: 1 }, { unit: '단', factor: 10, role_purchase: 1 }]).rows
    const pair = await replaceItemUnits(shim, 4, rows)
    const it4 = db.prepare('SELECT unit, base_unit, pack_size FROM items WHERE id=4').get()
    check('포맥스 단 발주 역할 켬 → items.unit 단 · base 장 · pack 10', it4.unit === '단' && it4.base_unit === '장' && it4.pack_size === 10 && pair.unit === '단', it4)
    const back = normalizeUnitSet([{ unit: '장', factor: 1, is_base: 1 }, { unit: '단', factor: 10 }]).rows
    await replaceItemUnits(shim, 4, back)
    const it4b = db.prepare('SELECT unit, base_unit, pack_size FROM items WHERE id=4').get()
    check('발주 역할 끔 → 쌍 해제(장 단일)', it4b.unit === '장' && it4b.base_unit === null && it4b.pack_size === null, it4b)
    // 레거시 PATCH 흉내: 열을 직접 바꾼 뒤 sync
    db.prepare("UPDATE items SET unit='롤', base_unit='M', pack_size=100 WHERE id=6").run()
    await syncUnitsFromPair(shim, 6)
    const u6 = await loadItemUnits(shim, 6)
    check('레거시 열 쓰기 → 표 보정(기본 M + 발주 롤 100)', u6.length === 2 && u6[0].unit === 'M' && u6[1].factor === 100, u6)
    db.prepare("UPDATE items SET unit='yd', base_unit=NULL, pack_size=130 WHERE id=2").run()
    await syncUnitsFromPair(shim, 2)
    const u2 = await loadItemUnits(shim, 2)
    const it2 = db.prepare('SELECT pack_size FROM items WHERE id=2').get()
    check('AQ 단일 sync 는 pack_size 130 을 건드리지 않는다', u2.length === 1 && it2.pack_size === 130, { u2, it2 })
    // ⑥ 라인 계수 해석(0620) — 요청 명시 > 단위표 > null(현행 폴백)
    console.log('[item-units] ⑥ resolveLineFactor / loadUnitFactorMap')
    const { resolveLineFactor, loadUnitFactorMap } = mod
    const fmap = await loadUnitFactorMap(shim, [1, 4, 2, 999])
    check('롤=50M 품목: unit 롤 → 50', resolveLineFactor(fmap, 1, '롤') === 50)
    check('기본단위 M → 1', resolveLineFactor(fmap, 1, 'M') === 1)
    check('요청 명시 unit_factor 가 우선', resolveLineFactor(fmap, 1, '롤', 7) === 7)
    check('표에 없는 단위 이름 → null(추측 안 함)', resolveLineFactor(fmap, 1, '박스') === null)
    check('표 없는 품목 → null', resolveLineFactor(fmap, 999, 'EA') === null)
    check('AQ yd → 1 (130 은 계수가 아니다)', resolveLineFactor(fmap, 2, 'yd') === 1)
    // ⑦ 판매단위 스냅샷(0620) — 있는 라인만 UPDATE, 없으면 byte-identical
    console.log('[item-units] ⑦ applySalesUnitSnapshots')
    const { applySalesUnitSnapshots } = mod
    db.exec(`CREATE TABLE order_items (id INTEGER PRIMARY KEY, order_id INTEGER, sort_order INTEGER, quantity REAL, sales_unit TEXT, sales_qty REAL, unit_factor REAL);
             INSERT INTO order_items (order_id, sort_order, quantity) VALUES (10, 0, 20), (10, 1, 5), (11, 0, 3);`)
    const n = await applySalesUnitSnapshots(shim, 10, [
      { sort_order: 0, item: { sales_unit: '조', sales_qty: 10, unit_factor: 2 } },
      { sort_order: 1, item: { sales_unit: '', sales_qty: 0 } },
    ])
    const r0 = db.prepare('SELECT sales_unit, sales_qty, unit_factor FROM order_items WHERE order_id=10 AND sort_order=0').get()
    const r1 = db.prepare('SELECT sales_unit FROM order_items WHERE order_id=10 AND sort_order=1').get()
    const r11 = db.prepare('SELECT sales_unit FROM order_items WHERE order_id=11').get()
    check('판매단위 있는 라인만 1건 UPDATE', n === 1 && r0.sales_unit === '조' && r0.sales_qty === 10 && r0.unit_factor === 2, { n, r0 })
    check('판매단위 없는 라인·다른 주문은 그대로 NULL', r1.sales_unit === null && r11.sales_unit === null, { r1, r11 })
    cleanup && cleanup()
    console.log(fails ? `[item-units] FAIL ${fails}건` : '[item-units] OK — 검증·파생·보정·백필·라인 계수·판매 스냅샷 전부 통과')
    process.exit(fails ? 1 : 0)
  })().catch((e) => { console.error('[item-units] ERR', e); process.exit(1) })
}
