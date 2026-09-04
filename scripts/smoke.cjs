#!/usr/bin/env node
/**
 * smoke.cjs — 동산기획 ERP+MES API 스모크 테스트
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
  { path: '/api/dashboard/stats/receivables', name: 'dashboard.receivables' },
  { path: '/api/dashboard/stats/today-due', name: 'dashboard.todayDue' },
  { path: '/api/dashboard/overdue-pos', name: 'dashboard.overduePOs' },
  { path: '/api/dashboard/low-stock', name: 'dashboard.lowStock' },

  // 주문/생산
  { path: '/api/orders?limit=10', name: 'orders.list' },
  { path: '/api/quotations?limit=5', name: 'quotations.list' },
  { path: '/api/cards', name: 'cards.list' },
  // 작업지시서 발행 현황판 (2026-08-05 work-order-auto-issue)
  { path: '/api/cards/issue-status', name: 'cards.issueStatus' },
  // 작업지시서 슬라이드 이전/다음 (2026-08-19 #26) — allow404: 카드 행 부재 허용, SQL 오류 500만 FAIL
  { path: '/api/cards/1/neighbors', name: 'cards.neighbors', allow404: true },
  { path: '/api/production/logs?limit=10', name: 'production.logs' },
  { path: '/api/production/stats', name: 'production.stats' },
  { path: '/api/shipments?limit=10', name: 'shipments.list' },
  { path: '/api/print-events?limit=10', name: 'printEvents.list' },
  // 출력파일↔카드 연결 (전사 등 파일명에 주문번호가 없는 공정)
  // days=90 = 화면(#linkDays) 기본값. 30일만 보면 구형식 nest_members 로 인한 500 을 놓친다(2026-08-25).
  { path: '/api/print-events/unmatched?days=90', name: 'printEvents.unmatched' },
  { path: '/api/print-events/link-candidates?file_name=smoke(10-10).eps', name: 'printEvents.linkCandidates' },
  // agents — 명시 컬럼리스트 SELECT(kit_version/parser_type, 0545 신규 ADD COLUMN 참조)라
  // printEvents.list(집계)가 못 잡는 no-such-column 드리프트를 500으로 노출(#484 패턴).
  { path: '/api/print-events/agents', name: 'printEvents.agents' },

  // 견적서
  { path: '/api/quotations?limit=5', name: 'quotations.list' },

  // 기준정보
  { path: '/api/clients?limit=10', name: 'clients.list' },
  // 배치(Z: 스캐너)가 이름 해소에 쓰는 경량 전량 인덱스 — 목록 라우트 15페이지 긁기를 대체.
  { path: '/api/clients/name-index', name: 'clients.nameIndex' },
  { path: '/api/items?limit=10', name: 'items.list' },
  // items.detail — 명시 컬럼리스트 SELECT(image_key 등 신규 ADD COLUMN 참조)라 items.list(GROUP BY 집계)가 못 잡는
  // no-such-column 드리프트를 500으로 노출(#484). allow404=행 부재 허용, 컬럼 미존재 500은 FAIL로 격리.
  { path: '/api/items/1', name: 'items.detail', allow404: true },
  { path: '/api/price-lists', name: 'priceLists.list' },
  { path: '/api/prices?item_id=1&client_id=1&context=sales', name: 'prices.lookup', allow404: true },
  { path: '/api/bom/overview', name: 'bom.overview' },
  { path: '/api/facility/zones', name: 'facility.zones' },
  { path: '/api/storage-zones', name: 'storageZones.list' },

  // 재무/경리
  { path: `/api/ledger/monthly-summary?month=${THIS_MONTH}`, name: 'ledger.monthly' },
  { path: '/api/ledger/payments?limit=10', name: 'ledger.payments' },
  { path: `/api/tax-invoices?from=${FIRST_OF_MONTH}&to=${TODAY}`, name: 'taxInvoices.range' },
  { path: '/api/hometax-invoices?limit=10', name: 'hometaxInvoices.list' },
  { path: '/api/cash-receipts?limit=10', name: 'cashReceipts.list' },
  { path: '/api/bank/transactions?limit=10', name: 'bank.txs' },
  { path: '/api/cash-flow/summary', name: 'cashFlow.summary' },
  { path: '/api/cash-flow/fixed-expenses', name: 'cashFlow.fixedExpenses' },
  { path: `/api/cash-flow/schedule?from=${FIRST_OF_MONTH}&to=${TODAY}`, name: 'cashSchedule.range' },
  { path: '/api/cash-flow/schedule/overview', name: 'cashSchedule.overview' },
  { path: '/api/vat/summary', name: 'vat.summary' },
  { path: '/api/vat/reports', name: 'vat.reports' },
  { path: '/api/payment-requests?limit=10', name: 'paymentRequests.list' },
  { path: `/api/financial/pnl?from=${FIRST_OF_MONTH}&to=${TODAY}`, name: 'financial.pnl' },
  { path: `/api/financial/pnl/monthly?year=${yyyy}`, name: 'financial.pnlMonthly' },
  { path: '/api/financial/balance-snapshot', name: 'financial.balanceSnapshot' },
  { path: `/api/financial/export/csv?type=pnl&from=${FIRST_OF_MONTH}&to=${TODAY}`, name: 'financial.exportCsv' },
  { path: `/api/insurance-reports?year=${yyyy}`, name: 'insuranceReports.list' },
  { path: `/api/insurance-reports/annual-summary?year=${yyyy}`, name: 'insuranceReports.annualSummary' },
  { path: '/api/insurance-reports/1', name: 'insuranceReports.detail', allow404: true },

  // 구매/재고
  { path: '/api/purchase-orders?limit=10', name: 'purchaseOrders.list' },
  { path: '/api/purchase-requests?limit=10', name: 'purchaseRequests.list' },
  { path: '/api/inventory', name: 'inventory.list' },
  { path: '/api/inventory/transactions?limit=5', name: 'inventory.transactions' },
  { path: '/api/inventory-counts', name: 'inventoryCount.list' },
  { path: '/api/inventory-counts/1', name: 'inventoryCount.detail', allow404: true },
  // ★`/:id` 보다 먼저 등록돼야 하는 경로 — 순서가 뒤집히면 'consumption' 이 id 로 파싱돼 조용히 빈 응답이 된다
  { path: '/api/inventory-counts/consumption?zone_id=1', name: 'inventoryCount.consumption' },
  { path: '/api/inventory-valuation/report', name: 'inventoryValuation.report' },

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
  { path: '/api/reports/sales-rep-stats?months=6', name: 'reports.salesRepStats' },
  { path: '/api/reports/entity-attribution-audit?months=12', name: 'reports.entityAttributionAudit' },
  { path: `/api/production-reports/production?from=${FIRST_OF_MONTH}&to=${TODAY}`, name: 'productionReports.production' },
  { path: `/api/production-reports/uptime?from=${FIRST_OF_MONTH}&to=${TODAY}`, name: 'productionReports.uptime' },
  { path: `/api/production-reports/daily-summary?from=${FIRST_OF_MONTH}&to=${TODAY}`, name: 'productionReports.daily' },
  { path: `/api/production-reports/post-processing?from=${FIRST_OF_MONTH}&to=${TODAY}`, name: 'productionReports.postProc' },

  // 예측/분석
  { path: '/api/forecast/order-forecast', name: 'forecast.order' },
  { path: '/api/forecast/capacity-analysis', name: 'forecast.capacity' },
  { path: '/api/forecast/client-forecast', name: 'forecast.client' },
  { path: '/api/costs', name: 'costs.list' },

  // OEE / 설비종합효율
  { path: '/api/oee/daily', name: 'oee.daily' },
  { path: '/api/oee/trend', name: 'oee.trend' },
  { path: '/api/oee/summary', name: 'oee.summary' },

  // 클레임 / 고객 불량
  { path: '/api/claims/defect-codes', name: 'claims.defectCodes' },
  { path: '/api/claims?limit=10', name: 'claims.list' },
  { path: '/api/claims/analytics', name: 'claims.analytics' },

  // 관리
  { path: '/api/users', name: 'users.list' },
  { path: '/api/settings', name: 'settings.list' },
  { path: '/api/settings/credit-policy', name: 'settings.creditPolicy' },
  { path: '/api/search?q=test', name: 'search.query' },
  { path: '/api/notifications?limit=10', name: 'notifications.list' },
  { path: '/api/notifications/unread-count', name: 'notifications.unreadCount' },
  { path: '/api/notifications/nav-badges', name: 'notifications.navBadges' },
  { path: '/api/permissions/me', name: 'permissions.me' },
  { path: '/api/permissions/pages', name: 'permissions.pages' },
  { path: '/api/messages/logs', name: 'messages.logs' },
  // 광고성 발송 가드(§50) — ADMIN 전용. smoke는 admin 계정이라 200을 기대한다.
  { path: '/api/messages/ad/banned-words', name: 'messagesAd.bannedWords' },
  { path: '/api/messages/ad/opt-outs', name: 'messagesAd.optOuts' },
  { path: '/api/tasks?limit=10', name: 'tasks.list' },
  { path: '/api/activity-logs?limit=10', name: 'activityLogs.list' },
  { path: '/api/approvals?limit=10', name: 'approvals.list' },

  // RIP (출력방식/소재 print-system 제거됨 — 단순 구조 모델)
  { path: '/api/rip/equipment', name: 'rip.equipment' },
  { path: '/api/search?q=test', name: 'search.global' },

  // 은행
  { path: '/api/bank/accounts', name: 'bank.accounts' },
  { path: '/api/bank/recurring-candidates?from=20260101', name: 'bank.recurringCandidates' },

  // 출고 대시보드
  { path: '/api/shipments/dashboard/counts', name: 'shipments.dashboardCounts' },
  { path: '/api/shipments/dashboard', name: 'shipments.dashboard' },
  { path: '/api/shipments/pack-search?q=001', name: 'shipments.packSearch' },   // 출고검수 주문 찾기(읽기전용)

  // 검수
  { path: '/api/inspections/templates', name: 'inspections.templates' },
  { path: '/api/inspections/results', name: 'inspections.results' },
  { path: '/api/inventory/receipts/inspection-counts', name: 'inventory.inspectionCounts' },
  { path: '/api/inventory/receipts/pending-review', name: 'inventory.pendingReview' },
  // 주간 발주
  { path: '/api/weekly-purchase/analyze', name: 'weeklyPurchase.analyze' },
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
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }

// #374: 막 배포된 worker는 cold-start D1로 login이 일시 5xx/연결오류를 낼 수 있음.
//   5xx·연결오류에 한해 bounded 재시도(backoff 1.5s·3s). 4xx(인증실패)·성공은 즉시 종료 → 진짜 장애는 여전히 잡힘.
async function login() {
  const url = `${BASE}/api/auth/login`
  const MAX = 3
  for (let attempt = 1; attempt <= MAX; attempt++) {
    let res
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: USER, password: PASS }),
      })
    } catch (err) {
      if (attempt < MAX) { warn(`  로그인 연결 실패(${attempt}/${MAX}) — cold-start 추정, ${attempt * 1.5}s 후 재시도`); await sleep(attempt * 1500); continue }
      throw new Error(`로그인 요청 실패(연결 불가): ${err.message}. 서버가 ${BASE}에서 떠 있는지 확인하세요.`)
    }
    if (res.status >= 500 && attempt < MAX) {
      warn(`  로그인 ${res.status}(${attempt}/${MAX}) — cold-start transient 추정, ${attempt * 1.5}s 후 재시도`)
      await sleep(attempt * 1500)
      continue
    }
    const text = await res.text()
    let data
    try { data = JSON.parse(text) } catch { data = null }
    if (!res.ok || !data || !data.success || !data.data || !data.data.token) {
      throw new Error(`로그인 실패 ${res.status}: ${text.slice(0, 200)}`)
    }
    return data.data.token
  }
  throw new Error('로그인 실패: 재시도 횟수 초과')
}

// #382: 프론트 부트스트랩 게이트 — API가 200이어도 셸 스크립트 MIME 거부 시 전 페이지 무한로딩.
//   인증 레이아웃 페이지(/dashboard) = 200 + text/html + (인라인 셸 마커 switchEntity) 또는
//   외부 <script src> 셸 스크립트의 실행가능 JS MIME 검증. (로그인 '/'은 셸 미포함이라 부적합)
//   06-10 shell.js 2회 prod 다운이 deploy smoke를 그냥 통과했던 갭을 메움.
async function checkFrontBootstrap() {
  const path = '/dashboard'  // 셸이 인라인되는 인증 레이아웃 페이지(워커가 무인증에도 HTML 서빙, 클라 JS가 게이트)
  const url = `${BASE}${path}`
  let res, html = ''
  try {
    res = await fetch(url, { headers: { Accept: 'text/html' } })
    html = await res.text()
  } catch (err) {
    return { ok: false, detail: `'${path}' 요청 실패: ${err.message}` }
  }
  const ct = res.headers.get('content-type') || ''
  if (res.status !== 200 || !/text\/html/i.test(ct)) {
    return { ok: false, detail: `'${path}' status=${res.status} content-type='${ct}' (200 text/html 기대)` }
  }
  if (/switchEntity/.test(html)) return { ok: true, detail: '인라인 셸 마커(switchEntity) 확인' }
  // 외부 셸 스크립트 참조 시 그 스크립트의 MIME 검증 (재외부화 시 MIME 거부 클래스 탐지)
  const m = html.match(/<script[^>]+src=["']([^"']*shell[^"']*\.js)["']/i) || html.match(/<script[^>]+src=["'](\/static\/[^"']+\.js)["']/i)
  if (m) {
    const ref = m[1]
    const sUrl = ref.startsWith('http') ? ref : `${BASE}${ref.startsWith('/') ? '' : '/'}${ref}`
    let sres
    try { sres = await fetch(sUrl) } catch (err) { return { ok: false, detail: `셸 스크립트 fetch 실패: ${err.message}` } }
    const sct = sres.headers.get('content-type') || ''
    if (sres.status !== 200 || !/(text|application)\/(java|ecma)script/i.test(sct)) {
      return { ok: false, detail: `셸 스크립트 ${sUrl} status=${sres.status} content-type='${sct}' (실행가능 JS MIME 기대 — MIME 거부 클래스)` }
    }
    return { ok: true, detail: `외부 셸 스크립트 MIME 정상(${sct})` }
  }
  return { ok: false, detail: '인라인 셸 마커도 외부 셸 스크립트도 없음 — 부트스트랩 누락 의심' }
}

// ── 단건 상세 프로브 (2026-09-04) ────────────────────────────────────────────
// 이 스모크는 **목록만** 때리고 있었다. 라우트는 `GET /:id` 를 24개 정의하는데 목록에
// 올라온 단건은 5개뿐이었고, 그래서 `GET /api/purchase-orders/:id` 가 **전 법인 500** 인
// 채로 통과했다(수취구역 SQL 이 `po.entity_id` 를 보는데 그 쿼리에만 조인이 빠져 있었다).
// 무음 catch 가 로그도 안 남겨 「목록 200」 뒤에서 조용히 죽어 있었다.
//
// ★ 대상을 손으로 나열하지 않는다 — 목록 응답의 첫 행 id 를 뽑아 `<컬렉션>/<id>` 를 자동으로
//   때린다. 라우트가 늘어도 ENDPOINTS 에 목록 하나만 있으면 상세가 따라온다.
//   (손목록은 이 프로젝트에서 같은 사고를 세 번 냈다 — `ia:deploy` 배포 대상 전례.)

/** 목록 응답에서 행 배열을 찾는다. 봉투 모양이 라우터마다 다르다 —
 *  `data` 가 배열이기도 하고(`orders`), `data.items`/`data.rows` 이기도 하고,
 *  `data.clients` 처럼 **자원 이름을 키로 쓰기도** 한다(그래서 키를 고정하면 놓친다). */
function rowsOf(data) {
  if (!data || data.success === false) return null
  const d = data.data
  if (Array.isArray(d)) return d
  if (!d || typeof d !== 'object') return null
  if (Array.isArray(d.items)) return d.items
  if (Array.isArray(d.rows)) return d.rows
  if (Array.isArray(d.list)) return d.list
  for (const k of Object.keys(d)) if (Array.isArray(d[k])) return d[k]
  return null
}

/** 목록 응답에서 첫 행의 숫자 id. 행이 없거나 id 가 없으면 null(=프로브 안 함). */
function firstRowId(data) {
  const arr = rowsOf(data)
  if (!arr || arr.length === 0) return null
  const row = arr[0]
  if (!row || typeof row !== 'object') return null
  // 발주는 목록에서 id, 생성 응답에서 po_id 로 준다 — 라우터마다 응답 계약이 다르다.
  const id = row.id != null ? row.id : (row.po_id != null ? row.po_id : null)
  return (typeof id === 'number' && Number.isInteger(id) && id > 0) ? id : null
}

// `/api/orders?limit=10` -> `/api/orders`. 하위 경로(`/api/cards/issue-status`)는 제외한다.
const COLLECTION_RE = new RegExp('^/api/[a-z0-9-]+$', 'i')

function collectionBase(path) {
  let p = path.split('?')[0]
  while (p.endsWith('/')) p = p.slice(0, -1)
  return COLLECTION_RE.test(p) ? p : null
}

/** 1차 배치 결과에서 상세 프로브를 만든다 — 컬렉션당 1개. */
function buildDetailProbes(results) {
  const seen = new Set()
  const probes = []
  for (const r of results) {
    if (!r.ok || !r.firstId) continue
    const base = collectionBase(r.ep.path)
    if (!base || seen.has(base)) continue
    seen.add(base)
    probes.push({
      path: base + '/' + r.firstId,
      name: r.ep.name.split('.')[0] + '.detail',
      detailProbe: true,
    })
  }
  return probes
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
  } else if (ep.detailProbe && (res.status === 401 || res.status === 403 || res.status === 404)) {
    // 상세 프로브는 **목록에서 뽑은 id** 를 그대로 때린다. 권한·가시성 필터로 안 보이거나
    //   그 라우터에 단건 라우트가 아예 없으면 401/403/404 다 — 그건 결함이 아니다.
    //   이 프로브가 잡으려는 것은 오직 **5xx**(컬럼·별칭·조인이 깨진 쿼리)다.
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
    firstId: firstRowId(data),
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
  // 대상 URL 을 **요약 줄에도** 박는다 — 배포 후에는 tail 만 보게 되는데,
  //   로컬 dev 서버가 떠 있으면 `npm run smoke` 가 조용히 localhost 를 통과시킨다(기본값이 localhost:3000).
  //   시작 줄에도 있지만 그건 잘려 나간다. 「112/112」 라는 숫자만으로는 무엇을 쟀는지 알 수 없다.
  log(`요약: ${summary}   ${COLOR.cyan}대상 ${BASE}${COLOR.reset}`)
  log('')
  return fail === 0
}

async function main() {
  log(`${COLOR.cyan}▶ 로그인 시도: ${BASE} (user=${USER})${COLOR.reset}`)
  // #400: 게이트 로그인 전 경량 워밍업 핑 — 갓 배포된 worker의 D1 cold-start 비용을 흡수.
  //   실패는 무시(게이트 아님). login()의 5xx 관용도(진짜 장애 탐지)는 불변 → 배포 직후 깊은 cold-start false-fail만 완화.
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(`${BASE}/api/auth/me`); if (r.status < 500) break } catch {}
    await sleep(2000)
  }
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

  // #382: 프론트 부트스트랩 게이트 (API 200 + 셸 정상 둘 다 통과해야 배포 green)
  log(`${COLOR.cyan}▶ 프론트 부트스트랩 검증: ${BASE}/${COLOR.reset}`)
  const front = await checkFrontBootstrap()
  if (front.ok) log(`${COLOR.green}✓ 프론트 정상${COLOR.reset}  ${COLOR.dim}${front.detail}${COLOR.reset}`)
  else warn(`${COLOR.red}✗ 프론트 부트스트랩 실패: ${front.detail}${COLOR.reset}`)

  log(`${COLOR.cyan}▶ ${ENDPOINTS.length}개 엔드포인트 호출 (동시 ${CONCURRENCY})${COLOR.reset}`)
  const t0 = Date.now()
  const results = await runBatch(token, ENDPOINTS)
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
  log(`${COLOR.dim}완료: ${elapsed}s${COLOR.reset}`)

  // 2차 — 목록에서 뽑은 id 로 단건 상세를 때린다(5xx 만 FAIL).
  const probes = buildDetailProbes(results)
  if (probes.length > 0) {
    log(COLOR.cyan + '▶ 단건 상세 프로브 ' + probes.length + '개 (목록 응답에서 id 자동 추출)' + COLOR.reset)
    const probeResults = await runBatch(token, probes)
    results.push(...probeResults)
  } else {
    warn(COLOR.yellow + '상세 프로브 0개 — 목록이 전부 비었는지 확인할 것' + COLOR.reset)
  }

  const allPass = printResults(results)
  process.exit(allPass && front.ok ? 0 : 1)
}

main().catch(err => {
  warn(`${COLOR.red}치명적 오류: ${err.stack || err.message}${COLOR.reset}`)
  process.exit(1)
})
