/**
 * 무인 자동화(cron) 엔드포인트 — 외부 Cron 워커가 X-Agent-Key로 호출.
 *
 * Cloudflare Pages는 네이티브 Cron Trigger를 지원하지 않으므로, 별도 Worker(workers/barobill-cron)가
 * 매일 이 엔드포인트를 호출한다. 여기서는 머니패스 로직을 중복하지 않고, 법인별 단기 서비스 JWT를
 * 발급해 기존 수집 엔드포인트(/api/card-expenses/sync, /api/bank/auto-sync)를 self-fetch로 재사용한다.
 *   → 카드/계좌 수집·dedup·자동상계·자동매칭 로직은 기존 핸들러 그대로(단일 소스).
 */
import { Hono } from 'hono'
import { sign } from 'hono/jwt'
import type { HonoEnv } from '../types/env'
import { agentKeyMiddleware } from '../middleware/auth'

const cronRouter = new Hono<HonoEnv>()

// YYYY-MM-DD (KST 무관, UTC 기준 날짜 — 수집 범위는 며칠 폭이라 경계 영향 무시 가능)
function ymd(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10)
}

/**
 * POST /api/cron/barobill-sync — 전 활성 법인의 카드+계좌 바로빌 동기화.
 * body(선택): { cardDays?: number }  카드 수집 소급 일수(기본 14). 계좌는 핸들러 기본(최근 3일).
 * 인증: X-Agent-Key (AGENT_API_KEY). 사용자 JWT 불필요.
 */
cronRouter.post('/barobill-sync', agentKeyMiddleware, async (c) => {
  const jwtSecret = c.env.JWT_SECRET
  if (!jwtSecret) return c.json({ success: false, error: 'JWT_SECRET 미설정' }, 500)

  const body = await c.req.json().catch(() => ({})) as { cardDays?: number }
  const cardDays = Math.min(Math.max(Number(body.cardDays) || 14, 1), 60)
  const dateStart = ymd(cardDays)
  const dateEnd = ymd(0)
  const origin = new URL(c.req.url).origin

  const { results: entities } = await c.env.DB.prepare(
    'SELECT id, short_name FROM entities WHERE is_active = 1 ORDER BY sort_order'
  ).all<{ id: number; short_name: string | null }>()

  const out: any[] = []
  for (const e of entities) {
    // 법인별 단기 서비스 토큰(15분). id=0(서비스), role=ADMIN, entityId=해당 법인.
    const token = await sign(
      { id: 0, username: 'cron', role: 'ADMIN', entityId: e.id, exp: Math.floor(Date.now() / 1000) + 900 },
      jwtSecret, 'HS256'
    )
    const authHdr = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    const rec: any = { entity_id: e.id, short_name: e.short_name }

    // 1) 카드
    try {
      const r = await fetch(`${origin}/api/card-expenses/sync`, {
        method: 'POST', headers: authHdr,
        body: JSON.stringify({ date_start: dateStart, date_end: dateEnd }),
      })
      rec.card = { status: r.status, ...(await r.json().catch(() => ({})) as any) }
    } catch (err: any) {
      rec.card = { error: String(err?.message || err).slice(0, 200) }
    }

    // 2) 계좌 (핸들러가 자체적으로 최근 3일 수집 + 자동매칭)
    try {
      const r = await fetch(`${origin}/api/bank/auto-sync`, { method: 'POST', headers: authHdr })
      rec.bank = { status: r.status, ...(await r.json().catch(() => ({})) as any) }
    } catch (err: any) {
      rec.bank = { error: String(err?.message || err).slice(0, 200) }
    }

    out.push(rec)
  }

  const summary = {
    entities: entities.length,
    card_inserted: out.reduce((s, r) => s + (r.card?.data?.inserted || 0), 0),
    bank_inserted: out.reduce((s, r) => s + (r.bank?.data?.inserted || 0), 0),
  }
  console.log('[cron/barobill-sync]', JSON.stringify(summary))
  return c.json({ success: true, summary, results: out })
})

/**
 * POST /api/cron/daily-maintenance — 무인 일일 정비(전 활성 법인).
 *  1) OEE 일배치: 어제분 equipment_oee_daily 재계산(POST /api/oee/calculate)
 *  2) 알림 생성: 납기 도래/지연·저재고 등 서버측 생성(POST /api/notifications/generate) — 프론트 폴링 의존 제거
 * 멱등: OEE=upsert, 알림=createIfNotExists dedup → 반복 호출 안전. 인증: X-Agent-Key.
 */
cronRouter.post('/daily-maintenance', agentKeyMiddleware, async (c) => {
  const jwtSecret = c.env.JWT_SECRET
  if (!jwtSecret) return c.json({ success: false, error: 'JWT_SECRET 미설정' }, 500)

  const yesterday = ymd(1)
  const origin = new URL(c.req.url).origin

  const { results: entities } = await c.env.DB.prepare(
    'SELECT id, short_name FROM entities WHERE is_active = 1 ORDER BY sort_order'
  ).all<{ id: number; short_name: string | null }>()

  const out: any[] = []
  for (const e of entities) {
    // 법인별 단기 서비스 토큰(15분). id=0(서비스), role=ADMIN, entityId=해당 법인.
    const token = await sign(
      { id: 0, username: 'cron', role: 'ADMIN', entityId: e.id, exp: Math.floor(Date.now() / 1000) + 900 },
      jwtSecret, 'HS256'
    )
    const authHdr = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    const rec: any = { entity_id: e.id, short_name: e.short_name }

    // 1) OEE 일배치 (어제)
    try {
      const r = await fetch(`${origin}/api/oee/calculate`, {
        method: 'POST', headers: authHdr, body: JSON.stringify({ date: yesterday }),
      })
      rec.oee = { status: r.status, ...(await r.json().catch(() => ({})) as any) }
    } catch (err: any) {
      rec.oee = { error: String(err?.message || err).slice(0, 200) }
    }

    // 2) 알림 생성 (납기·저재고 등, dedup)
    try {
      const r = await fetch(`${origin}/api/notifications/generate`, { method: 'POST', headers: authHdr })
      rec.notifications = { status: r.status, ...(await r.json().catch(() => ({})) as any) }
    } catch (err: any) {
      rec.notifications = { error: String(err?.message || err).slice(0, 200) }
    }

    out.push(rec)
  }

  const summary = { entities: entities.length, date: yesterday }
  console.log('[cron/daily-maintenance]', JSON.stringify(summary))
  return c.json({ success: true, summary, results: out })
})

export default cronRouter
