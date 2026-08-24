#!/usr/bin/env node
/**
 * derive-area-price-bands.cjs — AREA 품목 ㎡단가표 **역산 초안** (읽기 전용, 판단자료)
 *
 * 왜: AREA 품목(출력제품)은 단일 base_price 가 성립하지 않는다 — 실거래 ㎡단가가 규격에 따라
 *   몇 배씩 흔들린다. 원인은 데이터 오류가 아니라 **청구 규칙 + 규격·수량별 관례**다.
 *   그래서 값 하나가 아니라 **구간표**로 정리한다.
 *   (2026-08-25 용준님 확정: 가격 기준은 ㎡단가 · 진행 방식은 역산 초안 검토)
 *
 * ★청구 기준이 **품목군마다 다르다**(2026-08-25 실측 발견):
 *   ① 청구면적 = 10cm 올림 후 **최소 1m** — 현수막·시트 계열(운영 base_price 가 이 기준으로 재현된다)
 *   ② 실면적   = 실규격 그대로            — UV 판재 계열(포맥스 5T: 30×15=2,500 / 40×30=7,000 →
 *      실면적 기준 55,556·58,333원/㎡ 로 거의 같지만, 최소 1m 를 억지 적용하면 2,500·7,000 으로 흩어져
 *      「면적이 클수록 비싸다」는 가짜 곡선이 생긴다)
 *   ⇒ 어느 기준인지 사람이 정하지 않는다. **품목별로 변동(IQR/중앙)이 작은 쪽**을 데이터가 판정한다.
 *
 * ㎡단가 = **`amount` ÷ (면적 × 수량)** ★`unit_price` 를 면적으로 나누지 않는다
 *   (그 컬럼 의미가 마이그 0530 전후로 달라 이중 나눗셈이 된다 — AQ-BANNER 1,800→300 전례).
 *   100원 버킷 GROUP BY 로 접어 받는다(라인 1.3만 건 그대로면 wrangler 응답이 버겁다).
 *
 * 사용법:
 *   node scripts/derive-area-price-bands.cjs                 # prod, CSV + 요약
 *   node scripts/derive-area-price-bands.cjs --local
 *   node scripts/derive-area-price-bands.cjs --out <path> --min-n 3
 *
 * ★쓰기 없음. 적용은 사람이 표를 확정한 뒤 별도 마이그레이션(0529·0531 전례).
 */
'use strict'

const path = require('path')
const fs = require('fs')
const { execFileSync } = require('child_process')

const argv = process.argv.slice(2)
const arg = (k, d) => { const i = argv.indexOf(k); return i > -1 && argv[i + 1] != null ? argv[i + 1] : d }
const REMOTE = !argv.includes('--local')
const MIN_N = Math.max(1, parseInt(arg('--min-n', '3'), 10) || 3)
const OUT = path.resolve(arg('--out', path.join(__dirname, '..', 'docs', 'pricing', 'area-price-bands.csv')))
const DB = 'webapp-production'
const WRANGLER = path.join(__dirname, '..', 'node_modules', 'wrangler', 'bin', 'wrangler.js')

function d1(sql) {
  const raw = execFileSync(process.execPath, [WRANGLER, 'd1', 'execute', DB, REMOTE ? '--remote' : '--local', '--json', '--command', sql],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true })
  const start = raw.indexOf('[')
  if (start < 0) throw new Error(`D1 응답에 JSON 이 없다:\n${raw.slice(0, 400)}`)
  const first = JSON.parse(raw.slice(start))[0]
  if (!first || !first.results) throw new Error(`D1 응답 형식 예상과 다름: ${JSON.stringify(first).slice(0, 300)}`)
  return first.results
}

// 청구 변(m) — derive-item-prices.cjs:85 와 동일 식(SQLite 에 CEIL 없음)
const BILL_W = 'MAX(CAST((oi.width  + 9) / 10 AS INT) * 10, 100) / 100.0'
const BILL_H = 'MAX(CAST((oi.height + 9) / 10 AS INT) * 10, 100) / 100.0'
const BILL_AREA = `(${BILL_W} * ${BILL_H})`
const RAW_AREA = '(oi.width * oi.height / 10000.0)'   // cm² → ㎡ (최소청구 규칙 미적용)

const bandOf = (a) => `CASE
    WHEN ${a} <= 0.25 THEN '0|<=0.25m2'
    WHEN ${a} <= 1.0  THEN '1|0.25~1m2'
    WHEN ${a} <= 2.0  THEN '2|1~2m2'
    WHEN ${a} <= 4.0  THEN '3|2~4m2'
    WHEN ${a} <= 8.0  THEN '4|4~8m2'
    WHEN ${a} <= 16.0 THEN '5|8~16m2'
    ELSE '6|16m2+' END`

const LINE_OK = `i.pricing_method = 'AREA'
   AND COALESCE(oi.width, 0) > 0 AND COALESCE(oi.height, 0) > 0
   AND COALESCE(oi.quantity, 0) > 0 AND oi.amount > 0`

/** 가중 분위수 — [{price,n}] 오름차순 가정 */
function wq(buckets, q) {
  const total = buckets.reduce((s, b) => s + b.n, 0)
  if (!total) return null
  const target = total * q
  let acc = 0
  for (const b of buckets) { acc += b.n; if (acc >= target) return b.price }
  return buckets[buckets.length - 1].price
}

function stat(buckets) {
  const b = [...buckets].sort((x, y) => x.price - y.price)
  const n = b.reduce((s, x) => s + x.n, 0)
  const med = wq(b, 0.5), q1 = wq(b, 0.25), q3 = wq(b, 0.75)
  return { med, q1, q3, n, spread: med > 0 ? (q3 - q1) / med : Infinity }
}

function fetchBasis(areaExpr) {
  return d1(`
    SELECT i.item_code AS code, i.item_name AS name,
           ${bandOf(areaExpr)} AS band,
           CAST(ROUND(oi.amount / (${areaExpr} * oi.quantity) / 100) * 100 AS INT) AS price,
           COUNT(*) AS n, COUNT(DISTINCT o.client_id) AS clients
      FROM order_items oi
      JOIN items i  ON i.id = oi.item_id
      JOIN orders o ON o.id = oi.order_id
     WHERE ${LINE_OK} AND ${areaExpr} > 0
     GROUP BY 1, 2, 3, 4`)
}

function foldByItem(rowset) {
  const m = new Map()
  for (const r of rowset) {
    if (!m.has(r.code)) m.set(r.code, { name: r.name, buckets: [], bands: new Map() })
    const g = m.get(r.code)
    const b = { price: Number(r.price), n: Number(r.n) }
    g.buckets.push(b)
    if (!g.bands.has(r.band)) g.bands.set(r.band, { buckets: [], clients: 0 })
    const bg = g.bands.get(r.band)
    bg.buckets.push(b)
    bg.clients = Math.max(bg.clients, Number(r.clients))
  }
  return m
}

function main() {
  console.log(`[1/3] AREA 라인 역산 (${REMOTE ? 'prod' : 'local'}) — 두 청구기준 대조`)
  const billBy = foldByItem(fetchBasis(BILL_AREA))
  const rawBy = foldByItem(fetchBasis(RAW_AREA))

  console.log('[2/3] 품목 메타 + 규격없음(건별견적) 라인')
  const meta = d1(`
    SELECT item_code AS code, COALESCE(base_price, 0) AS base_price, COALESCE(is_active, 1) AS is_active
      FROM items WHERE pricing_method = 'AREA'`)
  const metaBy = new Map(meta.map((m) => [m.code, m]))

  // 규격이 없는 라인 = 면적 청구 자체가 불가 → 건별 견적(아크릴 「2T+시트부착」 계열)
  const noSpec = d1(`
    SELECT i.item_code AS code, COUNT(*) AS n
      FROM order_items oi JOIN items i ON i.id = oi.item_id
     WHERE i.pricing_method = 'AREA' AND oi.amount > 0
       AND (COALESCE(oi.width, 0) <= 0 OR COALESCE(oi.height, 0) <= 0)
     GROUP BY 1`)
  const noSpecBy = new Map(noSpec.map((r) => [r.code, Number(r.n)]))

  // ── 품목별 청구기준 판정: 변동이 20% 이상 작은 쪽을 채택, 비슷하면 '동등' ──
  const verdicts = []
  for (const code of new Set([...billBy.keys(), ...rawBy.keys()])) {
    const bi = billBy.get(code), ra = rawBy.get(code)
    const sb = bi ? stat(bi.buckets) : null
    const sr = ra ? stat(ra.buckets) : null
    const n = Math.max(sb ? sb.n : 0, sr ? sr.n : 0)
    let basis = '표본부족'
    if (n >= 5 && sb && sr) basis = sr.spread < sb.spread * 0.8 ? '실면적' : (sb.spread < sr.spread * 0.8 ? '청구면적' : '동등')
    else if (n >= 5) basis = sb ? '청구면적' : '실면적'
    verdicts.push({
      code, name: (bi || ra).name, n,
      spread_bill: sb ? sb.spread : null, spread_raw: sr ? sr.spread : null,
      med_bill: sb ? sb.med : null, med_raw: sr ? sr.med : null,
      basis, nospec: noSpecBy.get(code) || 0,
      current: Number((metaBy.get(code) || {}).base_price) || 0,
    })
  }

  console.log('[3/3] 판정 기준으로 구간표 산출')
  const out = []
  for (const v of verdicts) {
    const src = v.basis === '실면적' ? rawBy.get(v.code) : (billBy.get(v.code) || rawBy.get(v.code))
    if (!src) continue
    const m = metaBy.get(v.code) || {}
    for (const [band, bg] of src.bands) {
      const s = stat(bg.buckets)
      out.push({
        code: v.code, name: src.name, basis: v.basis, band, n: s.n, clients: bg.clients,
        med: s.med, q1: s.q1, q3: s.q3, spread: isFinite(s.spread) ? s.spread.toFixed(2) : '',
        suggest: s.n >= MIN_N && s.med > 0 ? Math.round(s.med / 100) * 100 : '',
        current: v.current, nospec: v.nospec,
        status: v.current > 0 ? '운영중(대조용)' : '공백(대상)',
        active: m.is_active === 0 ? '비활성' : '',
      })
    }
  }
  out.sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : a.band.localeCompare(b.band)))

  const esc = (s) => { const v = String(s == null ? '' : s); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v }
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  const BOM = String.fromCharCode(0xfeff)
  fs.writeFileSync(OUT, BOM + [
    '품목코드,품목명,변동최소기준(참고),면적구간,표본수,거래처수,중앙값(원/m2),Q1,Q3,변동(IQR/중앙),제안 m2단가,현재 base_price,규격없음라인,상태,활성',
    ...out.map((r) => [r.code, r.name, r.basis, r.band.replace('|', ' '), r.n, r.clients, r.med, r.q1, r.q3, r.spread, r.suggest, r.current, r.nospec, r.status, r.active].map(esc).join(',')),
  ].join('\n') + '\n', 'utf8')

  // ── 요약 ──
  const cnt = (b) => verdicts.filter((v) => v.basis === b).length
  console.log(`\n품목 ${verdicts.length}종 · 구간행 ${out.length}`)
  console.log(`청구기준 판정 — 청구면적(현수막식) ${cnt('청구면적')} · 실면적(판재식) ${cnt('실면적')} · 동등 ${cnt('동등')} · 표본부족 ${cnt('표본부족')}`)

  console.log('\n■ 대조군 검증 — 운영 base_price ↔ 역산(판정기준) [방법 자체가 맞는지]')
  let hit = 0, refN = 0
  for (const v of verdicts.filter((x) => x.current > 0).sort((a, b) => b.n - a.n)) {
    const med = v.basis === '실면적' ? v.med_raw : v.med_bill
    const ratio = med && v.current ? med / v.current : 0
    refN++
    if (ratio >= 0.9 && ratio <= 1.1) hit++
    if (refN <= 10) console.log(`  ${v.code.padEnd(14)} 운영 ${String(v.current).padStart(7)} <-> 역산 ${String(med == null ? '-' : med).padStart(7)} (배 ${ratio.toFixed(2)}) ${v.basis} ${v.name.slice(0, 16)}`)
  }
  console.log(`  → 운영값 재현 ${hit}/${refN}종 (±10% 이내)`)

  // ★어느 기준이 진짜인가 — 운영값이 있는 품목으로 두 기준을 **각각** 채점한다.
  //   변동(IQR) 최소화만 보면 틀린다: 최소청구 규칙이 작동하면 실면적 ㎡단가가 정가보다 높게 나오는데
  //   그게 "변동이 작다"로 보일 뿐이다(AQ-BANNER 실면적 2,500 vs 운영 1,800). 재현율이 정답을 가른다.
  const score = (pick) => {
    const rows2 = verdicts.filter((v) => v.current > 0 && v[pick] != null)
    const ok = rows2.filter((v) => v[pick] / v.current >= 0.9 && v[pick] / v.current <= 1.1).length
    return `${ok}/${rows2.length}`
  }
  console.log(`  → 기준별 재현율: 청구면적 ${score('med_bill')} · 실면적 ${score('med_raw')}`)

  console.log('\n■ 실면적 판정 품목 — 최소청구 규칙이 안 맞는 것들')
  for (const v of verdicts.filter((x) => x.basis === '실면적').sort((a, b) => b.n - a.n).slice(0, 10)) {
    console.log(`  ${v.code.padEnd(14)} n=${String(v.n).padStart(4)} 변동 청구면적 ${v.spread_bill.toFixed(2)} → 실면적 ${v.spread_raw.toFixed(2)}  실면적단가 ${v.med_raw.toLocaleString()}원/m2  ${v.name.slice(0, 16)}`)
  }

  console.log('\n■ 규격 없는 라인 = 면적 청구 불가(건별 견적) 상위 10')
  for (const v of verdicts.filter((x) => x.nospec > 0).sort((a, b) => b.nospec - a.nospec).slice(0, 10)) {
    console.log(`  ${v.code.padEnd(14)} 규격없음 ${String(v.nospec).padStart(4)}라인 / 규격있음 ${String(v.n).padStart(4)}라인  ${v.name.slice(0, 20)}`)
  }

  console.log('\n■ 공백 대상 — 표본 많은 품목 상위 10 (판정기준 구간별 중앙값)')
  const vBy = new Map(verdicts.map((v) => [v.code, v]))
  const tg = new Map()
  for (const r of out.filter((x) => x.status === '공백(대상)')) {
    if (!tg.has(r.code)) tg.set(r.code, { code: r.code, name: r.name, basis: r.basis, rows: [], n: 0 })
    const g = tg.get(r.code); g.rows.push(r); g.n += r.n
  }
  for (const it of [...tg.values()].sort((a, b) => b.n - a.n).slice(0, 10)) {
    const cells = it.rows.sort((a, b) => a.band.localeCompare(b.band))
      .map((r) => `${r.band.split('|')[1]}=${r.med ? r.med.toLocaleString() : '-'}(${r.n})`).join(' · ')
    const ns = (vBy.get(it.code) || {}).nospec || 0
    console.log(`  ${it.code.padEnd(14)} ${String(it.n).padStart(4)}라인 [${it.basis}]${ns ? ` +규격없음 ${ns}` : ''}  ${it.name.slice(0, 16)}`)
    console.log(`      ${cells}`)
  }

  console.log(`\nCSV: ${OUT}`)
  console.log('★자동 적용 없음 — 표 확정은 사람. 확정 후 마이그레이션으로 적재한다.')
}

main()
