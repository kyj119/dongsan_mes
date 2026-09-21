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
  // 자금계획 통합 화면 — buildCashflowDays(무거운 하이브리드 엔진)를 한 요청에 2회 돌린다.
  // 응답에 달력 items + 90일 시계열이 실려 KB가 크다. 여기가 부풀면 계획 탭 진입이 통째로 느려진다.
  { path: '/api/cash-flow/schedule/overview',                name: 'cashSchedule.overview',   budgetMs: 2000, maxKB: 800 },
  // 생산 칸반 — 화면 1주기(60초)마다 이 4개가 연달아 나간다. 이 프로젝트에서 가장 자주 호출되는 경로인데
  // 2026-08 과금 사고(폴링 × 무거운 집계) 뒤에도 감사 밖에 있었다. limit=500 을 보내도 서버가 200 으로 자르지만
  // (safeLimit) 카드마다 card_items 조인 + order progress 집계가 80개 청크로 붙어 목록 API 중 읽기량이 가장 크다.
  // ⚠️ budgetMs·maxKB 는 아직 prod 실측이 아니라 추정치다 — `PROBE_URL=https://webapp-9i0.pages.dev npm run audit:query-cost -- --save`
  //    로 기준선을 뜬 뒤 실측의 3~5배로 조정할 것.
  { path: '/api/cards?kanban_column=rip_waiting&sort=delivery_asc&limit=500', name: 'cards.kanbanWaiting',  budgetMs: 2500, maxKB: 2000 },
  { path: '/api/cards?kanban_column=printing&sort=delivery_asc&limit=500',    name: 'cards.kanbanPrinting', budgetMs: 2500, maxKB: 2000 },
  { path: '/api/cards?kanban_column=print_done&exclude_order_status=SHIPPED&sort=delivery_asc&limit=500',
                                                             name: 'cards.kanbanDone',        budgetMs: 2500, maxKB: 2000 },
  { path: '/api/cards?status=HOLD&sort=delivery_asc&limit=500', name: 'cards.kanbanHold',      budgetMs: 2500, maxKB: 2000 },
  // 생산 일정 화면 — 60초 폴링 2연타.
  { path: '/api/cards/schedule/queues',                      name: 'cards.scheduleQueues',    budgetMs: 2000, maxKB: 1000 },
  { path: '/api/cards/schedule/unassigned',                  name: 'cards.scheduleUnassigned', budgetMs: 2000, maxKB: 1000 },

  // AI 배치 결과(#655 후속, 2026-09-21) — 여기는 「줄여야 할 낭비」가 아니라 **천장**이다.
  //   prod 실측: 기본 50건 = **1,122KB / 1,096ms**, from=1&to=200(189건) = **13,234KB / 5,647ms**.
  //   화면(`iaBatchTest.js`)이 그룹마다 썸네일을 실제로 그리므로 base64 를 안 보내면 화면이 빈다 —
  //   §「화면이 이 필드를 다 쓰는가」에 **쓴다**로 답이 나온 드문 경우다. 그래서 줄이지 않고 **재발만 막는다**:
  //   행당 ~22KB 가 늘어나면(그룹 수·썸네일 해상도) 여기가 먼저 빨개진다.
  //   ⚠️from/to 경로(13MB)는 일부러 **감사 대상에 안 넣었다** — 감사 한 번이 13MB 를 끌어온다.
  //   다시 볼 조건 = 이 화면이 운영 동선에 들어올 때(지금은 IA 배치 시험용 진단 화면이다).
  { path: '/api/ai-analysis/batch-results',                  name: 'aiAnalysis.batchRecent',  budgetMs: 3500, maxKB: 1600 },

  // ── 페이로드 회귀 감시 (2026-09-18 성능 감사) ─────────────────────────────
  //   이 셋은 **느려서가 아니라 커서** 문제였다. 응답시간은 셋 다 200ms 안쪽이라
  //   smoke·typecheck·journey 어디에도 안 걸렸고, 사람이 화면을 봐도 알 수 없었다.
  //   maxKB 가 이 감사에서 유일하게 그걸 잡는 눈금이다 — 값을 늘릴 때는 화면이 그걸 다 쓰는지 먼저 본다.
  //   ⚠️ 여기 budgetMs 는 prod 실측(2026-09-18)의 3~5배다. 기준선 갱신 = `--save`.
  // 재고 화면 — 로스율 숫자 하나 때문에 실사 상세 전량(357KB)을 받던 자리. 지금은 목록이 합계를 싣는다.
  { path: '/api/inventory-counts?limit=1&status=APPROVED&with_loss=1', name: 'inventoryCounts.lastWithLoss', budgetMs: 1000, maxKB: 20 },
  // 발주 화면 공급처 필터 — 활성 전량(2,890곳·218KB) → 발주 이력이 있는 123곳.
  { path: '/api/clients?fields=picker&limit=5000&active=1&has_po=1',   name: 'clients.supplierPicker',      budgetMs: 1000, maxKB: 40 },
  // 목록 도구모음 — 설정과 프리셋을 한 응답으로. 왕복이 2로 돌아가면 이 경로가 먼저 깨진다.
  { path: '/api/user-prefs?presets=orders',                            name: 'userPrefs.withPresets',       budgetMs: 800,  maxKB: 30 },
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
