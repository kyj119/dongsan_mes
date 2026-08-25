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
 * body(선택):
 *   { cardDays?: number }  카드 수집 소급 일수(기본 14). 계좌는 핸들러 기본(최근 3일).
 *   { bankOnly?: true }    계좌만 — **시간당 호출용**.
 *
 * ★왜 계좌만 따로 도는가: prod 계좌 11개가 바로빌에 `HOUR1`(1시간 주기, 월 4,400원)로 등록돼 있는데
 *   cron 은 하루 1회뿐이라 **시간당 수집료를 내고 하루치만 쓰고 있었다**(2026-08-11 실측).
 *   바로빌 거래내역 조회(GetDaily/MonthlyBankAccountTransLog)는 **무과금**이라 자주 불러도 비용이 안 든다
 *   ([[barobill-charge-balance]] ⑥). 카드는 전부 `DAY1` 이라 시간당 호출해 봐야 갱신이 없어 제외한다.
 *
 * 인증: X-Agent-Key (AGENT_API_KEY). 사용자 JWT 불필요.
 */
cronRouter.post('/barobill-sync', agentKeyMiddleware, async (c) => {
  const jwtSecret = c.env.JWT_SECRET
  if (!jwtSecret) return c.json({ success: false, error: 'JWT_SECRET 미설정' }, 500)

  const body = await c.req.json().catch(() => ({})) as { cardDays?: number; bankOnly?: boolean }
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

    // 1) 카드 — bankOnly(시간당 호출)면 건너뛴다. 카드는 DAY1 이라 시간당 돌 이유가 없다.
    if (!body.bankOnly) {
      try {
        const r = await fetch(`${origin}/api/card-expenses/sync`, {
          method: 'POST', headers: authHdr,
          body: JSON.stringify({ date_start: dateStart, date_end: dateEnd }),
        })
        rec.card = { status: r.status, ...(await r.json().catch(() => ({})) as any) }
      } catch (err: any) {
        rec.card = { error: String(err?.message || err).slice(0, 200) }
      }
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
    mode: body.bankOnly ? 'bankOnly' : 'full',
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
 *  3) 연체 경고: 거래처별 기준일(overdue_alert_days, 기본 30일) 초과 미수 거래처 ADMIN/MANAGER 알림(POST /api/ledger/receivables/check-overdue)
 *     ★호출은 매일이지만 **실제 발송은 거래처당 주 1회** — 주기는 엔드포인트의 dedup 창(7일)이 만든다.
 *     여기서 요일로 막지 않는 이유 = cron 이 하루 실패해도 다음 날이 대신 채우게 하려고(ar-receivables 주석 참조).
 * 멱등: OEE=upsert, 알림·연체=createIfNotExists dedup → 반복 호출 안전. 인증: X-Agent-Key.
 */
/**
 * POST /api/cron/analyze — 쿼리 플래너 통계(sqlite_stat1) 갱신.
 *
 * daily-maintenance 안에서도 매일 돌지만, 대량 이관 직후처럼 분포가 한 번에 바뀐 날에는
 * 다음 배치를 기다리지 말고 바로 돌리는 게 맞다. 응답에 소요시간·통계행수를 담아
 * "정말 반영됐는지" 를 눈으로 확인할 수 있게 한다.
 *
 * 되돌리기: `DROP TABLE sqlite_stat1` (통계는 데이터가 아니라 힌트라 지워도 결과는 불변, 느려질 뿐).
 */
cronRouter.post('/analyze', agentKeyMiddleware, async (c) => {
  try {
    const t0 = Date.now()
    await c.env.DB.prepare('ANALYZE').run()
    const ms = Date.now() - t0
    const stat = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM sqlite_stat1').first<{ n: number }>()
    return c.json({ success: true, ms, stat_rows: stat?.n ?? null })
  } catch (err: any) {
    console.error('[cron/analyze]', err)
    return c.json({ success: false, error: String(err?.message || err).slice(0, 300) }, 500)
  }
})

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

    // 3) 연체 경고 (거래처별 기준일 초과 미수 거래처 → ADMIN/MANAGER 알림, **7일 dedup = 주 1회**). 엔드포인트가 법인 entityFilter 스코프.
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

  // 4-B) 재고 부족 알림 **행** 생성 — `stock_alerts` (품목별, 발주로 이어지는 목록).
  //
  // ★왜 필요했나(2026-08-26): `/purchase-orders` 의 「재고 부족」 배지는 `stock_alerts` ACTIVE 를 세는데
  //   그 행은 **사람이 그 탭에서 「알림 체크」를 눌러야만** 생겼다(`scripts/purchaseOrders.js` checkStockAlerts).
  //   들어오게 만들 지표가 들어와야 켜지는 순환이라 prod `stock_alerts` 는 **0행**이었다 —
  //   08-25 에 `reorder_point` 48행을 채우고도 품목별 목록은 아무 데서도 안 보였다.
  //   `notifications` 쪽 「재고 부족 N개 품목」(notifications.ts §4)은 **개수 요약뿐**이라 무엇이 부족한지 알 수 없다.
  //
  // 루프 밖 1회 — 생성 쿼리가 `GROUP BY item_id, entity_id` 로 **전 법인을 한 번에** 처리하고
  // 행마다 그 법인으로 귀속시킨다(stock-alerts.ts). 법인별로 부르면 첫 호출이 전부 만들고 나머지는 no-op 이다.
  // 멱등 = 같은 품목×법인에 ACTIVE/ACKNOWLEDGED 가 있으면 건너뛴다(NOT EXISTS).
  let stockAlerts: any = {}
  try {
    const svcToken = await sign(
      { id: 0, username: 'cron', role: 'ADMIN', entityId: 1, exp: Math.floor(Date.now() / 1000) + 900 },
      jwtSecret, 'HS256'
    )
    const r = await fetch(`${origin}/api/purchase-orders/stock-alerts/check`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${svcToken}`, 'Content-Type': 'application/json' },
    })
    stockAlerts = { status: r.status, ...((await r.json().catch(() => ({}))) as any) }
  } catch (err: any) {
    stockAlerts = { error: String(err?.message || err).slice(0, 200) }
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
    // 내부 관계사 채권·채무 파생 SSOT(매핑·집계 = src/constants/intercompany.ts + src/utils/intercompany.ts).
    // 회계허브 법인간거래 탭이 동일 파생을 공유(재하드코딩 금지).
    const { deriveIntercompanyPositions } = await import('../utils/intercompany')
    const positions = await deriveIntercompanyPositions(c.env.DB)

    // 24h 내 이미 발송한 대사 알림 title 로드(쌍별 dedup, N+1 방지). integrity 트립와이어와 동일 패턴.
    const { results: recentIc } = await c.env.DB.prepare(
      `SELECT DISTINCT title FROM notifications WHERE title LIKE '내부거래 대사 불일치:%' AND created_at > datetime('now', '-1 day')`
    ).all<{ title: string }>()
    const recentTitles = new Set((recentIc || []).map(n => n.title))
    const { notifyRoles } = await import('../utils/notify')

    for (const p of positions) {
      intercompany.pairs.push({ from: p.from_name, to: p.to_name, ar: p.ar, ap: p.ap, diff: p.diff })
      // 둘 다 0 = 미거래 쌍 → skip. 그 외 차이 1원 초과면 불일치 알림.
      if ((p.ar !== 0 || p.ap !== 0) && Math.abs(p.diff) > 1) {
        const title = `내부거래 대사 불일치: ${p.from_name}→${p.to_name}`
        if (!recentTitles.has(title)) {
          await notifyRoles(c.env.DB, ['ADMIN'], title,
            `${p.from_name} 매출채권 ${Math.round(p.ar).toLocaleString()}원 ↔ ${p.to_name} 매입채무 ${Math.round(p.ap).toLocaleString()}원 (차이 ${Math.round(p.diff).toLocaleString()}원). 회계허브 > 법인간거래 탭에서 확인.`,
            '/accounting')
          recentTitles.add(title)
        }
      }
    }
  } catch (err: any) {
    intercompany.error = String(err?.message || err).slice(0, 200)
  }

  // 8) 쿼리 플래너 통계 갱신(ANALYZE) — 2026-08-25.
  //   D1(SQLite)은 sqlite_stat1 이 없으면 인덱스 선택도를 전부 같다고 가정한다. orders 처럼 인덱스가
  //   17개 붙은 테이블에서는 조인키(client_id)를 버리고 엉뚱한 인덱스(entity_id)를 잡는 일이 생기고,
  //   그러면 거래처 1건마다 orders 를 통째로 훑어 rows_read 가 수천만으로 튄다.
  //   실제로 prod 는 통계가 한 번도 만들어진 적이 없었고, /reports 는 13.9초·휴면 거래처 필터는
  //   36초 뒤 500 이었다. ANALYZE 한 번으로 각각 123ms·83ms 가 됐다(2,530만→8.8만 행).
  //   통계는 데이터가 늘면 낡으므로 매일 갱신한다. 비용은 prod 규모에서 170ms 안팎.
  const analyze: any = {}
  try {
    const t0 = Date.now()
    await c.env.DB.prepare('ANALYZE').run()
    analyze.ms = Date.now() - t0
    analyze.stat_rows = (await c.env.DB.prepare('SELECT COUNT(*) AS n FROM sqlite_stat1').first<{ n: number }>())?.n ?? null
  } catch (err: any) {
    // 통계 갱신 실패가 일일 배치 전체를 막지 않는다(다음 날 다시 시도된다)
    analyze.error = String(err?.message || err).slice(0, 200)
  }

  const summary = { entities: entities.length, date: yesterday }
  console.log('[cron/daily-maintenance]', JSON.stringify({ ...summary, leaves, stockAlerts, retention, integrity, intercompany, analyze }))
  return c.json({ success: true, summary, results: out, leaves, stockAlerts, retention, integrity, intercompany, analyze })
})

/**
 * POST /api/cron/budget-check — 바로빌 잔액 + Cloudflare 사용량 예산 점검.
 *
 * 둘을 묶은 이유는 성격이 같아서다: 쓰는 만큼 빠져나가는데 화면 어디에도 안 보이고, 사고 뒤에야 안다.
 * 바로빌은 잔액이 마르면 수집 cron 이 조용히 실패하고, Cloudflare 는 **지출 하드 상한 자체가 없다**
 * (2026-08-07 $125.70 청구를 청구서에서 처음 알았다).
 *
 * 임계 = settings(`budget_barobill_min_balance`·`budget_cf_rows_read_daily`·`budget_cf_requests_daily`).
 * 알림 = ADMIN, **당일 같은 제목 1회**(매일 도는 cron 이라 dedup 없으면 같은 경고가 쌓인다).
 * Cloudflare 축은 `CF_ANALYTICS_TOKEN`·`CF_ACCOUNT_ID` 가 있을 때만 — 없으면 그 축만 건너뛰고
 * 바로빌 점검은 그대로 한다(한쪽 미설정이 전체를 막지 않는다).
 *
 * 인증: X-Agent-Key. 응답에 실측값을 담으므로 수동 호출로 현재 상태 조회에도 쓸 수 있다.
 */
cronRouter.post('/budget-check', agentKeyMiddleware, async (c) => {
  // 바로빌 잔액은 통합(파트너) 지갑 = CERTKEY 단위 공통이라 법인 루프가 필요 없다.
  //   이 핸들러엔 사용자 JWT 가 없어 `getEntityId(c)` 가 기본값 1(동산)로 떨어지는데,
  //   파트너 지갑은 어느 법인 corpNum 으로 조회해도 같은 값이라 무관하다.
  //   (회원사 지갑 `getBarobillBalance` 였다면 법인마다 달라져 이 가정이 깨진다 — 바꾸지 말 것)
  const balance: { value: number | null; error?: string } = { value: null }
  try {
    const { getBarobillConfig } = await import('./barobill')
    const { getPartnerBalance } = await import('../services/barobillClient')
    const config = await getBarobillConfig(c)
    balance.value = await getPartnerBalance(config)
  } catch (err: any) {
    balance.error = String(err?.message || err).slice(0, 200)
  }

  const { checkBudgets } = await import('../services/budgetAlert')
  const result = await checkBudgets(c.env as any, balance)

  console.log('[cron/budget-check]', JSON.stringify(result))
  return c.json({ success: true, ...result })
})

export default cronRouter
