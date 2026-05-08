#!/usr/bin/env node
/**
 * smoke.cjs — 동산현수막 ERP+MES API 스모크 테스트
 *
 * 목적:
 *  - 주요 GET 엔드포인트의 라우팅/컬럼명/권한/JOIN 오류를 빠르게 감지한다.
 *  - 코드 수정 후 `npm run build && npm run dev:d1` 이 떠 있는 상태에서
 *    `npm run smoke` 한 방으로 깨진 라우트를 찾아낼 수 있도록 한다.
 *
 * 사용법:
 *   npm run smoke                                # http://localhost:3000 대상
 *   SMOKE_USER=admin SMOKE_PASS=password npm run smoke
 *   SMOKE_URL=https://staging.example.com npm run smoke
 *
 * 환경 변수:
 *   SMOKE_URL   기본 http://localhost:3000
 *   SMOKE_USER  기본 admin
 *   SMOKE_PASS  기본 1234
 *   SMOKE_CONCURRENCY 기본 8
 *
 * 종료 코드:
 *   0 — 모든 테스트 PASS
 *   1 — 1건 이상 FAIL 또는 로그인 실패
 *
 * 주의:
 *  - 쓰기 요청(POST/PUT/DELETE/PATCH)은 포함하지 않는다. 읽기 전용.
 *  - 쿼리 파라미터는 각 엔드포인트의 "가장 일반적인 호출"을 가정한다.
 *  - 엔드포인트 추가/삭제는 하단 ENDPOINTS 배열만 수정하면 된다.
 */

const BASE = (process.env.SMOKE_URL || 'http://localhost:3000').replace(/\/$/, '')
const USER = process.env.SMOKE_USER || 'admin'
const PASS = process.env.SMOKE_PASS || 'password'
const CONCURRENCY = parseInt(process.env.SMOKE_CONCURRENCY || '8', 10)

// 현재 월/연도 (쿼리 파라미터용)
const now = new Date()
const yyyy = now.getFullYear()
const mm = String(now.getMonth() + 1).padStart(2, '0')
const THIS_MONTH = `${yyyy}-${mm}`
const TODAY = `${yyyy}-${mm}-${String(now.getDate()).padStart(2, '0')}`
const FIRST_OF_MONTH = `${yyyy}-${mm}-01`

// 테스트할 엔드포인트
// path: 요청 경로 (베이스 URL 제외)
// name: 리포트에 표시할 이름
// allow404: true면 404도 PASS로 간주 (데이터 없을 때 404 내는 엔드포인트)
// allow401: true면 401도 PASS로 간주 (관리자 전용에 MANAGER 계정 쓸 때)
const ENDPOINTS = [
  // 인증/공통
  { path: '/api/auth/me', name: 'auth.me' },
  { path: '/api/auth/entities', name: 'auth.entities' },

  // 대시보드
  { path: '/api/dashboard/stats', name: 'dashboard.stats' },
  { path: '/api/dashboard/stats/daily', name: 'dashboard.daily' },
  { path: '/api/dashboard/stats/monthly', name: 'dashboard.monthly' },

  // 주문/생산
  { path: '/api/orders?limit=10', name: 'orders.list' },
  { path: '/api/cards', name: 'cards.list' },
  { path: '/api/production/logs?limit=10', name: 'production.logs' },
  { path: '/api/production/stats', name: 'production.stats' },
  { path: '/api/shipments?limit=10', name: 'shipments.list' },
  { path: '/api/print-events?limit=10', name: 'printEvents.list' },

  // 기준정보
  { path: '/api/clients?limit=10', name: 'clients.list' },
  { path: '/api/items?limit=10', name: 'items.list' },
  { path: '/api/price-lists', name: 'priceLists.list' },

  // 재무/경리
  { path: `/api/ledger/monthly-summary?month=${THIS_MONTH}`, name: 'ledger.monthly' },
  { path: '/api/ledger/payments?limit=10', name: 'ledger.payments' },
  { path: `/api/tax-invoices?from=${FIRST_OF_MONTH}&to=${TODAY}`, name: 'taxInvoices.range' },
  { path: '/api/cash-receipts?limit=10', name: 'cashReceipts.list' },
  { path: '/api/bank/transactions?limit=10', name: 'bank.txs' },
  { path: '/api/cash-flow/summary', name: 'cashFlow.summary' },
  { path: '/api/cash-flow/fixed-expenses', name: 'cashFlow.fixedExpenses' },
  { path: `/api/cash-flow/schedule?from=${FIRST_OF_MONTH}&to=${TODAY}`, name: 'cashSchedule.range' },
  { path: '/api/vat/summary', name: 'vat.summary' },
  { path: '/api/vat/reports', name: 'vat.reports' },
  { path: '/api/payment-requests?limit=10', name: 'paymentRequests.list' },
  { path: `/api/financial/pnl?from=${FIRST_OF_MONTH}&to=${TODAY}`, name: 'financial.pnl' },
  { path: `/api/financial/pnl/monthly?year=${yyyy}`, name: 'financial.pnlMonthly' },

  // 구매/재고
  { path: '/api/purchase-orders?limit=10', name: 'purchaseOrders.list' },
  { path: '/api/purchase-requests?limit=10', name: 'purchaseRequests.list' },
  { path: '/api/inventory', name: 'inventory.list' },

  // 인사/급여
  { path: '/api/hr/employees', name: 'hr.employees' },
  { path: '/api/hr/stats', name: 'hr.stats' },
  { path: `/api/hr/attendances?date=${new Date().toISOString().slice(0,10)}`, name: 'hr.attendances' },
  { path: `/api/attendance/month?month=${THIS_MONTH}`, name: 'attendance.month' },
  { path: `/api/payroll?period=${THIS_MONTH}`, name: 'payroll.month' },
  { path: `/api/payroll/rates/${yyyy}`, name: 'payroll.rates' },
  { path: `/api/payroll/tax-table/${yyyy}`, name: 'payroll.taxTable' },
  { path: `/api/payroll/tax-agent/changes?period=${THIS_MONTH}`, name: 'payroll.taxAgentChanges' },
  { path: `/api/payroll/tax-agent/payroll?period=${THIS_MONTH}`, name: 'payroll.taxAgentPayroll' },
  { path: `/api/payroll/tax-agent/annual?year=${yyyy}`, name: 'payroll.taxAgentAnnual' },
  { path: `/api/payroll/tax-agent/roster?status=active`, name: 'payroll.taxAgentRoster' },
  { path: `/api/leaves/balances?year=${yyyy}`, name: 'leaves.balances' },
  { path: '/api/leaves/requests?limit=10', name: 'leaves.requests' },

  // 리포트/분석
  { path: `/api/reports/monthly-summary?month=${THIS_MONTH}`, name: 'reports.monthly' },
  { path: '/api/reports/client-revenue', name: 'reports.clientRevenue' },
  { path: `/api/production-reports/production?from=${FIRST_OF_MONTH}&to=${TODAY}`, name: 'productionReports.production' },
  { path: `/api/production-reports/uptime?from=${FIRST_OF_MONTH}&to=${TODAY}`, name: 'productionReports.uptime' },

  // 관리
  { path: '/api/users', name: 'users.list' },
  { path: '/api/settings', name: 'settings.list' },
  { path: '/api/notifications?limit=10', name: 'notifications.list' },
  { path: '/api/activity-logs?limit=10', name: 'activityLogs.list' },
  { path: '/api/approvals?limit=10', name: 'approvals.list' },

  // 출력방식/소재
  { path: '/api/print-system/methods', name: 'printSystem.methods' },
  { path: '/api/print-system/media', name: 'printSystem.media' },

  // 출고 대시보드
  { path: '/api/shipments/dashboard/counts', name: 'shipments.dashboardCounts' },
  { path: '/api/shipments/dashboard', name: 'shipments.dashboard' },

  // 검수
  { path: '/api/inspections/templates', name: 'inspections.templates' },
  { path: '/api/inspections/results', name: 'inspections.results' },
  { path: '/api/inventory/receipts/inspection-counts', name: 'inventory.inspectionCounts' },
  { path: '/api/inventory/receipts/pending-review', name: 'inventory.pendingReview' },
]

const COLOR = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
}

function log(msg) { process.stdout.write(msg + '\n') }
function warn(msg) { process.stderr.write(msg + '\n') }

async function login() {
  const url = `${BASE}/api/auth/login`
  let res
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: USER, password: PASS }),
    })
  } catch (err) {
    throw new Error(`로그인 요청 실패(연결 불가): ${err.message}. 서버가 ${BASE}에서 떠 있는지 확인하세요.`)
  }
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { data = null }
  if (!res.ok || !data || !data.success || !data.data || !data.data.token) {
    throw new Error(`로그인 실패 ${res.status}: ${text.slice(0, 200)}`)
  }
  return data.data.token
}

async function hit(token, ep) {
  const url = `${BASE}${ep.path}`
  const t0 = Date.now()
  let res, text = ''
  try {
    res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    })
    text = await res.text()
  } catch (err) {
    return { ep, ok: false, status: 0, ms: Date.now() - t0, error: err.message, body: '' }
  }
  const ms = Date.now() - t0

  // 응답 본문 파싱 시도
  let data = null
  try { data = JSON.parse(text) } catch { /* 비 JSON 응답 */ }

  // PASS 조건
  //   1) HTTP 200 + success !== false
  //   2) 200이 아닌데 allow404/allow401 플래그가 허용하는 경우
  let ok = false
  if (res.status === 200) {
    ok = !data || data.success !== false
  } else if (res.status === 404 && ep.allow404) {
    ok = true
  } else if (res.status === 401 && ep.allow401) {
    ok = true
  }

  return {
    ep,
    ok,
    status: res.status,
    ms,
    body: text.slice(0, 300),
    success: data?.success,
    errorMsg: data?.error || data?.message || data?.detail || '',
  }
}

async function runBatch(token, endpoints) {
  const results = []
  let idx = 0
  const workers = new Array(CONCURRENCY).fill(0).map(async () => {
    while (idx < endpoints.length) {
      const i = idx++
      const r = await hit(token, endpoints[i])
      results[i] = r
    }
  })
  await Promise.all(workers)
  return results
}

function printResults(results) {
  let pass = 0, fail = 0
  const fails = []
  const sorted = results.map((r, i) => ({ ...r, i })).sort((a, b) => b.ms - a.ms)

  log('')
  log(`${COLOR.bold}=== SMOKE TEST RESULTS ===${COLOR.reset}`)
  log(`${COLOR.dim}Base: ${BASE}  User: ${USER}  Endpoints: ${results.length}${COLOR.reset}`)
  log('')

  for (const r of results) {
    const status = r.ok
      ? `${COLOR.green}PASS${COLOR.reset}`
      : `${COLOR.red}FAIL${COLOR.reset}`
    const code = r.status === 0 ? 'ERR' : String(r.status)
    const ms = String(r.ms).padStart(5)
    const name = r.ep.name.padEnd(32)
    log(`  ${status}  ${code.padStart(3)}  ${ms}ms  ${name}  ${COLOR.dim}${r.ep.path}${COLOR.reset}`)
    if (r.ok) pass++
    else { fail++; fails.push(r) }
  }

  log('')
  if (fails.length > 0) {
    log(`${COLOR.red}${COLOR.bold}실패 상세${COLOR.reset}`)
    for (const r of fails) {
      log(`  ${COLOR.red}✗${COLOR.reset} ${r.ep.name}  ${COLOR.dim}(${r.ep.path})${COLOR.reset}`)
      log(`    status: ${r.status}${r.error ? '  error: ' + r.error : ''}`)
      if (r.errorMsg) log(`    error:  ${r.errorMsg}`)
      if (r.body) log(`    body:   ${COLOR.dim}${r.body.replace(/\n/g, ' ').slice(0, 200)}${COLOR.reset}`)
    }
    log('')
  }

  // 느린 엔드포인트 상위 3개
  const slow = sorted.slice(0, 3).filter(r => r.ms > 500)
  if (slow.length > 0) {
    log(`${COLOR.yellow}느린 엔드포인트 (>500ms)${COLOR.reset}`)
    for (const r of slow) {
      log(`  ${String(r.ms).padStart(5)}ms  ${r.ep.name}  ${COLOR.dim}${r.ep.path}${COLOR.reset}`)
    }
    log('')
  }

  const summary = fail === 0
    ? `${COLOR.green}${COLOR.bold}PASS ${pass} / ${results.length}${COLOR.reset}`
    : `${COLOR.red}${COLOR.bold}FAIL ${fail} / ${results.length}${COLOR.reset}  (PASS ${pass})`
  log(`요약: ${summary}`)
  log('')
  return fail === 0
}

async function main() {
  log(`${COLOR.cyan}▶ 로그인 시도: ${BASE} (user=${USER})${COLOR.reset}`)
  let token
  try {
    token = await login()
  } catch (err) {
    warn(`${COLOR.red}✗ ${err.message}${COLOR.reset}`)
    warn('')
    warn('힌트:')
    warn('  1) 서버가 떠 있는지 확인: curl ' + BASE + '/api/auth/me')
    warn('  2) 계정 확인: SMOKE_USER=xxx SMOKE_PASS=yyy npm run smoke')
    warn('  3) 포트 확인: SMOKE_URL=http://localhost:8787 npm run smoke')
    process.exit(1)
  }
  log(`${COLOR.green}✓ 로그인 성공${COLOR.reset}`)

  log(`${COLOR.cyan}▶ ${ENDPOINTS.length}개 엔드포인트 호출 (동시 ${CONCURRENCY})${COLOR.reset}`)
  const t0 = Date.now()
  const results = await runBatch(token, ENDPOINTS)
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
  log(`${COLOR.dim}완료: ${elapsed}s${COLOR.reset}`)

  const allPass = printResults(results)
  process.exit(allPass ? 0 : 1)
}

main().catch(err => {
  warn(`${COLOR.red}치명적 오류: ${err.stack || err.message}${COLOR.reset}`)
  process.exit(1)
})
