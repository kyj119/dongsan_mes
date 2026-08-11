/**
 * 예산 감시 — 바로빌 잔액 + Cloudflare 사용량을 한 번에 점검하고 임계 초과 시 알림한다.
 *
 * 왜 둘을 묶었나: 성격이 같다. 둘 다 **쓰는 만큼 빠져나가는데 화면 어디에도 안 보이고**,
 * 문제가 났을 때만 사후에 안다.
 *   - 바로빌: 잔액이 마르면 계좌·카드 수집 cron 이 조용히 실패한다(수집 누락은 대사 때나 드러난다).
 *   - Cloudflare: **지출 하드 상한 기능이 제품에 없다**(예산 알림만 존재, AI Gateway 만 spend limit 베타).
 *     2026-08-07 청구 $125.70 이 나고서야 알았다 — nav-badge 폴링 쿼리 하나가 D1 읽기의 98%였다
 *     ([[design-nav-badge-cost-guard]]). 빌드·스모크·타입체크 어디에도 안 걸리고 청구서에서만 보인다.
 *
 * 임계값은 settings 테이블(런타임 조정 가능):
 *   budget_barobill_min_balance   기본 50,000원
 *   budget_cf_rows_read_daily     기본 200,000,000행  ← 사고 당시 일 28.5B. 수리 후 정상은 이 값 훨씬 아래
 *   budget_cf_requests_daily      기본 3,000,000건
 *
 * Cloudflare 축은 **토큰이 있을 때만** 동작한다(`CF_ANALYTICS_TOKEN` + `CF_ACCOUNT_ID`).
 * 미설정이면 그 축만 조용히 건너뛰고 바로빌 점검은 그대로 수행한다 — 한쪽 미설정이 전체를 막지 않는다.
 * 토큰 발급 = Cloudflare 대시보드 → My Profile → API Tokens → Create Token →
 *            권한 `Account / Account Analytics / Read` (계정 읽기 전용이면 충분).
 *            설정 = `npx wrangler pages secret put CF_ANALYTICS_TOKEN`
 */

import type { D1Database } from '@cloudflare/workers-types'
import { notifyRoles } from '../utils/notify'
import { kstDate, kstDateOf } from '../utils/kstDate'

/** 임계 기본값 — settings 에 값이 없을 때 쓴다. */
const DEFAULTS = {
  budget_barobill_min_balance: 50_000,
  budget_cf_rows_read_daily: 200_000_000,
  budget_cf_requests_daily: 3_000_000,
} as const

export interface BudgetAxis {
  /** 실측값. 조회 실패 시 null */
  value: number | null
  threshold: number
  /** 임계를 넘었나(바로빌은 미만, CF 는 초과) */
  breached: boolean
  /** 조회 실패·미설정 사유 */
  skipped?: string
}

export interface BudgetCheckResult {
  barobill: BudgetAxis
  cfRowsRead: BudgetAxis
  cfRequests: BudgetAxis
  /** 실제로 생성된 알림 수(당일 중복은 제외된 뒤의 수) */
  alerts: number
  /** 알림 제목 목록 — cron 로그로 무엇이 걸렸는지 바로 보이게 */
  alertTitles: string[]
}

async function getThresholds(db: D1Database): Promise<Record<keyof typeof DEFAULTS, number>> {
  const keys = Object.keys(DEFAULTS)
  const rows = await db
    .prepare(`SELECT setting_key, setting_value FROM settings WHERE setting_key IN (${keys.map(() => '?').join(',')})`)
    .bind(...keys)
    .all<{ setting_key: string; setting_value: string }>()
    .catch(() => ({ results: [] as { setting_key: string; setting_value: string }[] }))
  const out = { ...DEFAULTS } as Record<keyof typeof DEFAULTS, number>
  for (const r of rows.results || []) {
    const n = Number(r.setting_value)
    if (Number.isFinite(n) && n > 0) out[r.setting_key as keyof typeof DEFAULTS] = n
  }
  return out
}

/**
 * 당일 같은 제목의 알림이 이미 있으면 건너뛴다.
 * `notifyRoles` 에는 dedup 이 없어서(사용자별 INSERT) 매일 호출하면 같은 경고가 쌓인다.
 * notifications.ts 의 createIfNotExists 와 같은 판정을 쓰되 그쪽은 export 되어 있지 않아 여기서 다시 쓴다.
 */
async function notifyOncePerDay(db: D1Database, title: string, message: string, link: string): Promise<boolean> {
  const existing = await db
    .prepare(`SELECT id FROM notifications WHERE title = ? AND ${kstDateOf('created_at')} = ${kstDate()} LIMIT 1`)
    .bind(title)
    .first()
    .catch(() => null)
  if (existing) return false
  await notifyRoles(db, ['ADMIN'], title, message, link)
  return true
}

/**
 * Cloudflare GraphQL Analytics 조회. 데이터셋마다 필터 필드가 달라 **쿼리를 나눠 던진다** —
 * 하나로 묶으면 한쪽 스키마가 어긋날 때 둘 다 못 받는다.
 */
async function cfGraphQL(token: string, query: string, variables: Record<string, unknown>): Promise<any> {
  const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  const json: any = await res.json().catch(() => null)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  if (json?.errors?.length) throw new Error(String(json.errors[0]?.message || 'GraphQL error').slice(0, 160))
  return json?.data
}

const Q_D1 = `query($tag:String!,$d:Date!){
  viewer{ accounts(filter:{accountTag:$tag}){
    d1AnalyticsAdaptiveGroups(limit:100, filter:{date_geq:$d}){ sum{ rowsRead rowsWritten } }
  } }
}`

/**
 * 요청 수 데이터셋은 **Pages 와 Workers 가 다르다**. MES 는 Pages 라 `workersInvocationsAdaptive`
 * 로는 0 이 나온다(실측: D1 읽기 5,132만인데 요청 0). $125 사고의 요청 $19.80 은 Pages Functions 분이었다.
 * 문서에서 Pages 데이터셋 이름이 확정되지 않아 **후보를 순서대로 시도**하고 처음 성공하는 것을 쓴다.
 */
const Q_REQUESTS: { name: string; query: string; arg: 'date' | 'datetime' }[] = [
  {
    name: 'pagesFunctionsInvocationsAdaptiveGroups',
    arg: 'date',
    query: `query($tag:String!,$d:Date!){
      viewer{ accounts(filter:{accountTag:$tag}){
        pagesFunctionsInvocationsAdaptiveGroups(limit:100, filter:{date_geq:$d}){ sum{ requests } }
      } }
    }`,
  },
  {
    name: 'workersInvocationsAdaptive',
    arg: 'datetime',
    query: `query($tag:String!,$dt:Time!){
      viewer{ accounts(filter:{accountTag:$tag}){
        workersInvocationsAdaptive(limit:100, filter:{datetime_geq:$dt}){ sum{ requests } }
      } }
    }`,
  },
]

export async function checkBudgets(env: {
  DB: D1Database
  CF_ANALYTICS_TOKEN?: string
  CF_ACCOUNT_ID?: string
}, barobillBalance: { value: number | null; error?: string }): Promise<BudgetCheckResult> {
  const db = env.DB
  const th = await getThresholds(db)
  const alertTitles: string[] = []

  // ── 바로빌 ────────────────────────────────────────────
  // 잔액 조회 자체는 호출부(라우터)가 한다 — CERTKEY·법인 설정이 Context 에 묶여 있어서다.
  const barobill: BudgetAxis = {
    value: barobillBalance.value,
    threshold: th.budget_barobill_min_balance,
    breached: barobillBalance.value != null && barobillBalance.value < th.budget_barobill_min_balance,
    skipped: barobillBalance.error,
  }
  if (barobill.breached) {
    const title = `바로빌 잔액 부족 — ${(barobill.value ?? 0).toLocaleString()}원`
    const msg = `임계 ${barobill.threshold.toLocaleString()}원 미만입니다. 잔액이 마르면 계좌·카드 수집 cron 이 조용히 실패합니다(수집 누락은 나중에 대사에서야 드러납니다). 충전이 필요합니다.`
    if (await notifyOncePerDay(db, title, msg, '/settings')) alertTitles.push(title)
  } else if (barobill.value == null) {
    // 조회 실패도 알린다 — CERTKEY 는 상시 설정돼 있어야 하므로 실패 자체가 이상 신호이고,
    // 무엇보다 이 상태에서는 잔액이 0 이 되어도 위 경고가 뜨지 않는다(감시 공백).
    const title = '바로빌 잔액 조회 실패'
    const msg = `잔액을 읽지 못했습니다 — 이 상태에서는 잔액이 말라도 경고가 오지 않습니다. 사유: ${barobill.skipped || '알 수 없음'}`
    if (await notifyOncePerDay(db, title, msg, '/settings')) alertTitles.push(title)
  }

  // ── Cloudflare ────────────────────────────────────────
  const empty = (why: string): BudgetAxis => ({ value: null, threshold: 0, breached: false, skipped: why })
  let cfRowsRead: BudgetAxis
  let cfRequests: BudgetAxis

  if (!env.CF_ANALYTICS_TOKEN || !env.CF_ACCOUNT_ID) {
    const why = 'CF_ANALYTICS_TOKEN·CF_ACCOUNT_ID 미설정'
    cfRowsRead = empty(why)
    cfRequests = empty(why)
  } else {
    // Cloudflare 집계는 UTC 기준이다. KST 하루와 9시간 어긋나지만 "일 사용량이 임계를 넘었나"를
    // 보는 목적이라 무해하다 — 경계일에 조금 이르게/늦게 잡힐 뿐 총량 판정은 바뀌지 않는다.
    const todayUtc = new Date().toISOString().slice(0, 10)
    const sinceUtc = `${todayUtc}T00:00:00Z`

    try {
      const d = await cfGraphQL(env.CF_ANALYTICS_TOKEN, Q_D1, { tag: env.CF_ACCOUNT_ID, d: todayUtc })
      const groups = d?.viewer?.accounts?.[0]?.d1AnalyticsAdaptiveGroups || []
      const rowsRead = groups.reduce((s: number, g: any) => s + (Number(g?.sum?.rowsRead) || 0), 0)
      cfRowsRead = {
        value: rowsRead,
        threshold: th.budget_cf_rows_read_daily,
        breached: rowsRead > th.budget_cf_rows_read_daily,
      }
    } catch (e: any) {
      cfRowsRead = empty(`D1 조회 실패: ${String(e?.message || e).slice(0, 120)}`)
    }

    cfRequests = empty('요청 데이터셋 후보 전부 실패')
    for (const cand of Q_REQUESTS) {
      try {
        const vars = cand.arg === 'date'
          ? { tag: env.CF_ACCOUNT_ID, d: todayUtc }
          : { tag: env.CF_ACCOUNT_ID, dt: sinceUtc }
        const d = await cfGraphQL(env.CF_ANALYTICS_TOKEN, cand.query, vars)
        const groups = d?.viewer?.accounts?.[0]?.[cand.name] || []
        const requests = groups.reduce((s: number, g: any) => s + (Number(g?.sum?.requests) || 0), 0)
        // ★교차 검증: D1 을 5천만 행 읽었는데 요청이 0 일 수는 없다 — 데이터셋이 우리 트래픽을
        //   안 보고 있다는 뜻이다. 0 을 "정상"으로 통과시키면 감시하는 척만 하게 된다.
        if (requests === 0 && (cfRowsRead.value ?? 0) > 0) {
          cfRequests = empty(`${cand.name} 이 0 반환 — D1 읽기 ${(cfRowsRead.value ?? 0).toLocaleString()}행과 모순(데이터셋 불일치)`)
          continue  // 다음 후보 시도
        }
        cfRequests = {
          value: requests,
          threshold: th.budget_cf_requests_daily,
          breached: requests > th.budget_cf_requests_daily,
        }
        break
      } catch (e: any) {
        cfRequests = empty(`${cand.name} 조회 실패: ${String(e?.message || e).slice(0, 100)}`)
      }
    }
  }

  if (cfRowsRead.breached) {
    const title = `Cloudflare D1 읽기 급증 — ${(cfRowsRead.value ?? 0).toLocaleString()}행`
    const msg = `오늘(UTC) D1 읽은 행이 임계 ${cfRowsRead.threshold.toLocaleString()}행을 넘었습니다. 폴링 엔드포인트에 무거운 집계가 붙었을 수 있습니다 — 2026-08-07 $125 청구가 같은 형태였습니다(nav-badge 쿼리 1개가 읽기의 98%). Cloudflare 에는 지출 하드 상한이 없으니 원인 쿼리를 바로 찾아야 합니다.`
    if (await notifyOncePerDay(db, title, msg, '/settings')) alertTitles.push(title)
  }
  if (cfRequests.breached) {
    const title = `Cloudflare Workers 요청 급증 — ${(cfRequests.value ?? 0).toLocaleString()}건`
    const msg = `오늘(UTC) Workers 요청이 임계 ${cfRequests.threshold.toLocaleString()}건을 넘었습니다. 재전송 루프(LogWatcher 전례)나 폴링 주기 이상을 의심하세요.`
    if (await notifyOncePerDay(db, title, msg, '/settings')) alertTitles.push(title)
  }

  // ★감시가 조용히 꺼지는 것을 막는다.
  //   토큰을 설정해 뒀는데 조회가 실패하면(스키마 변경·토큰 만료·권한 부족) 임계를 아무리 넘겨도
  //   breached 가 false 라 알림이 안 온다 — "감시 중"이라고 믿는 상태가 가장 위험하다.
  //   미설정(토큰 없음)은 의도된 상태이므로 알리지 않고, **설정했는데 실패한 경우만** 알린다.
  const configured = Boolean(env.CF_ANALYTICS_TOKEN && env.CF_ACCOUNT_ID)
  const failures = [cfRowsRead, cfRequests].filter((a) => a.skipped && a.value == null)
  if (configured && failures.length) {
    const title = 'Cloudflare 사용량 감시 실패'
    const msg = `토큰은 설정돼 있으나 조회가 실패했습니다 — 이 상태에서는 사용량이 급증해도 알림이 오지 않습니다. 사유: ${failures.map((f) => f.skipped).join(' / ')}`
    if (await notifyOncePerDay(db, title, msg, '/settings')) alertTitles.push(title)
  }

  return { barobill, cfRowsRead, cfRequests, alerts: alertTitles.length, alertTitles }
}
