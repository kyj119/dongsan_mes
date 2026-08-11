#!/usr/bin/env node
/**
 * 품목 단가 역산 — 이관된 실거래 이력에서 기준단가 후보를 뽑는다.
 *
 * 배경(2026-08-11 실측): 판매품목 880개 중 773개(88%)가 base_price·sales_price 모두 0이다.
 * 주문 화면을 열어도 단가가 0으로 나와 실사용 전환이 막혀 있다.
 * 단가표 테이블(client_item_prices·price_lists·size_grade_prices·price_groups)은 전부 0건 —
 * 구조는 완비돼 있고 데이터만 비어 있다.
 *
 * 원천 = 이카운트 이관분 order_items 22,036라인(실거래 단가).
 *   - AREA  품목: **`amount` 에서 역산한다** — `amount ÷ (청구면적 × 수량)`.
 *                 `unit_price` 를 면적으로 나누면 안 된다: 그 컬럼의 의미가 시점에 따라 다르다
 *                 (마이그 0530 이전 이관분 = 장당금액 / 이후 = ㎡단가). 나누는 식을 쓰면 0530 적용 후
 *                 **이중 나눗셈**이 된다(겪음: AQ-BANNER 1,800 → 300원/㎡). 금액 기준은 양쪽 다 맞는다.
 *                 ⚠️ width·height 단위는 **cm** (실측: 600×80=4.8㎡ → 9,000원 = ㎡당 1,875원).
 *                 mm 로 잘못 보면 ㎡ 단가가 100배로 나온다(133,000원/㎡ 같은 값이 나오면 이 착오다).
 *   - FIXED 품목: unit_price 를 그대로 쓴다.
 *
 * ★청구 면적 = 실측 면적이 아니다 (용준님 2026-08-11):
 *   각 변을 10cm 올림한 뒤 **최소 1m** 로 올려 계산한다. 0.5m×0.7m 는 1m×1m 로 청구한다.
 *   이 보정을 빼면 작은 규격의 ㎡ 단가가 통째로 부풀어 "면적이 작을수록 비싸다"는 가짜 곡선이 생긴다
 *   (AQ-BANNER 0.5㎡ 미만 구간: 보정 전 15,429원/㎡ → 보정 후 3,911원/㎡).
 *   실측 근거 = 0.24㎡(60×40)도 0.48㎡(60×80)도 단가가 3,000~4,500원으로 같았다. 면적 비례가 아니다.
 *   ⚠️ 이 규칙은 주문서 계산(calc.js·orderLineAmount.ts)에도 들어가야 한다 — 현재는 10cm 올림만 있다.
 *
 * 분류(판정은 사람이 한다 — 이 스크립트는 후보를 고를 뿐). 상세 기준 = classify() 주석:
 *   A 자동확정     변동 작음(IQR/median < 0.15) → 중앙값을 그대로 base_price 로 써도 안전
 *   B 배율필요     변동 중간(< 0.60)            → 기준단가 + 거래처별 배율(client_item_prices) 구조가 맞다
 *   C적용_면적흡수  변동 크지만 AREA — 단가에 면적이 곱해져 규격이 오차를 흡수한다
 *   C적용_소액     변동 크지만 FIXED 1만원 미만 — 틀려도 금액 영향이 작다
 *   C보류_무질서   변동 >= 2.0 — 대표값 자체가 성립하지 않는다(할인·조정 라인 등)
 *   C보류_표본편향  거래처 3곳 미만 — 그 몇 곳 사정이 전체값이 된다
 *   C보류_주문제작  FIXED 고액(간판·운임) — 그 값이 곧 청구액이라 위험. BOM 조립견적으로 풀 문제
 *   N 표본부족     n < 5
 *
 * 사용법:
 *   node scripts/derive-item-prices.cjs              # 요약 + CSV 생성
 *   node scripts/derive-item-prices.cjs --local      # 로컬 D1 (기본 --remote)
 *   node scripts/derive-item-prices.cjs --out <path> # CSV 경로 지정
 *   node scripts/derive-item-prices.cjs --sql <path> # 적재 마이그레이션 생성(A·B·C적용_*)
 *
 * 산출 = docs/pricing/derived-prices.csv (품목별 1행, 검토용)
 *
 * ⚠️ 이 스크립트는 DB 를 **갱신하지 않는다**. `--sql` 도 파일만 만들고 실행은 사람이 한다.
 *    대표값을 잘못 박으면 틀린 단가가 견적에 나간다 —
 *    memory project-dongsan-ecount-import "base_price 는 0 유지" 결정의 이유가 그것이다.
 *
 * ★base_price 는 **폴백이지 주 경로가 아니다**: 주문서는 `/api/prices` 가 고른
 *   recent(최근 거래가) > matched(특약·단가표) > base 순으로 채운다. prod 실측 기준
 *   거래처×품목 조합 5,040개(853곳·492품목)가 recent 로 커버되므로, base_price 가 실제로 쓰이는 건
 *   **처음 거래하는 거래처** 또는 **그 거래처가 처음 사는 품목**뿐이다. 그래서 C 등급(변동 큼)을
 *   빼도 실무가 돌아가고, 반대로 C 를 넣으면 신규 거래에 엉뚱한 값이 나갈 위험만 커진다.
 */
'use strict'

const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const args = process.argv.slice(2)
const REMOTE = !args.includes('--local')
const outIdx = args.indexOf('--out')
const OUT = outIdx >= 0 && args[outIdx + 1]
  ? args[outIdx + 1]
  : path.join('docs', 'pricing', 'derived-prices.csv')
const sqlIdx = args.indexOf('--sql')
const SQL_OUT = sqlIdx >= 0 ? (args[sqlIdx + 1] || path.join('migrations', '0529_backfill_item_base_price.sql')) : null
/**
 * 마이그레이션에 담을 등급. `C적용_*` 은 classify() 가 해로움 기준으로 걸러낸 것들이다.
 * 전 등급을 담아도 안전하다 — 생성되는 SQL 이 `base_price = 0` 인 행만 건드리므로
 * 앞선 마이그레이션이 이미 채운 품목은 자동으로 no-op 이 된다.
 */
const SQL_GRADES = new Set(['A_자동확정', 'B_배율필요', 'C적용_면적흡수', 'C적용_소액'])

const DB = 'webapp-production'

// 단가 이력이 없는 판매품목만 대상으로 한다(이미 값이 있으면 건드릴 이유가 없다).
const NO_PRICE = `i.is_sales_item = 1
    AND COALESCE(i.base_price, 0) = 0
    AND COALESCE(i.sales_price, 0) = 0`

// 청구 변 길이(cm) = 10cm 올림 후 최소 100cm.
//   (x+9)/10 정수나눗셈으로 올림한다 — SQLite 에 CEIL 이 없다.
//   규격이 소수 cm 인 경우(60.5)는 이 식이 내림이 되지만, 실측상 소수 규격은 없다.
const BILL_W = 'MAX(CAST((oi.width  + 9) / 10 AS INT) * 10, 100) / 100.0'
const BILL_H = 'MAX(CAST((oi.height + 9) / 10 AS INT) * 10, 100) / 100.0'

// ★㎡ 단가는 **금액에서 역산한다**(`unit_price` 를 면적으로 나누지 않는다).
//   `unit_price` 의 의미는 시점에 따라 다르다 — 마이그 0530 이전 이관분은 장당금액, 이후는 ㎡단가.
//   면적으로 나누는 식을 쓰면 0530 적용 후 **이중 나눗셈**이 되어 값이 면적배만큼 작아진다
//   (실제로 겪음: AQ-BANNER 1,800 → 300원/㎡). `amount ÷ (청구면적 × 수량)` 은 양쪽 다 맞는다.
// 100원 단위로 버킷팅해 GROUP BY 로 접는다 — 라인 22,036건을 그대로 받으면 응답이 커서 wrangler 가 버거워한다.
const Q_AREA = `
SELECT i.item_code AS code, i.item_name AS name, 'AREA' AS method,
       CAST(ROUND(oi.amount / (${BILL_W} * ${BILL_H} * oi.quantity) / 100) * 100 AS INT) AS price,
       COUNT(*) AS n,
       COUNT(DISTINCT o.client_id) AS clients
  FROM order_items oi
  JOIN items i  ON i.id = oi.item_id
  JOIN orders o ON o.id = oi.order_id
 WHERE ${NO_PRICE}
   AND i.pricing_method = 'AREA'
   AND oi.unit_price > 0
   AND COALESCE(oi.width, 0)  > 0
   AND COALESCE(oi.height, 0) > 0
   AND COALESCE(oi.quantity, 0) > 0
   AND oi.amount <> 0
 GROUP BY 1, 2, 3, 4`

// 품목별 실제 거래처 수. 버킷 배열에서 MAX 를 취하면 **버킷 하나의 거래처 수**라 크게 과소평가된다
// (AQ-BANNER 실제 318곳인데 버킷 최대는 130곳). 표본편향 판정에 쓰이므로 따로 정확히 센다.
const Q_CLIENTS = `
SELECT i.item_code AS code, COUNT(DISTINCT o.client_id) AS clients
  FROM order_items oi
  JOIN items i  ON i.id = oi.item_id
  JOIN orders o ON o.id = oi.order_id
 WHERE ${NO_PRICE} AND oi.unit_price > 0
 GROUP BY 1`

const Q_FIXED = `
SELECT i.item_code AS code, i.item_name AS name, 'FIXED' AS method,
       CAST(oi.unit_price AS INT) AS price,
       COUNT(*) AS n,
       COUNT(DISTINCT o.client_id) AS clients
  FROM order_items oi
  JOIN items i  ON i.id = oi.item_id
  JOIN orders o ON o.id = oi.order_id
 WHERE ${NO_PRICE}
   AND i.pricing_method = 'FIXED'
   AND oi.unit_price > 0
 GROUP BY 1, 2, 3, 4`

// 이력이 아예 없는 품목 — 역산 대상이 아니라 "신규 입력" 대상이다. 개수만 세어 보고한다.
const Q_ORPHAN = `
SELECT i.item_code AS code, i.item_name AS name,
       COALESCE(i.pricing_method, '(null)') AS method
  FROM items i
 WHERE ${NO_PRICE}
   AND NOT EXISTS (
     SELECT 1 FROM order_items oi WHERE oi.item_id = i.id AND oi.unit_price > 0
   )`

// wrangler 를 node 로 직접 실행한다. Windows 에서 npx 는 npx.cmd 이고,
// Node 24 는 .cmd 를 execFileSync 로 직접 띄우는 것을 막는다(EINVAL, CVE-2024-27980 대응).
// shell:true 로 우회하면 SQL 안의 따옴표가 셸에 먹혀 깨지므로 셸을 아예 거치지 않는다.
const WRANGLER = path.join(__dirname, '..', 'node_modules', 'wrangler', 'bin', 'wrangler.js')

function d1(sql) {
  const argv = [WRANGLER, 'd1', 'execute', DB, REMOTE ? '--remote' : '--local', '--json', '--command', sql]
  const raw = execFileSync(process.execPath, argv, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  })
  // wrangler 는 JSON 앞뒤로 배너·경고를 섞어 낸다 → 최외곽 배열/객체만 잘라 쓴다.
  const start = raw.indexOf('[')
  if (start < 0) throw new Error(`D1 응답에 JSON 이 없다:\n${raw.slice(0, 500)}`)
  const parsed = JSON.parse(raw.slice(start))
  const first = Array.isArray(parsed) ? parsed[0] : parsed
  if (!first || !first.results) throw new Error(`D1 응답 형식이 예상과 다르다: ${JSON.stringify(first).slice(0, 300)}`)
  return first.results
}

/** 가중 분위수 — 버킷(값,빈도) 배열에서 q 분위 값을 뽑는다. */
function weightedQuantile(buckets, q) {
  const total = buckets.reduce((s, b) => s + b.n, 0)
  const target = total * q
  let acc = 0
  for (const b of buckets) {
    acc += b.n
    if (acc >= target) return b.price
  }
  return buckets[buckets.length - 1].price
}

/**
 * 등급 판정. C(변동 큼)는 다시 가른다 — 기준은 "정확한가"가 아니라 **틀렸을 때 얼마나 해로운가**다.
 * base_price 는 폴백이라 실제로 쓰이는 건 신규 거래처의 첫 주문뿐이고, 경리가 화면에서 고칠 수 있다.
 * 그러니 "완벽한 값"이 아니라 "합리적 시작값"이면 채우는 편이 0원보다 낫다. 단 다음은 예외:
 *   - 표본편향: 거래처가 3곳 미만이면 그 몇 곳의 사정이 전체값이 된다. 신규 거래처에 쓸 근거가 없다.
 *   - 주문제작: FIXED 고액은 **그 값이 곧 청구액**이다. 간판(SIGN-*·SGM-*)은 건마다 사양이 달라
 *     대표값 자체가 성립하지 않고, 애초에 BOM 조립견적으로 풀 문제다(현황판 「간판 조립견적」 설계 대기).
 *     운임(ETC-EXP 변동 3.68)도 거리별이라 단가 개념이 없다.
 * 반대로 AREA 는 단가에 면적이 곱해져 규격이 오차를 흡수하고, FIXED 라도 소액이면 영향이 작다.
 */
function classify(stats) {
  if (stats.lines < 5) return 'N_표본부족'
  if (stats.spread < 0.15) return 'A_자동확정'
  if (stats.spread < 0.60) return 'B_배율필요'
  // 변동이 중앙값의 2배를 넘으면 대표값 자체가 성립하지 않는다. 금액대·방식과 무관하게 뺀다.
  //   실제로 이 상한이 없을 때 `ETC-DISC 할인`(변동 6.05)·`WDR-25-090`(21.89)이 딸려 들어왔다.
  //   할인·조정 라인은 건마다 액수가 다른 게 정상이라 기본값을 두는 것 자체가 틀렸다.
  if (stats.spread >= 2.0) return 'C보류_무질서'
  if (stats.clients < 3) return 'C보류_표본편향'
  if (stats.method === 'AREA') return 'C적용_면적흡수'
  if (stats.median < 10000) return 'C적용_소액'
  return 'C보류_주문제작'
}

function csvCell(v) {
  const s = String(v == null ? '' : v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function main() {
  process.stdout.write(`[1/4] AREA 품목 단가 역산 (${REMOTE ? 'prod' : 'local'})...\n`)
  const areaRows = d1(Q_AREA)
  process.stdout.write(`[2/4] FIXED 품목 단가 수집...\n`)
  const fixedRows = d1(Q_FIXED)
  process.stdout.write(`[3/4] 이력 없는 품목 조회...\n`)
  const orphans = d1(Q_ORPHAN)
  process.stdout.write(`[4/4] 품목별 거래처 수 집계...\n`)
  const clientCount = new Map(d1(Q_CLIENTS).map((r) => [r.code, r.clients]))

  // 품목별로 버킷을 모은다.
  const byItem = new Map()
  for (const r of [...areaRows, ...fixedRows]) {
    if (!Number.isFinite(r.price) || r.price <= 0) continue
    let e = byItem.get(r.code)
    if (!e) {
      e = { code: r.code, name: r.name, method: r.method, buckets: [] }
      byItem.set(r.code, e)
    }
    e.buckets.push({ price: r.price, n: r.n, clients: r.clients })
  }

  const out = []
  for (const e of byItem.values()) {
    e.buckets.sort((a, b) => a.price - b.price)
    const lines = e.buckets.reduce((s, b) => s + b.n, 0)
    const clients = clientCount.get(e.code) || 0
    const median = weightedQuantile(e.buckets, 0.5)
    const q1 = weightedQuantile(e.buckets, 0.25)
    const q3 = weightedQuantile(e.buckets, 0.75)
    // 변동 지표 = IQR / median. 표준편차보다 이상치에 둔감하다(1원·487만원 같은 오입력이 섞여 있다).
    const spread = median > 0 ? (q3 - q1) / median : Infinity
    const stats = {
      ...e, lines, clients, median, q1, q3, spread,
      min: e.buckets[0].price,
      max: e.buckets[e.buckets.length - 1].price,
      distinct: e.buckets.length,
    }
    stats.grade = classify(stats)
    out.push(stats)
  }

  out.sort((a, b) => b.lines - a.lines)

  // ── CSV ─────────────────────────────────────────────
  const header = [
    '분류', '품목코드', '품목명', '방식', '단위',
    '라인수', '거래처수', '단가종류',
    '제안단가(중앙값)', 'Q1', 'Q3', '최소', '최대', '변동(IQR/중앙값)',
  ]
  const body = out.map((r) => [
    r.grade, r.code, r.name, r.method, r.method === 'AREA' ? '원/㎡' : '원/개',
    r.lines, r.clients, r.distinct,
    r.median, r.q1, r.q3, r.min, r.max, r.spread.toFixed(3),
  ])
  for (const o of orphans) {
    body.push(['X_이력없음', o.code, o.name, o.method, '', 0, 0, 0, '', '', '', '', '', ''])
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  // 엑셀이 UTF-8 CSV 를 CP949 로 읽어 한글이 깨진다 → BOM 을 붙인다.
  fs.writeFileSync(OUT, '﻿' + [header, ...body].map((r) => r.map(csvCell).join(',')).join('\r\n'), 'utf8')

  // ── 요약 ────────────────────────────────────────────
  const tally = new Map()
  for (const r of out) {
    const t = tally.get(r.grade) || { items: 0, lines: 0 }
    t.items++; t.lines += r.lines
    tally.set(r.grade, t)
  }
  const order = ['A_자동확정', 'B_배율필요', 'C적용_면적흡수', 'C적용_소액', 'C보류_표본편향', 'C보류_주문제작', 'C보류_무질서', 'N_표본부족']

  process.stdout.write('\n분류               품목    라인\n')
  process.stdout.write('─────────────────────────────────\n')
  for (const g of order) {
    const t = tally.get(g)
    if (!t) continue
    process.stdout.write(`${g.padEnd(16)} ${String(t.items).padStart(5)}  ${String(t.lines).padStart(6)}\n`)
  }
  process.stdout.write(`${'X_이력없음'.padEnd(16)} ${String(orphans.length).padStart(5)}  ${'0'.padStart(6)}\n`)
  process.stdout.write('─────────────────────────────────\n')
  process.stdout.write(`${'합계'.padEnd(16)} ${String(out.length + orphans.length).padStart(5)}\n\n`)

  process.stdout.write('라인수 상위 10 (전환 영향이 큰 순서):\n')
  for (const r of out.slice(0, 10)) {
    const unit = r.method === 'AREA' ? '원/㎡' : '원'
    process.stdout.write(
      `  ${r.grade.slice(0, 1)} ${r.code.padEnd(14)} ${String(r.lines).padStart(5)}라인 ` +
      `${String(r.clients).padStart(3)}곳  중앙값 ${String(r.median).padStart(7)}${unit}` +
      `  (Q1 ${r.q1}~Q3 ${r.q3}, 변동 ${r.spread.toFixed(2)})\n`
    )
  }
  process.stdout.write(`\nCSV: ${OUT}\n`)

  if (SQL_OUT) writeMigration(out)
}

/** A·B 등급만 base_price 를 채우는 멱등 마이그레이션을 만든다. */
function writeMigration(rows) {
  const targets = rows.filter((r) => SQL_GRADES.has(r.grade) && r.median > 0)
  const lines = [
    '-- 품목 기본단가 백필 — 이카운트 이관 실거래 이력에서 역산한 중앙값',
    '--',
    '-- 생성 = node scripts/derive-item-prices.cjs --sql <이 경로>   (재생성하면 같은 결과가 나온다)',
    '-- 대상 = A·B 등급 + C 중 "틀려도 해가 작은" 것(C적용_면적흡수·C적용_소액). 판정 기준 = 그 스크립트의 classify().',
    '--        빠진 것 = C보류_무질서(변동>=2.0, 할인·조정 라인)·C보류_표본편향(거래처<3곳)',
    '--                 ·C보류_주문제작(FIXED 고액 — 간판은 BOM 조립견적, 운임은 거리별)·N(표본<5)·X(이력없음).',
    '--        근거표 = docs/pricing/derived-prices.csv (등급 컬럼에 사유가 그대로 들어 있다).',
    '-- AREA 품목은 원/㎡, FIXED 품목은 원/개. 청구면적 = 10cm 올림 + 최소 1m.',
    '--',
    '-- 멱등 = base_price 가 0 인 행만 건드린다. 재실행하면 조건이 안 맞아 no-op.',
    '--',
    '-- 되돌리기 = 변경 전 값이 price_change_history 에 남는다. 실행 직후 시각을 적어 범위를 좁힐 것',
    '-- (이 테이블은 사람이 바꾼 단가도 함께 쌓이므로 조건 없이 되돌리면 남의 변경까지 지운다):',
    "--   SELECT changed_at, COUNT(*) FROM price_change_history WHERE target_type = 'ITEM' GROUP BY 1 ORDER BY 1 DESC LIMIT 3;",
    '--   UPDATE items SET base_price = 0 WHERE id IN (',
    "--     SELECT target_id FROM price_change_history",
    "--      WHERE target_type = 'ITEM' AND old_price = 0 AND changed_at >= '<위에서 확인한 실행시각>');",
    '',
  ]
  for (const r of targets) {
    const unit = r.method === 'AREA' ? '원/㎡' : '원'
    lines.push(`-- ${r.code} ${r.name} — ${r.lines}라인 ${r.clients}곳 · ${r.median}${unit} (Q1 ${r.q1}~Q3 ${r.q3}, 변동 ${r.spread.toFixed(2)})`)
    // 이력 먼저 — UPDATE 뒤에 넣으면 재실행 때 조건이 흐려져 중복 적재된다.
    lines.push(
      `INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by)\n` +
      `  SELECT 'ITEM', id, item_name, COALESCE(base_price, 0), ${r.median}, NULL FROM items\n` +
      `   WHERE item_code = '${r.code.replace(/'/g, "''")}' AND COALESCE(base_price, 0) = 0;`
    )
    lines.push(
      `UPDATE items SET base_price = ${r.median}, updated_at = datetime('now')\n` +
      ` WHERE item_code = '${r.code.replace(/'/g, "''")}' AND COALESCE(base_price, 0) = 0;`
    )
    lines.push('')
  }
  fs.mkdirSync(path.dirname(SQL_OUT), { recursive: true })
  fs.writeFileSync(SQL_OUT, lines.join('\n'), 'utf8')

  const byMethod = targets.reduce((m, r) => (m[r.method] = (m[r.method] || 0) + 1, m), {})
  process.stdout.write(`SQL: ${SQL_OUT}  (${targets.length}품목 — AREA ${byMethod.AREA || 0} · FIXED ${byMethod.FIXED || 0})\n`)
}

main()
