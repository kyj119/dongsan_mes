/**
 * 비용 차단기 — Cloudflare 에 지출 하드 상한이 **없어서** 앱 안에 만든 한도.
 *
 * 왜 이게 필요한가:
 *   Cloudflare 는 계정 단위 spend limit 을 제공하지 않는다(2026-09 기준 AI Gateway 만 예외).
 *   즉 폴링 하나가 무거운 집계에 붙으면 **아무도 안 막는 채로 청구서까지 간다**
 *   (2026-08-07 $125.70 → nav-badge 쿼리 1개가 D1 읽기의 98%). 예산 감시(budgetAlert)는
 *   「알린다」까지고, 알림은 사람이 볼 때까지 아무것도 멈추지 않는다.
 *
 * 그래서 임계를 **두 단계**로 둔다.
 *   1) soft(경보선)  = `budget_cf_*_daily`      → ADMIN 알림. 사람이 판단.
 *   2) hard(차단선)  = `budget_cf_*_daily_hard` / `budget_cf_rows_read_monthly`
 *                     → 이 모듈이 **폴링·무거운 조회를 끊는다**. 사람이 없어도 멈춘다.
 *
 * 무엇을 끊고 무엇을 남기나 (용준님 확정 2026-09-08):
 *   끊는다  = 자동 폴링(배지·알림·칸반 갱신) · 무거운 읽기 전용 집계(리포트·자금계획)
 *   남긴다  = 로그인 · 화면 진입 · 주문/출고/입력 등 **쓰기 경로 전부** · 에이전트(X-Agent-Key) 연동
 *   이유: 과금은 「반복되는 읽기」가 만든다. 사람이 한 번 누르는 것은 비용이 아니라 업무다.
 *
 * 해제:
 *   - 일일 차단 → 다음 KST 자정에 자동 해제(`until` 이 지나면 그만).
 *   - 월 차단   → 다음 달 1일 KST 00:00.
 *   - 수동      → `POST /api/settings/cost-guard/release` (ADMIN).
 *   ★ 차단 상태를 **날짜가 아니라 만료시각(`until`)으로** 들고 있는 이유: 「오늘 차단됨」 플래그는
 *     해제하는 사람이 없으면 영구히 남는다. 시각이면 아무도 안 건드려도 스스로 풀린다.
 */

import type { D1Database } from '@cloudflare/workers-types'

export const GUARD_KEYS = {
  enabled: 'cost_guard_enabled',   // '1' = 작동(기본) · '0' = 감시만
  until: 'cost_guard_until',       // ISO 8601(UTC). 이 시각까지 차단
  reason: 'cost_guard_reason',     // 사람이 읽을 사유 — 알림·배너에 그대로 나간다
  trippedAt: 'cost_guard_tripped_at',
} as const

/** 하드 상한 기본값. settings 로 덮어쓸 수 있다.
 *  - 일 8억 행 = 월 24B ≈ D1 무료 포함량(25B) 직전. 정상 운영은 이 값의 1/100 수준이다.
 *  - 월 20B 행 = 포함량의 80%. 여기서 끊으면 **초과 요금이 발생하기 전에** 멈춘다. */
export const GUARD_DEFAULTS = {
  budget_cf_rows_read_daily_hard: 800_000_000,
  budget_cf_requests_daily_hard: 8_000_000,
  budget_cf_rows_read_monthly: 20_000_000_000,
} as const

export interface GuardState {
  /** 지금 차단 중인가 */
  active: boolean
  /** 차단 기능 자체가 켜져 있나(꺼져 있으면 감시만) */
  enabled: boolean
  /** 차단 만료 시각(ISO) */
  until: string | null
  reason: string | null
}

// isolate 로컬 캐시 — 차단 판정 자체가 D1 을 때리면 그게 또 비용이다.
// TTL 이 짧은 이유: 차단을 「거는」 쪽(cron)과 「보는」 쪽(요청)이 다른 isolate 라 전파가 늦으면
// 차단이 걸린 줄 알고 계속 새는 시간이 생긴다. 60초면 시간당 최대 60 쿼리로 무시할 수 있다.
const CACHE_TTL_MS = 60_000
let cached: { at: number; state: GuardState } | null = null

/** 캐시를 즉시 무효화한다 — 같은 isolate 안에서 걸거나 푼 직후 반영용. */
export function invalidateGuardCache(): void {
  cached = null
}

export async function getGuardState(db: D1Database): Promise<GuardState> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.state

  const keys = [GUARD_KEYS.enabled, GUARD_KEYS.until, GUARD_KEYS.reason]
  const rows = await db
    .prepare(`SELECT setting_key, setting_value FROM settings WHERE setting_key IN (?, ?, ?)`)
    .bind(...keys)
    .all<{ setting_key: string; setting_value: string }>()
    // 조회 실패 시 **차단하지 않는다** — 차단기 자체의 장애가 업무를 멈추면 안 된다.
    .catch(() => ({ results: [] as { setting_key: string; setting_value: string }[] }))

  const map = new Map((rows.results || []).map((r) => [r.setting_key, r.setting_value]))
  const enabled = (map.get(GUARD_KEYS.enabled) ?? '1') !== '0'
  const until = map.get(GUARD_KEYS.until) || null
  const state: GuardState = {
    enabled,
    until,
    reason: map.get(GUARD_KEYS.reason) || null,
    active: enabled && Boolean(until) && Date.parse(until as string) > Date.now(),
  }
  cached = { at: Date.now(), state }
  return state
}

/** KST 다음 자정(UTC ISO). 일일 차단의 만료 시각. */
export function nextKstMidnight(now: Date = new Date()): string {
  const kstMs = now.getTime() + 9 * 3600_000
  const kstDay = Math.floor(kstMs / 86400_000)
  return new Date((kstDay + 1) * 86400_000 - 9 * 3600_000).toISOString()
}

/** KST 다음 달 1일 00:00(UTC ISO). 월 차단의 만료 시각 — 청구 주기가 월이라 여기까지 끊는다. */
export function nextKstMonthStart(now: Date = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 3600_000)
  const firstKst = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth() + 1, 1, 0, 0, 0)
  return new Date(firstKst - 9 * 3600_000).toISOString()
}

/**
 * 차단을 건다. 이미 더 늦은 만료가 걸려 있으면 **연장만 하고 줄이지 않는다**
 * (월 차단이 걸린 날 일일 차단이 또 걸려 만료가 당겨지면 월 한도가 무력화된다).
 */
export async function tripGuard(db: D1Database, reason: string, until: string): Promise<string> {
  const current = await getGuardState(db)
  const effective = current.until && Date.parse(current.until) > Date.parse(until) ? current.until : until
  const now = new Date().toISOString()
  await db.batch([
    upsert(db, GUARD_KEYS.until, effective),
    upsert(db, GUARD_KEYS.reason, reason.slice(0, 300)),
    upsert(db, GUARD_KEYS.trippedAt, now),
  ])
  invalidateGuardCache()
  return effective
}

/** 수동 해제. 원인을 고친 뒤 ADMIN 이 푼다. */
export async function releaseGuard(db: D1Database): Promise<void> {
  await db.batch([upsert(db, GUARD_KEYS.until, ''), upsert(db, GUARD_KEYS.reason, '')])
  invalidateGuardCache()
}

function upsert(db: D1Database, key: string, value: string) {
  return db
    .prepare(
      `INSERT INTO settings (setting_key, setting_value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = CURRENT_TIMESTAMP`
    )
    .bind(key, value)
}
