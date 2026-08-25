#!/usr/bin/env node
/**
 * propose-count-scope.cjs — 주간 재고실사 범위 다이어트 + 안전재고 제안 (판단자료, 읽기 전용)
 *
 * 배경: 출력실 실사표 73품목의 미입력률이 31.7%, 전사출력실은 80%다. 매주 73개를 세라는 요구가
 *   지켜지지 않는 것이지 사람이 게으른 게 아니다. 세는 대상을 줄이는 것이 채택의 전제다.
 *   (근거·경위 = docs/superpowers/specs/2026-08-25-employee-requirements-protocol.md)
 *
 * 산출 3종:
 *   ① 제거 후보  — 회차 내내 한 번도 채워진 적 없는 품목. 실사표에 있으나 현장이 세지 않는다.
 *   ② 확인 필요  — 채운 값이 전부 0. 「그 구역에 실물이 없다」는 뜻일 수 있다(엡손 솔벤잉크 6색이
 *                  6주 연속 0을 찍은 사례). 빼기 전에 현장 확인이 필요하므로 자동 제거하지 않는다.
 *   ③ 주간/월간  — 회차 간 값이 실제로 바뀐 횟수로 가른다. 자주 변하는 것만 주간으로 남긴다.
 *   + 안전재고·재주문점 제안 — 주당 소모량 추정 × 리드타임.
 *
 * ★안전재고 기능은 이미 완성돼 매일 06:00 자동 판정 중이다(cron → POST /api/notifications/generate).
 *   `inventory.safe_stock` 이 387행 전부 0 이라 아무것도 안 걸릴 뿐이다. 값만 채우면 코드 없이 작동한다.
 * ★수량 단위는 base(M·L) 다 — 2026-08-20 정합화 기준. 롤/통 단위로 읽지 말 것.
 * ★`inventory` 는 창고별 다중 행이고 경고 판정이 `MAX(safe_stock)` 으로 접으므로, 제안값은
 *   해당 구역 행에 넣으면 그대로 반영된다. 품목 단위로 합산해 넣지 말 것.
 * ⚠️소모량은 「회차 간 감소분」 추정이다. 회차 사이에 입고가 있으면 그 구간은 계산에서 빠지므로
 *   과소추정 쪽으로 치우친다. 정밀값이 필요하면 GET /api/inventory-counts/consumption
 *   (기초+매입−기말) 을 쓸 것.
 *
 * 사용법:
 *   node scripts/propose-count-scope.cjs                 # prod 리포트 + CSV
 *   node scripts/propose-count-scope.cjs --local
 *   node scripts/propose-count-scope.cjs --zones 1,3     # 기본 = 출력실(1)·전사출력실(3)
 *   node scripts/propose-count-scope.cjs --lead 2        # 리드타임(주), 기본 2 — 실제값 확인 필요
 *   node scripts/propose-count-scope.cjs --weekly-min 5  # 주간 잔류 기준(변동 횟수), 기본 5
 *   node scripts/propose-count-scope.cjs --out <path>
 */
'use strict'

const path = require('path')
const fs = require('fs')
const { execFileSync } = require('child_process')

const argv = process.argv.slice(2)
const flag = (name, dflt) => {
  const i = argv.indexOf(`--${name}`)
  return i > -1 && argv[i + 1] ? argv[i + 1] : dflt
}

const REMOTE = !argv.includes('--local')
const ZONES = String(flag('zones', '1,3')).split(',').map((s) => parseInt(s.trim(), 10)).filter(Number.isFinite)
const LEAD_WEEKS = Number(flag('lead', '2'))
const WEEKLY_MIN_CHANGES = Number(flag('weekly-min', '5'))
const OUT = flag('out', path.join(__dirname, '..', 'docs', 'analysis', '2026-08-25-count-scope-proposal.csv'))
const SQL_OUT = flag('emit-sql', null)  // 지정 시 safe_stock·reorder_point UPDATE 문을 파일로 뽑는다

const DB = 'webapp-production'
const WRANGLER = path.join(__dirname, '..', 'node_modules', 'wrangler', 'bin', 'wrangler.js')

// propose-costbase-prices.cjs d1() 과 동일 — wrangler JSON 앞뒤 배너 절단
function d1(sql) {
  const args = [WRANGLER, 'd1', 'execute', DB, REMOTE ? '--remote' : '--local', '--json', '--command', sql]
  const raw = execFileSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true })
  const start = raw.indexOf('[')
  if (start < 0) throw new Error(`D1 응답에 JSON 이 없다:\n${raw.slice(0, 500)}`)
  const parsed = JSON.parse(raw.slice(start))
  const first = Array.isArray(parsed) ? parsed[0] : parsed
  if (!first || !first.results) throw new Error(`D1 응답 형식이 예상과 다르다: ${JSON.stringify(first).slice(0, 300)}`)
  return first.results
}

const median = (arr) => {
  if (!arr.length) return null
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

// 10원/1단위 미만은 의미 없으므로 눈에 익은 자리로 올림
const roundUp = (v) => {
  if (!(v > 0)) return 0
  if (v < 10) return Math.ceil(v * 10) / 10
  if (v < 100) return Math.ceil(v)
  return Math.ceil(v / 10) * 10
}

const daysBetween = (a, b) => (new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000

function main() {
  console.log(`[1/3] 실사 이력 수집 (${REMOTE ? 'prod' : 'local'}) — 구역 ${ZONES.join(',')}`)

  const rows = d1(`
    SELECT c.storage_zone_id AS zone_id,
           z.zone_name       AS zone_name,
           c.count_date      AS count_date,
           i.id              AS item_id,
           i.item_code       AS item_code,
           i.item_name       AS item_name,
           i.unit            AS unit,
           i.base_unit       AS base_unit,
           ci.counted_quantity AS qty
      FROM inventory_count_items ci
      JOIN inventory_counts c ON c.id = ci.count_id
      JOIN items i            ON i.id = ci.item_id
      LEFT JOIN storage_zones z ON z.id = c.storage_zone_id
     WHERE c.storage_zone_id IN (${ZONES.join(',')})
     ORDER BY c.storage_zone_id, i.id, c.count_date
  `)

  if (!rows.length) {
    console.log('실사 이력이 없다. 구역 번호를 확인할 것.')
    return
  }

  // 현재 재고 — 안전재고를 넣었을 때 곧바로 걸릴 품목 수를 미리 본다.
  //   ★경고가 처음부터 쏟아지면 채널이 죽는다. 적용 전에 반드시 이 수치를 확인할 것.
  const invRows = d1(`
    SELECT inv.item_id, inv.storage_zone_id AS zone_id, inv.entity_id, inv.quantity
      FROM inventory inv
     WHERE inv.storage_zone_id IN (${ZONES.join(',')})
  `)
  const invByKey = new Map()
  for (const r of invRows) invByKey.set(`${r.zone_id}:${r.item_id}`, Number(r.quantity) || 0)

  // 품목별 시계열로 접는다
  const byItem = new Map()
  for (const r of rows) {
    const key = `${r.zone_id}:${r.item_id}`
    if (!byItem.has(key)) {
      byItem.set(key, { ...r, series: [] })
    }
    byItem.get(key).series.push({ date: r.count_date, qty: r.qty })
  }

  // ★구역 전체 미입력률 — 이게 높으면 「내내 비어 있다」가 현장 미실사인지
  //   옮겨적기 누락인지 구분되지 않는다(전사출력실 80%). 제거 판정을 그대로 믿으면 안 된다.
  const zoneBlank = new Map()
  for (const r of rows) {
    const z = r.zone_id
    if (!zoneBlank.has(z)) zoneBlank.set(z, { total: 0, blank: 0, name: r.zone_name || `zone${z}` })
    const a = zoneBlank.get(z)
    a.total++
    if (r.qty === null || r.qty === undefined) a.blank++
  }
  const CONFOUND_PCT = 50
  const zoneConfounded = new Set(
    [...zoneBlank.entries()].filter(([, a]) => (a.blank / a.total) * 100 > CONFOUND_PCT).map(([z]) => z))

  console.log(`[2/3] 품목 ${byItem.size}개 분류 + 소모량 추정 (리드타임 ${LEAD_WEEKS}주)`)

  const out = []
  for (const it of byItem.values()) {
    const s = it.series
    const filled = s.filter((p) => p.qty !== null && p.qty !== undefined)
    const weeksTotal = s.length
    const weeksBlank = weeksTotal - filled.length
    const weeksZero = filled.filter((p) => Number(p.qty) === 0).length

    // 회차 간 값이 실제로 바뀐 횟수 (채워진 연속 쌍만)
    let changes = 0
    for (let k = 1; k < s.length; k++) {
      const a = s[k - 1].qty, b = s[k].qty
      if (a === null || b === null || a === undefined || b === undefined) continue
      if (Number(a) !== Number(b)) changes++
    }

    // 주당 소모량 = 감소 구간만 모아 일할 → 주 환산 → 중앙값
    const rates = []
    for (let k = 1; k < s.length; k++) {
      const p = s[k - 1], q = s[k]
      if (p.qty === null || q.qty === null || p.qty === undefined || q.qty === undefined) continue
      const drop = Number(p.qty) - Number(q.qty)
      if (!(drop > 0)) continue // 증가 = 입고 발생, 소모량 계산 불가 구간
      const days = daysBetween(p.date, q.date)
      if (!(days > 0)) continue
      rates.push((drop / days) * 7)
    }
    const weekly = median(rates)

    // 분류
    // ★「전부 0」만 보면 엡손 솔벤잉크처럼 6주 연속 0 뒤에 한 번 입고된 품목을 놓친다.
    //   과반이 0 이면 그 구역에 상시 있는 물건이 아니라고 보고 현장에 묻는다.
    const zeroRatio = filled.length ? weeksZero / filled.length : 0
    let cls, note
    if (filled.length === 0) {
      cls = zoneConfounded.has(it.zone_id) ? '판정보류' : '제거후보'
      note = zoneConfounded.has(it.zone_id)
        ? `${weeksTotal}회차 내내 비어 있으나 이 구역 자체가 미입력 ${CONFOUND_PCT}% 초과 — 현장 미실사인지 옮겨적기 누락인지 구분 불가`
        : `${weeksTotal}회차 내내 미입력 — 현장이 세지 않는다`
    } else if (filled.length >= 3 && zeroRatio >= 0.6) {
      cls = '확인필요'
      note = `채운 ${filled.length}회 중 ${weeksZero}회가 0 — 이 구역에 상시 있는 물건이 아닐 수 있다`
    } else if (changes >= WEEKLY_MIN_CHANGES) {
      cls = '주간'
      note = `변동 ${changes}회 — 자주 움직인다`
    } else {
      cls = '월간'
      note = `변동 ${changes}회 — 월 1회로 충분`
    }

    const safe = cls === '주간' || cls === '월간' ? roundUp((weekly || 0) * LEAD_WEEKS) : 0
    const rop = safe > 0 ? roundUp((weekly || 0) * (LEAD_WEEKS + 1)) : 0

    const curQty = invByKey.get(`${it.zone_id}:${it.item_id}`)
    out.push({
      _item_id: it.item_id,
      _zone_id: it.zone_id,
      cur_qty: curQty === undefined ? '' : curQty,
      would_alert: safe > 0 && curQty !== undefined && curQty < safe ? 'Y' : '',
      zone: it.zone_name || `zone${it.zone_id}`,
      item_code: it.item_code,
      item_name: it.item_name,
      unit: it.unit || '',
      base_unit: it.base_unit || '',
      weeks_total: weeksTotal,
      weeks_blank: weeksBlank,
      weeks_zero: weeksZero,
      changes,
      class: cls,
      weekly_consumption: weekly === null ? '' : Math.round(weekly * 100) / 100,
      safe_stock: safe,
      reorder_point: rop,
      note,
    })
  }

  // 구역 → 분류 → 변동 많은 순
  const order = { 주간: 0, 월간: 1, 확인필요: 2, 제거후보: 3, 판정보류: 4 }
  out.sort((a, b) =>
    a.zone.localeCompare(b.zone) || order[a.class] - order[b.class] || b.changes - a.changes)

  console.log(`[3/3] CSV 기록 → ${OUT}`)
  const cols = Object.keys(out[0])
  const esc = (v) => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, '﻿' + [cols.join(','), ...out.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n'), 'utf8')

  // ── 리포트 ────────────────────────────────────────────
  const zones = [...new Set(out.map((r) => r.zone))]
  for (const z of zones) {
    const zr = out.filter((r) => r.zone === z)
    const cnt = (c) => zr.filter((r) => r.class === c).length
    console.log(`\n■ ${z} — 실사표 ${zr.length}품목`)
    console.log(`   주간 잔류   ${String(cnt('주간')).padStart(3)}   (변동 ${WEEKLY_MIN_CHANGES}회 이상)`)
    console.log(`   월간으로    ${String(cnt('월간')).padStart(3)}`)
    console.log(`   확인 필요   ${String(cnt('확인필요')).padStart(3)}   ← 현장에 물어본 뒤 제거 판단`)
    console.log(`   제거 후보   ${String(cnt('제거후보')).padStart(3)}   ← 내내 미입력`)
    if (cnt('판정보류')) {
      console.log(`   판정 보류   ${String(cnt('판정보류')).padStart(3)}   ← 구역 미입력률이 높아 판정 불가`)
    }
    console.log(`   ⇒ 매주 세는 대상 ${zr.length} → ${cnt('주간')}`)

    const zb = [...zoneBlank.values()].find((a) => a.name === z)
    if (zb && zoneConfounded.has([...zoneBlank.entries()].find(([, a]) => a.name === z)[0])) {
      console.log(`   ⚠️이 구역은 미입력률 ${((zb.blank / zb.total) * 100).toFixed(1)}% — 실사표를 손대기 전에`)
      console.log(`      "종이로는 세고 있는데 MES 에만 안 들어온 것"인지부터 확인할 것.`)
    }

    const ask = zr.filter((r) => r.class === '확인필요')
    if (ask.length) {
      console.log(`\n   [현장 확인 목록] "이거 ${z}에 있어요? 실사표에 있는데 계속 0으로 나와서요."`)
      for (const r of ask.slice(0, 12)) console.log(`     ${r.item_code.padEnd(18)} ${r.item_name}`)
      if (ask.length > 12) console.log(`     … 외 ${ask.length - 12}건`)
    }

    const drop = zr.filter((r) => r.class === '제거후보' || r.class === '판정보류')
    if (drop.length) {
      console.log(`\n   [${drop[0].class === '판정보류' ? '판정 보류' : '제거 후보'}]`)
      for (const r of drop.slice(0, 12)) console.log(`     ${r.item_code.padEnd(18)} ${r.item_name}`)
      if (drop.length > 12) console.log(`     … 외 ${drop.length - 12}건`)
    }
  }

  const withSafe = out.filter((r) => r.safe_stock > 0)
  const alerting = withSafe.filter((r) => r.would_alert === 'Y')
  console.log(`\n■ 안전재고 제안 — ${withSafe.length}품목 (리드타임 ${LEAD_WEEKS}주 가정)`)
  console.log(`   현재 inventory.safe_stock 은 전 행 0 이라 매일 06:00 판정에 아무것도 안 걸린다.`)
  console.log(`   값을 넣으면 다음 날부터 경고가 돈다 — 코드 변경 없음.`)
  console.log(`   ⚠️리드타임 ${LEAD_WEEKS}주는 가정값이다(입고 시각 데이터가 없어 실측 불가). --lead 로 조정.`)
  console.log(`\n   ★적용 즉시 경고가 걸릴 품목 = ${alerting.length} / ${withSafe.length}`)
  console.log(`     경고가 처음부터 쏟아지면 채널이 죽는다. 이 수가 크면 --lead 를 낮춰 다시 본다.`)
  for (const r of alerting.slice(0, 10)) {
    console.log(`       ${String(r.item_code).padEnd(16)} 현재 ${String(r.cur_qty).padStart(8)} < 안전 ${r.safe_stock}`)
  }
  if (alerting.length > 10) console.log(`       … 외 ${alerting.length - 10}건`)

  if (SQL_OUT) {
    const stmts = [
      '-- inventory.safe_stock · reorder_point 채우기 (propose-count-scope.cjs 생성)',
      `-- 리드타임 ${LEAD_WEEKS}주 가정 · safe = 주당소모 × ${LEAD_WEEKS} · reorder = 주당소모 × ${LEAD_WEEKS + 1}`,
      '-- ★창고별 다중 행이므로 (item_id, entity_id, storage_zone_id) 로 특정한다. 품목 단위 합산 금지.',
      '-- 롤백: UPDATE inventory SET safe_stock=0, reorder_point=0 WHERE id IN (SELECT id FROM _bak_0825_safestock);',
      '',
      'CREATE TABLE IF NOT EXISTS _bak_0825_safestock AS',
      `SELECT id, item_id, entity_id, storage_zone_id, safe_stock, reorder_point, datetime('now') AS saved_at`,
      `  FROM inventory WHERE storage_zone_id IN (${ZONES.join(',')});`,
      '',
    ]
    for (const r of withSafe) {
      stmts.push(
        `UPDATE inventory SET safe_stock = ${r.safe_stock}, reorder_point = ${r.reorder_point}, last_updated = CURRENT_TIMESTAMP\n` +
        ` WHERE item_id = ${r._item_id} AND storage_zone_id = ${r._zone_id};   -- ${r.item_code}`)
    }
    fs.mkdirSync(path.dirname(SQL_OUT), { recursive: true })
    fs.writeFileSync(SQL_OUT, stmts.join('\n') + '\n', 'utf8')
    console.log(`\n   SQL 기록 → ${SQL_OUT} (${withSafe.length}건)`)
  }

  console.log(`\n적용은 자동으로 하지 않는다. CSV·SQL 검토 후 실행하거나 /inventory 안전재고 설정 모달로 반영.`)
}

main()
