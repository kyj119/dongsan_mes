#!/usr/bin/env node
/**
 * Cloudflare 사용량·요금 실측 리포트 — 「청구서의 $N 이 어느 축에서 나왔나」를 숫자로 만든다.
 *
 * 왜 필요한가 (2026-09-08):
 *   2026-08-07 $125.70 → 2026-09 $50. 줄긴 줄었는데 **무엇이 남았는지 아무도 모른다**.
 *   앱의 예산 감시(`/api/cron/budget-check`)는 「오늘 하루」만 본다 — 청구는 「한 달 누적」으로 나오고,
 *   축(요청·CPU·D1 읽기/쓰기·R2)마다 무료 포함량과 단가가 달라 **일 사용량만 봐서는 달러가 안 나온다**.
 *   이 스크립트는 30일치를 일자별로 뽑아 **포함량 대비 초과분**을 축별 달러로 환산한다.
 *
 * 사용법 (PowerShell):
 *   $env:CF_ANALYTICS_TOKEN='...'; $env:CF_ACCOUNT_ID='...'; npm run audit:cf-usage
 *   npm run audit:cf-usage -- --days 60          # 조회 구간(기본 30일, 데이터 보존은 CF 정책에 따름)
 *   npm run audit:cf-usage -- --json             # 기계 판독용
 *   npm run audit:cf-usage -- --raw              # GraphQL 원본 응답까지 덤프(스키마 변경 진단)
 *
 * 토큰 = Cloudflare 대시보드 → My Profile → API Tokens → Create Token →
 *        권한 `Account / Account Analytics / Read`. 예산 감시(`CF_ANALYTICS_TOKEN`)와 같은 토큰을 쓴다.
 *
 * ⚠️ 이 스크립트가 내는 달러는 **추정**이다. 청구서의 정답은 대시보드 Billing → Usage 이고,
 *    여기서 보는 건 「어느 축이 지배적인가」와 「언제부터 그랬나」다. 단가는 아래 PRICING 상수에 명시했다.
 * ⚠️ 계정에 워커·D1·R2 가 여러 개면 **MES 것만 골라 보지 않는다** — 청구는 계정 단위라 전부 합쳐야 맞다.
 *    대신 dimensions(databaseId·scriptName·bucketName)로 쪼개 출력하므로 누가 먹었는지는 보인다.
 */
'use strict'

const ENDPOINT = 'https://api.cloudflare.com/client/v4/graphql'

// ── 요금표 (Workers Paid, 2026-09 기준) ────────────────────────────────
// 출처: developers.cloudflare.com/workers/platform/pricing · /d1/platform/pricing · /r2/pricing
// 단가가 바뀌면 여기만 고친다. 「포함량」은 **월 단위** 무료 제공분이다.
const PRICING = {
  base: 5.0,                                   // Workers Paid 월 기본료
  requests: { included: 10_000_000, per: 1_000_000, price: 0.30 },
  cpuMs: { included: 30_000_000, per: 1_000_000, price: 0.02 },
  d1RowsRead: { included: 25_000_000_000, per: 1_000_000, price: 0.001 },
  d1RowsWritten: { included: 50_000_000, per: 1_000_000, price: 1.00 },
  d1StorageGb: { included: 5, price: 0.75 },   // GB-월
  r2StorageGb: { included: 10, price: 0.015 }, // GB-월
  r2ClassA: { included: 1_000_000, per: 1_000_000, price: 4.50 },
  r2ClassB: { included: 10_000_000, per: 1_000_000, price: 0.36 },
}

const argv = process.argv.slice(2)
const has = (f) => argv.includes(f)
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d }

const TOKEN = process.env.CF_ANALYTICS_TOKEN || process.env.CLOUDFLARE_API_TOKEN || val('--token', '')
const ACCOUNT = process.env.CF_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID || val('--account', '')
const DAYS = Math.min(Math.max(Number(val('--days', 30)) || 30, 1), 90)
const JSON_OUT = has('--json')
const RAW = has('--raw')

const C = { reset: '\x1b[0m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', dim: '\x1b[2m', cyan: '\x1b[36m', bold: '\x1b[1m' }
const num = (n) => (n == null ? '-' : Number(n).toLocaleString())
const usd = (n) => `$${(Math.round(n * 100) / 100).toFixed(2)}`
const ymd = (offsetDays) => new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10)

async function gql(query, variables) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new Error(`HTTP ${res.status} ${JSON.stringify(json).slice(0, 200)}`)
  if (json && json.errors && json.errors.length) throw new Error(String(json.errors[0].message).slice(0, 240))
  return json && json.data
}

// 데이터셋마다 **쿼리를 따로 던진다**. 하나로 묶으면 한쪽 스키마가 어긋날 때 둘 다 못 받는다
// (budgetAlert.ts 와 같은 이유 — 2026-08-11 에 요청 데이터셋 이름이 Pages/Workers 로 갈려 겪었다).
async function probe(name, query, variables, extract) {
  try {
    const data = await gql(query, variables)
    if (RAW) console.log(C.dim + `[raw:${name}] ` + JSON.stringify(data).slice(0, 2000) + C.reset)
    return { name, ok: true, rows: extract(data) || [] }
  } catch (e) {
    return { name, ok: false, error: String((e && e.message) || e), rows: [] }
  }
}

const acc = (inner) => `query($tag:String!,$from:Date!,$to:Date!){ viewer{ accounts(filter:{accountTag:$tag}){ ${inner} } } }`
const accT = (inner) => `query($tag:String!,$fromT:Time!,$toT:Time!){ viewer{ accounts(filter:{accountTag:$tag}){ ${inner} } } }`
const first = (d, key) => (((d || {}).viewer || {}).accounts || [])[0] ? d.viewer.accounts[0][key] : []

async function collect() {
  const from = ymd(-DAYS + 1)
  const to = ymd(0)
  const v = { tag: ACCOUNT, from, to, fromT: `${from}T00:00:00Z`, toT: `${to}T23:59:59Z` }

  const d1 = await probe('d1', acc(`
    d1AnalyticsAdaptiveGroups(limit:10000, filter:{date_geq:$from, date_leq:$to}, orderBy:[date_ASC]){
      dimensions{ date databaseId }
      sum{ readQueries writeQueries rowsRead rowsWritten queryBatchResponseBytes }
    }`), v, (d) => (first(d, 'd1AnalyticsAdaptiveGroups') || []).map((g) => ({
      date: g.dimensions.date, id: g.dimensions.databaseId,
      rowsRead: Number(g.sum.rowsRead || 0), rowsWritten: Number(g.sum.rowsWritten || 0),
      readQueries: Number(g.sum.readQueries || 0), writeQueries: Number(g.sum.writeQueries || 0),
    })))

  // 요청 축은 Pages 와 Workers 가 **다른 데이터셋**이다. MES 는 Pages(Functions), barobill-cron 은 Worker.
  //   둘 다 같은 「요청」 요금에 합산되므로 **양쪽 다** 조회해서 더한다(하나만 보면 절반을 놓친다).
  const pages = await probe('pagesFunctions', acc(`
    pagesFunctionsInvocationsAdaptiveGroups(limit:10000, filter:{date_geq:$from, date_leq:$to}, orderBy:[date_ASC]){
      dimensions{ date scriptName }
      sum{ requests errors }
      quantiles{ cpuTimeP50 cpuTimeP99 }
    }`), v, (d) => (first(d, 'pagesFunctionsInvocationsAdaptiveGroups') || []).map((g) => ({
      date: g.dimensions.date, script: g.dimensions.scriptName || 'pages',
      requests: Number(g.sum.requests || 0), errors: Number(g.sum.errors || 0),
      cpuP50: Number((g.quantiles || {}).cpuTimeP50 || 0), cpuP99: Number((g.quantiles || {}).cpuTimeP99 || 0),
    })))

  const workers = await probe('workers', accT(`
    workersInvocationsAdaptive(limit:10000, filter:{datetime_geq:$fromT, datetime_leq:$toT}){
      dimensions{ scriptName datetimeHour }
      sum{ requests errors subrequests }
      quantiles{ cpuTimeP50 cpuTimeP99 }
    }`), v, (d) => (first(d, 'workersInvocationsAdaptive') || []).map((g) => ({
      date: String(g.dimensions.datetimeHour || '').slice(0, 10), script: g.dimensions.scriptName || 'worker',
      requests: Number(g.sum.requests || 0), errors: Number(g.sum.errors || 0),
      subrequests: Number(g.sum.subrequests || 0),
      cpuP50: Number((g.quantiles || {}).cpuTimeP50 || 0), cpuP99: Number((g.quantiles || {}).cpuTimeP99 || 0),
    })))

  const r2ops = await probe('r2Operations', acc(`
    r2OperationsAdaptiveGroups(limit:10000, filter:{date_geq:$from, date_leq:$to}, orderBy:[date_ASC]){
      dimensions{ date actionType }
      sum{ requests }
    }`), v, (d) => (first(d, 'r2OperationsAdaptiveGroups') || []).map((g) => ({
      date: g.dimensions.date, action: g.dimensions.actionType, requests: Number(g.sum.requests || 0),
    })))

  const r2storage = await probe('r2Storage', acc(`
    r2StorageAdaptiveGroups(limit:1000, filter:{date_geq:$from, date_leq:$to}, orderBy:[date_ASC]){
      dimensions{ date }
      max{ payloadSize metadataSize objectCount }
    }`), v, (d) => (first(d, 'r2StorageAdaptiveGroups') || []).map((g) => ({
      date: g.dimensions.date,
      bytes: Number((g.max || {}).payloadSize || 0) + Number((g.max || {}).metadataSize || 0),
      objects: Number((g.max || {}).objectCount || 0),
    })))

  return { from, to, probes: { d1, pages, workers, r2ops, r2storage } }
}

/** 축별 「이번 달 누적」을 포함량과 대조해 초과분 달러를 낸다. 청구 단위가 월이라 일 단위로는 판정할 수 없다. */
function estimate(monthly) {
  const over = (used, spec) => Math.max(0, used - spec.included) / spec.per * spec.price
  const lines = [
    { axis: 'Workers Paid 기본료', used: null, cost: PRICING.base },
    { axis: '요청(Pages+Workers)', used: monthly.requests, included: PRICING.requests.included, cost: over(monthly.requests, PRICING.requests) },
    { axis: 'D1 읽은 행', used: monthly.rowsRead, included: PRICING.d1RowsRead.included, cost: over(monthly.rowsRead, PRICING.d1RowsRead) },
    { axis: 'D1 쓴 행', used: monthly.rowsWritten, included: PRICING.d1RowsWritten.included, cost: over(monthly.rowsWritten, PRICING.d1RowsWritten) },
    { axis: 'R2 Class A', used: monthly.r2ClassA, included: PRICING.r2ClassA.included, cost: over(monthly.r2ClassA, PRICING.r2ClassA) },
    { axis: 'R2 Class B', used: monthly.r2ClassB, included: PRICING.r2ClassB.included, cost: over(monthly.r2ClassB, PRICING.r2ClassB) },
    { axis: 'R2 저장', used: monthly.r2Gb, included: PRICING.r2StorageGb.included, cost: Math.max(0, monthly.r2Gb - PRICING.r2StorageGb.included) * PRICING.r2StorageGb.price },
  ]
  return { lines, total: lines.reduce((s, l) => s + l.cost, 0) }
}

async function main() {
  if (!TOKEN || !ACCOUNT) {
    console.error(`${C.red}CF_ANALYTICS_TOKEN·CF_ACCOUNT_ID 가 없습니다.${C.reset}
  PowerShell:  $env:CF_ANALYTICS_TOKEN='...'; $env:CF_ACCOUNT_ID='...'; npm run audit:cf-usage
  토큰 권한 = Account / Account Analytics / Read (예산 감시와 같은 토큰)`)
    process.exit(2)
  }

  const { from, to, probes } = await collect()

  // 일자별 합산 — 축이 달라도 「같은 날」로 묶어야 사고 시점이 보인다.
  const byDate = new Map()
  const touch = (d) => { if (!byDate.has(d)) byDate.set(d, { date: d, rowsRead: 0, rowsWritten: 0, requests: 0, r2A: 0, r2B: 0 }); return byDate.get(d) }
  const CLASS_A = /^(Put|Post|Copy|List|Create|Delete|Complete|Upload)/i
  for (const r of probes.d1.rows) { const x = touch(r.date); x.rowsRead += r.rowsRead; x.rowsWritten += r.rowsWritten }
  for (const r of probes.pages.rows) { touch(r.date).requests += r.requests }
  for (const r of probes.workers.rows) { if (r.date) touch(r.date).requests += r.requests }
  for (const r of probes.r2ops.rows) { const x = touch(r.date); if (CLASS_A.test(r.action || '')) x.r2A += r.requests; else x.r2B += r.requests }

  const days = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))

  // 이번 달(1일~오늘) 누적 = 청구 기준. 조회 구간이 달을 걸치면 앞달분은 참고용으로만 쓴다.
  const thisMonth = to.slice(0, 7)
  const mtd = days.filter((d) => d.date.startsWith(thisMonth))
  const sum = (arr, k) => arr.reduce((s, x) => s + (x[k] || 0), 0)
  const lastR2 = probes.r2storage.rows[probes.r2storage.rows.length - 1]
  const monthly = {
    requests: sum(mtd, 'requests'), rowsRead: sum(mtd, 'rowsRead'), rowsWritten: sum(mtd, 'rowsWritten'),
    r2ClassA: sum(mtd, 'r2A'), r2ClassB: sum(mtd, 'r2B'),
    r2Gb: lastR2 ? lastR2.bytes / 1e9 : 0,
  }
  const est = estimate(monthly)

  // 월말 환산 — 남은 일수만큼 「지금 속도가 유지되면」 얼마가 되는가.
  const dayOfMonth = Number(to.slice(8, 10))
  const daysInMonth = new Date(Number(to.slice(0, 4)), Number(to.slice(5, 7)), 0).getDate()
  const scale = dayOfMonth > 0 ? daysInMonth / dayOfMonth : 1
  const projected = estimate({
    requests: monthly.requests * scale, rowsRead: monthly.rowsRead * scale, rowsWritten: monthly.rowsWritten * scale,
    r2ClassA: monthly.r2ClassA * scale, r2ClassB: monthly.r2ClassB * scale, r2Gb: monthly.r2Gb,
  })

  if (JSON_OUT) {
    console.log(JSON.stringify({ from, to, days, monthly, estimate: est, projected, probes: Object.fromEntries(Object.entries(probes).map(([k, p]) => [k, { ok: p.ok, error: p.error, rows: p.rows.length }])) }, null, 2))
    return
  }

  console.log(`\n${C.bold}Cloudflare 사용량 리포트${C.reset} ${C.dim}${from} ~ ${to} (계정 ${ACCOUNT.slice(0, 8)}…)${C.reset}\n`)

  for (const [key, p] of Object.entries(probes)) {
    if (!p.ok) console.log(`${C.yellow}⚠ ${key} 조회 실패 — ${p.error}${C.reset}`)
    else if (!p.rows.length) console.log(`${C.dim}· ${key}: 데이터 없음(해당 제품 미사용이거나 보존기간 밖)${C.reset}`)
  }

  console.log(`\n${C.bold}일자별${C.reset} ${C.dim}(요청 = Pages Functions + Workers)${C.reset}`)
  console.log('  날짜         D1 읽은 행      D1 쓴 행        요청          R2 A/B')
  for (const d of days) {
    const hot = d.rowsRead > 800_000_000 || d.requests > 8_000_000
    console.log(`  ${d.date}  ${(hot ? C.red : '')}${num(d.rowsRead).padStart(14)}${hot ? C.reset : ''}  ${num(d.rowsWritten).padStart(12)}  ${num(d.requests).padStart(11)}  ${num(d.r2A)}/${num(d.r2B)}`)
  }

  console.log(`\n${C.bold}이번 달 누적 (${thisMonth}, ${dayOfMonth}일차)${C.reset}`)
  console.log('  축                     사용량              무료 포함량          초과 요금(추정)')
  for (const l of est.lines) {
    const u = l.used == null ? '-' : num(Math.round(l.used))
    const inc = l.included == null ? '-' : num(l.included)
    const c = l.cost > 0.005 ? `${C.red}${usd(l.cost)}${C.reset}` : `${C.dim}${usd(l.cost)}${C.reset}`
    console.log(`  ${l.axis.padEnd(22)} ${u.padStart(18)}  ${inc.padStart(18)}  ${c}`)
  }
  console.log(`  ${C.bold}합계(이번 달 현재까지)${C.reset} ${usd(est.total)}   ${C.dim}→ 이 속도면 월말 ${usd(projected.total)}${C.reset}`)

  // 지배 축 — 「무엇을 고쳐야 하나」가 한 줄로 나와야 한다.
  const top = est.lines.filter((l) => l.axis !== 'Workers Paid 기본료').sort((a, b) => b.cost - a.cost)[0]
  if (top && top.cost > 0.5) {
    console.log(`\n${C.red}▶ 지배 축 = ${top.axis} (${usd(top.cost)})${C.reset} — 이 축을 만드는 엔드포인트부터 본다.`)
    if (/D1 읽은 행/.test(top.axis)) console.log(`  ${C.dim}진단: npm run audit:query-cost · npm run audit:subquery · 응답 rows_read · EXPLAIN QUERY PLAN${C.reset}`)
    if (/요청/.test(top.axis)) console.log(`  ${C.dim}진단: 폴링 주기(shell.js·cards/misc.js)·에이전트 재시도 루프(IA·LogWatcher)${C.reset}`)
  } else {
    console.log(`\n${C.green}▶ 초과 요금 지배 축 없음 — 기본료 ${usd(PRICING.base)} 외 유의미한 초과분이 없습니다.${C.reset}`)
  }
  console.log(`\n${C.dim}※ 달러는 추정입니다(정답 = 대시보드 Billing → Usage). 단가는 scripts/cf-usage-report.cjs PRICING 상수.${C.reset}\n`)
}

main().catch((e) => { console.error(`${C.red}실패: ${(e && e.message) || e}${C.reset}`); process.exit(1) })
