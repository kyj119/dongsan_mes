#!/usr/bin/env node
/**
 * 쿼리 비용 감사 — 페이지 진입 시 실제로 호출되는 엔드포인트의 응답시간·페이로드 회귀 게이트
 *
 * 왜 필요한가 (2026-08-25):
 *   D1 은 데이터가 작아도 실행계획 하나가 어긋나면 조용히 수백 배 느려진다.
 *   실제로 /api/reports/client-revenue 는 주문 1만건짜리 DB 에서 rows_read 2,530만 / 15.9초였다.
 *   원인은 데이터량이 아니라 플래너가 조인키(client_id)를 버리고 다른 인덱스를 잡은 것.
 *   타입체크·smoke(200 응답 확인)로는 절대 안 잡힌다 — 느릴 뿐 정상 응답이기 때문이다.
 *
 * 사용법:
 *   node scripts/query-cost-audit.cjs                              # 로컬(:3000)
 *   PROBE_URL=https://webapp-9i0.pages.dev npm run audit:query-cost # prod
 *   node scripts/query-cost-audit.cjs --save                       # 현재 값을 기준선으로 저장
 *   node scripts/query-cost-audit.cjs --json
 *
 * 종료코드: 예산(budgetMs) 초과가 하나라도 있으면 1 → 훅/CI 게이트로 사용 가능
 *
 * ⚠️ 네트워크·콜드스타트 노이즈가 있으므로 각 엔드포인트를 2회 호출해 「빠른 쪽」을 쓴다.
 *    그래도 흔들리면 예산은 넉넉히 잡는다 — 이 게이트가 잡으려는 건 20% 저하가 아니라 자릿수 저하다.
 */
'use strict'
const fs = require('fs')
const path = require('path')

const BASE = (process.env.PROBE_URL || process.env.SMOKE_URL || 'http://localhost:3000').replace(/\/$/, '')
const USER = process.env.SMOKE_USER || 'admin'
const PASS = process.env.SMOKE_PASS || 'password'
const BASELINE = path.resolve(__dirname, 'query-cost-baseline.json')
const SAVE = process.argv.includes('--save')
const JSON_OUT = process.argv.includes('--json')

const now = new Date()
const yyyy = now.getFullYear()
const mm = String(now.getMonth() + 1).padStart(2, '0')

// 감시 대상 = 「페이지를 열면 자동으로 도는」 무거운 엔드포인트.
//   budgetMs 는 목표치가 아니라 경보선이다. prod 실측의 3~5배 정도로 잡아 자릿수 저하만 잡는다.
//   maxKB 는 전건 반환(페이징 누락) 회귀를 잡는다.
const TARGETS = [
  { path: '/api/reports/client-revenue?months=12',           name: 'reports.clientRevenue',   budgetMs: 1500, maxKB: 600 },
  { path: '/api/reports/receivables-analysis?months=6',      name: 'reports.receivables',     budgetMs: 1500, maxKB: 200 },
  { path: '/api/reports/monthly-summary?months=6',           name: 'reports.monthlySummary',  budgetMs: 1500, maxKB: 200 },
  { path: '/api/clients?limit=50',                           name: 'clients.list50',          budgetMs: 800,  maxKB: 200 },
  { path: '/api/clients?limit=200',                          name: 'clients.list200',         budgetMs: 1500, maxKB: 500 },
  { path: '/api/clients?search=%EA%B8%B0%ED%9A%8D&limit=20', name: 'clients.search',          budgetMs: 800,  maxKB: 100 },
  { path: '/api/clients?limit=50&dormant=90',                name: 'clients.dormant',         budgetMs: 1500, maxKB: 200 },
  { path: '/api/prices/price-overview',                      name: 'prices.overview',         budgetMs: 800,  maxKB: 400 },
  { path: '/api/dashboard/stats',                            name: 'dashboard.stats',         budgetMs: 800,  maxKB: 50 },
  { path: `/api/ledger/monthly-summary?month=${yyyy}-${mm}`, name: 'ledger.monthlySummary',   budgetMs: 1000, maxKB: 100 },
  { path: '/api/inventory/dashboard/zones',                  name: 'inventory.zones',         budgetMs: 1000, maxKB: 500 },
  { path: '/api/bom/overview',                               name: 'bom.overview',            budgetMs: 1000, maxKB: 300 },
]

const C = { reset: '\x1b[0m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', dim: '\x1b[2m', cyan: '\x1b[36m' }

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USER, password: PASS }),
  })
  const data = await res.json().catch(() => null)
  const token = data && data.data && data.data.token   // 토큰 경로 = data.data.token (smoke.cjs 와 동일)
  if (!token) throw new Error(`로그인 실패 (${res.status}) — ${BASE}`)
  return token
}

async function hit(token, target) {
  let best = null
  for (let i = 0; i < 2; i++) {
    const t0 = Date.now()
    let status = 0, kb = 0
    try {
      const res = await fetch(`${BASE}${target.path}`, { headers: { Authorization: `Bearer ${token}` } })
      status = res.status
      kb = Math.round((await res.arrayBuffer()).byteLength / 1024 * 10) / 10
    } catch (err) {
      status = -1
    }
    const ms = Date.now() - t0
    if (!best || ms < best.ms) best = { ms, status, kb }
  }
  return { ...target, ...best }
}

;(async () => {
  const token = await login()
  const results = []
  for (const t of TARGETS) results.push(await hit(token, t))

  if (SAVE) {
    const snapshot = Object.fromEntries(results.map(r => [r.name, { ms: r.ms, kb: r.kb }]))
    fs.writeFileSync(BASELINE, JSON.stringify({ base: BASE, at: new Date().toISOString(), snapshot }, null, 2))
    console.log(`${C.cyan}기준선 저장: ${BASELINE}${C.reset}`)
  }
  const baseline = (!SAVE && fs.existsSync(BASELINE)) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')).snapshot : null

  const fails = []
  if (JSON_OUT) {
    console.log(JSON.stringify(results, null, 2))
  } else {
    console.log(`${C.dim}Base: ${BASE}${C.reset}\n`)
    console.log('  ' + 'name'.padEnd(26) + 'ms'.padStart(7) + 'KB'.padStart(9) + '  vs 기준선')
    for (const r of results.slice().sort((a, b) => b.ms - a.ms)) {
      const overMs = r.status === 200 && r.ms > r.budgetMs
      const overKB = r.status === 200 && r.kb > r.maxKB
      const bad = overMs || overKB || (r.status !== 200 && r.status !== 404)
      if (bad) fails.push(r)
      const b = baseline && baseline[r.name]
      const delta = b && b.ms > 0 ? `${(r.ms / b.ms).toFixed(2)}x` : '-'
      const color = bad ? C.red : (b && r.ms > b.ms * 2 && r.ms - b.ms > 300 ? C.yellow : C.green)
      const note = overMs ? ` 예산 ${r.budgetMs}ms 초과` : overKB ? ` 페이로드 ${r.maxKB}KB 초과` : r.status !== 200 ? ` HTTP ${r.status}` : ''
      console.log(`  ${color}${r.name.padEnd(26)}${String(r.ms).padStart(7)}${String(r.kb).padStart(9)}  ${delta}${note}${C.reset}`)
    }
    console.log(`\n${fails.length ? C.red + 'FAIL ' + fails.length + '건' : C.green + '통과 ' + results.length + '/' + results.length}${C.reset}`)
  }
  process.exit(fails.length ? 1 : 0)
})().catch(err => {
  console.error(`${C.red}${err.message}${C.reset}`)
  process.exit(2)
})
