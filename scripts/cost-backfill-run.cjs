/**
 * 주문 라인 원가(`order_items.material_cost/ink_cost/pp_cost/total_cost`) 재계산 백필.
 *
 * 왜 필요한가 — 저장된 원가는 **백필이 돌던 시점의 BOM**이다. 그 뒤 품목·자재 연결이 바뀌면
 * 값이 조용히 낡는다. 2026-09-08 실측: 게릴라(AQ-GERILLA) 라인이 `0568~0571` 로 품목을 옮긴 뒤
 * 재계산되지 않아 **일반 2코팅 원단(AQ2-090 459원/yd)** 기준 원가를 그대로 들고 있었다
 * (현재 BOM 은 저밀도 AQD-090 331.4원/yd). 재료비율이 77.1% 로 과대 표시됐다.
 *
 * 계산 자체는 서버가 한다 — `POST /api/costs/backfill` → `recalculateOrderCosts`.
 * 여기서 산식을 재구현하지 않는다(사본을 두면 저장값과 갈린다).
 *
 * 사용:
 *   COST_URL=https://webapp-9i0.pages.dev node scripts/cost-backfill-run.cjs --dry-run
 *   COST_URL=https://webapp-9i0.pages.dev node scripts/cost-backfill-run.cjs --limit 50
 *
 *   --dry-run     쓰지 않고 커버리지만 집계
 *   --limit N     한 호출당 주문 수(최대 100). 서버 subrequest 한도 때문에 크게 잡지 않는다
 *   --from N      재개 지점(order_id_gt). 중단됐을 때 마지막 커서를 넣는다
 *   --entity N    법인 고정(기본 0 = ADMIN 전체 모드)
 */
const BASE = (process.env.COST_URL || 'http://localhost:3000').replace(/\/$/, '')
const USER = process.env.COST_USER || 'admin'
const PASS = process.env.COST_PASS || 'password'

const arg = (k, d) => {
  const i = process.argv.indexOf('--' + k)
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d
}
const DRY = process.argv.includes('--dry-run')
const LIMIT = Math.min(Math.max(Number(arg('limit', 50)) || 50, 1), 100)
const FROM = Number(arg('from', 0)) || 0
const ENTITY = Number(arg('entity', 0))
const MAX_CALLS = Number(arg('max-calls', 0)) || 0

async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = { raw: text.slice(0, 300) } }
  return { status: res.status, json }
}

;(async () => {
  const t0 = Date.now()
  const login = await api('/api/auth/login', { method: 'POST', body: { username: USER, password: PASS } })
  if (login.status !== 200 || !login.json?.data?.token) {
    console.error('로그인 실패', login.status, JSON.stringify(login.json).slice(0, 200)); process.exit(1)
  }
  let token = login.json.data.token
  // 전체 모드(0)로 전환 — entityFilter 가 걸려 있어 세션 법인의 주문만 처리된다.
  const sw = await api('/api/auth/switch-entity', { method: 'POST', token, body: { entity_id: ENTITY } })
  if (sw.status !== 200 || !sw.json?.data?.token) {
    console.error('법인 전환 실패', sw.status, JSON.stringify(sw.json).slice(0, 200)); process.exit(1)
  }
  token = sw.json.data.token
  console.log(`[start] ${BASE} entity=${ENTITY} limit=${LIMIT} from=${FROM} ${DRY ? '(dry-run)' : ''}`)

  let cursor = FROM, processed = 0, calls = 0, fails = 0
  const coverage = {}, errorOrders = []
  while (true) {
    const r = await api('/api/costs/backfill', {
      method: 'POST', token, body: { limit: LIMIT, order_id_gt: cursor, dry_run: DRY },
    })
    if (r.status !== 200 || !r.json?.success) {
      fails++
      console.error(`[fail#${fails}] cursor=${cursor} status=${r.status} ${JSON.stringify(r.json).slice(0, 200)}`)
      // 3회 연속 실패면 중단 — 커서를 알려 주고 끝낸다(재개 가능해야 한다)
      if (fails >= 3) { console.error(`[abort] 재개: --from ${cursor}`); process.exit(2) }
      await new Promise(s => setTimeout(s, 3000))
      continue
    }
    fails = 0
    const d = r.json.data
    calls++; processed += d.processed
    for (const [k, v] of Object.entries(d.coverage || {})) coverage[k] = (coverage[k] || 0) + v
    if (d.error_order_ids?.length) errorOrders.push(...d.error_order_ids)
    cursor = d.lastOrderId
    if (calls % 10 === 0 || !d.hasMore) {
      const sec = Math.round((Date.now() - t0) / 1000)
      console.log(`  ${processed}건 처리 (cursor=${cursor}, ${sec}s) ${JSON.stringify(coverage)}`)
    }
    if (!d.hasMore) break
    // 시험 실행용 상한 — 재개 커서를 반드시 찍는다(끊긴 자리를 모르면 다시 처음부터 돈다)
    if (MAX_CALLS && calls >= MAX_CALLS) {
      console.log(`[stop] max-calls ${MAX_CALLS} 도달 — 재개: --from ${cursor}`)
      break
    }
  }
  console.log(`[done] 주문 ${processed}건 · 호출 ${calls}회 · ${Math.round((Date.now() - t0) / 1000)}s`)
  console.log(`  coverage=${JSON.stringify(coverage)}`)
  if (errorOrders.length) {
    console.log(`  ⚠️ 실패 주문 ${errorOrders.length}건 — 재시도 필요: ${errorOrders.slice(0, 50).join(',')}`)
  }
})()
