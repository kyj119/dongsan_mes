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
 *  3) 연체 경고: 30일 초과 미수 거래처 ADMIN/MANAGER 알림(POST /api/ledger/receivables/check-overdue)
 * 멱등: OEE=upsert, 알림·연체=createIfNotExists dedup → 반복 호출 안전. 인증: X-Agent-Key.
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

    // 3) 연체 경고 (30일 초과 미수 거래처 → ADMIN/MANAGER 알림, 24h dedup). 엔드포인트가 법인 entityFilter 스코프.
    try {
      const r = await fetch(`${origin}/api/ledger/receivables/check-overdue`, { method: 'POST', headers: authHdr })
      rec.overdue = { status: r.status, ...(await r.json().catch(() => ({})) as any) }
    } catch (err: any) {
      rec.overdue = { error: String(err?.message || err).slice(0, 200) }
    }

    out.push(rec)
  }

  // 4) 연차 무인 적립 — 월차/연차(전 직원 대상·멱등: expected/entitlement 대비 delta만·ON CONFLICT upsert).
  //    루프 밖 1회(엔드포인트가 전 직원 처리). 매일 호출해도 초과적립 없음 → 적립 lag 제거.
  let leaves: any = {}
  try {
    const svcToken = await sign(
      { id: 0, username: 'cron', role: 'ADMIN', entityId: 1, exp: Math.floor(Date.now() / 1000) + 900 },
      jwtSecret, 'HS256'
    )
    const h = { Authorization: `Bearer ${svcToken}`, 'Content-Type': 'application/json' }
    const m = await fetch(`${origin}/api/leaves/accrual/monthly`, { method: 'POST', headers: h, body: '{}' })
    const mj: any = await m.json().catch(() => ({}))
    const y = await fetch(`${origin}/api/leaves/accrual/yearly`, { method: 'POST', headers: h, body: '{}' })
    const yj: any = await y.json().catch(() => ({}))
    leaves = { monthly: { status: m.status, ...(mj?.data ?? mj) }, yearly: { status: y.status, ...(yj?.data ?? yj) } }
  } catch (err: any) {
    leaves = { error: String(err?.message || err).slice(0, 200) }
  }

  // 5) 보존기간 정리(retention) — 무인 누적 방지. 각 단계 독립 try/catch(한 단계 실패가 다른 단계·전체 응답을 막지 않게).
  //    ⚠️ activity_logs·상태이력·발송로그(kakao/email)·업무 테이블은 삭제 금지(감사/법정보존). datetime('now')=UTC(기존 /cleanup 관례).
  const retention: any = {}
  try {
    const r = await c.env.DB.prepare(
      `DELETE FROM notifications WHERE created_at < datetime('now', '-30 days')`
    ).run()
    retention.notifications_deleted = r.meta?.changes || 0
  } catch (err: any) {
    retention.notifications_error = String(err?.message || err).slice(0, 200)
  }
  try {
    // 하트비트=순간 liveness(다음 보고 시 UPSERT 원복). 7일 초과 무보고 stale 행 정리.
    const r = await c.env.DB.prepare(
      `DELETE FROM agent_heartbeats WHERE COALESCE(last_seen_at, updated_at, created_at) < datetime('now', '-7 days')`
    ).run()
    retention.heartbeats_deleted = r.meta?.changes || 0
  } catch (err: any) {
    retention.heartbeats_error = String(err?.message || err).slice(0, 200)
  }
  try {
    const r = await c.env.DB.prepare(
      `DELETE FROM caps_sync_log WHERE started_at < datetime('now', '-90 days')`
    ).run()
    retention.caps_sync_log_deleted = r.meta?.changes || 0
  } catch (err: any) {
    retention.caps_sync_log_error = String(err?.message || err).slice(0, 200)
  }

  // 6) 무결성 트립와이어(0451) — bank_transactions 내용중복 감지.
  //    정상=0(내용키 UNIQUE 인덱스가 예방). >0이면 인덱스 우회/과거 잔존 의미 → ADMIN 알림(24h dedup).
  const integrity: any = {}
  try {
    const dup = await c.env.DB.prepare(
      `SELECT COUNT(*) c FROM (SELECT content_key FROM bank_transactions GROUP BY content_key HAVING COUNT(*) > 1)`
    ).first<{ c: number }>()
    integrity.bank_dup_groups = dup?.c || 0
    if ((dup?.c || 0) > 0) {
      const recent = await c.env.DB.prepare(
        `SELECT 1 FROM notifications WHERE title = ? AND created_at > datetime('now', '-1 day') LIMIT 1`
      ).bind('은행거래 중복 감지').first()
      if (!recent) {
        const { notifyRoles } = await import('../utils/notify')
        await notifyRoles(c.env.DB, ['ADMIN'], '은행거래 중복 감지',
          `bank_transactions 내용 동일·키 상이 ${dup!.c}그룹 감지 — /bank 확인 필요`, '/bank')
      }
    }
  } catch (err: any) {
    integrity.bank_dup_error = String(err?.message || err).slice(0, 200)
  }

  // 7) 내부 관계사 채권·채무 미러 대사 — 그룹 3법인이 서로를 거래처(clients 행)로 등록해 내부거래한다.
  //    A법인의 "B거래처 매출채권(AR)"과 B법인의 "A거래처 매입채무(AP)"는 거울처럼 같아야 하나, 장부가 법인별로
  //    분리돼 어긋나도 감지되지 않는다. 매일 대사해 불일치 시 ADMIN 알림(24h dedup, 쌍별 title).
  //    ⚠️ 미러 데이터 등록 전엔 불일치가 정상 → 등록 후 green이 목표. 문구 자체가 조치 가능하게.
  const intercompany: any = { pairs: [] }
  try {
    // 내부 관계사 매핑: entity ↔ 그 법인을 가리키는 clients 행. 3법인 고정 현실이라 하드코딩(prod client id: 조사값).
    const INTERCOMPANY = [
      { entityId: 1, clientId: 53,   name: '동산기획' },
      { entityId: 2, clientId: 1271, name: '선명' },
      { entityId: 3, clientId: 3757, name: '청주' },
    ]
    const entityIds = INTERCOMPANY.map(x => x.entityId)   // [1,2,3]
    const clientIds = INTERCOMPANY.map(x => x.clientId)   // [53,1271,3757]
    const eqs = entityIds.map(() => '?').join(',')
    const cqs = clientIds.map(() => '?').join(',')

    // (entity_id, key) → amount 사전집계. GROUP BY 2컬럼 → Map('e:k' → sum). 쌍 루프는 JS 조회(추가 쿼리 없음).
    const agg = async (sql: string, binds: number[]) => {
      const { results } = await c.env.DB.prepare(sql).bind(...binds).all<{ e: number; k: number; v: number }>()
      const m = new Map<string, number>()
      for (const r of results) m.set(`${r.e}:${r.k}`, Number(r.v) || 0)
      return m
    }

    // AR 3소스(청구법인 g.entity_id × 거래처 o.client_id) — ar-receivables.ts GET /receivables 파생식과 동일 조인·필터.
    const billed = await agg(
      `SELECT g.entity_id e, o.client_id k, COALESCE(SUM(g.billed_amount),0) v
       FROM order_billing_groups g JOIN orders o ON o.id = g.order_id
       WHERE g.billing_status = 'BILLED' AND o.status != 'CANCELLED'
         AND g.entity_id IN (${eqs}) AND o.client_id IN (${cqs})
       GROUP BY g.entity_id, o.client_id`, [...entityIds, ...clientIds])
    const arPaid = await agg(
      `SELECT entity_id e, client_id k, COALESCE(SUM(amount),0) v FROM payments
       WHERE entity_id IN (${eqs}) AND client_id IN (${cqs}) GROUP BY entity_id, client_id`,
      [...entityIds, ...clientIds])
    const arAdj = await agg(
      `SELECT entity_id e, client_id k, COALESCE(SUM(amount),0) v FROM adjustments
       WHERE entity_id IN (${eqs}) AND client_id IN (${cqs}) GROUP BY entity_id, client_id`,
      [...entityIds, ...clientIds])

    // AP 3소스(매입법인 entity_id × 공급처 supplier_id). PO는 확정 이후(DRAFT/CANCELLED 제외)만 채무로 인식.
    const po = await agg(
      `SELECT entity_id e, supplier_id k, COALESCE(SUM(final_amount),0) v FROM purchase_orders
       WHERE status NOT IN ('DRAFT','CANCELLED') AND entity_id IN (${eqs}) AND supplier_id IN (${cqs})
       GROUP BY entity_id, supplier_id`, [...entityIds, ...clientIds])
    const apPaid = await agg(
      `SELECT entity_id e, supplier_id k, COALESCE(SUM(amount),0) v FROM purchase_payments
       WHERE entity_id IN (${eqs}) AND supplier_id IN (${cqs}) GROUP BY entity_id, supplier_id`,
      [...entityIds, ...clientIds])
    const apAdj = await agg(
      `SELECT entity_id e, supplier_id k, COALESCE(SUM(amount),0) v FROM purchase_adjustments
       WHERE entity_id IN (${eqs}) AND supplier_id IN (${cqs}) GROUP BY entity_id, supplier_id`,
      [...entityIds, ...clientIds])

    // 24h 내 이미 발송한 대사 알림 title 로드(쌍별 dedup, N+1 방지). integrity 트립와이어와 동일 패턴.
    const { results: recentIc } = await c.env.DB.prepare(
      `SELECT DISTINCT title FROM notifications WHERE title LIKE '내부거래 대사 불일치:%' AND created_at > datetime('now', '-1 day')`
    ).all<{ title: string }>()
    const recentTitles = new Set((recentIc || []).map(n => n.title))
    const { notifyRoles } = await import('../utils/notify')

    for (const A of INTERCOMPANY) {
      for (const B of INTERCOMPANY) {
        if (A.entityId === B.entityId) continue
        // A의 매출채권(B거래처): 청구법인=A, 거래처=B
        const ar = (billed.get(`${A.entityId}:${B.clientId}`) || 0)
                 - (arPaid.get(`${A.entityId}:${B.clientId}`) || 0)
                 - (arAdj.get(`${A.entityId}:${B.clientId}`) || 0)
        // B의 매입채무(A공급처): 매입법인=B, 공급처=A
        const ap = (po.get(`${B.entityId}:${A.clientId}`) || 0)
                 - (apPaid.get(`${B.entityId}:${A.clientId}`) || 0)
                 - (apAdj.get(`${B.entityId}:${A.clientId}`) || 0)
        const diff = ar - ap
        intercompany.pairs.push({ from: A.name, to: B.name, ar, ap, diff })
        // 둘 다 0 = 미거래 쌍 → skip. 그 외 차이 1원 초과면 불일치 알림.
        if ((ar !== 0 || ap !== 0) && Math.abs(diff) > 1) {
          const title = `내부거래 대사 불일치: ${A.name}→${B.name}`
          if (!recentTitles.has(title)) {
            await notifyRoles(c.env.DB, ['ADMIN'], title,
              `${A.name} 매출채권 ${Math.round(ar).toLocaleString()}원 ↔ ${B.name} 매입채무 ${Math.round(ap).toLocaleString()}원 (차이 ${Math.round(diff).toLocaleString()}원). /ledger에서 양측 장부 확인 필요.`,
              '/ledger')
            recentTitles.add(title)
          }
        }
      }
    }
  } catch (err: any) {
    intercompany.error = String(err?.message || err).slice(0, 200)
  }

  const summary = { entities: entities.length, date: yesterday }
  console.log('[cron/daily-maintenance]', JSON.stringify({ ...summary, leaves, retention, integrity, intercompany }))
  return c.json({ success: true, summary, results: out, leaves, retention, integrity, intercompany })
})

export default cronRouter
