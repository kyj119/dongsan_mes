/**
 * barobill-cron — 바로빌 카드/계좌 무인 자동 동기화 트리거.
 *
 * Cloudflare Pages는 Cron Trigger를 지원하지 않으므로, 이 독립 Worker가 매일(06:00 KST) MES의
 * 무인 엔드포인트를 호출한다. 수집·dedup·자동상계·자동매칭은 모두 MES(Pages) 핸들러에서 수행되며,
 * 이 워커는 X-Agent-Key로 트리거만 한다(바로빌 CERTKEY를 보유하지 않음 = 시크릿 노출면 최소화).
 */
export interface Env {
  MES_URL: string
  AGENT_API_KEY: string
}

async function trigger(env: Env, cardDays = 14): Promise<{ status: number; body: string }> {
  const res = await fetch(`${env.MES_URL}/api/cron/barobill-sync`, {
    method: 'POST',
    headers: { 'X-Agent-Key': env.AGENT_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ cardDays }),
  })
  return { status: res.status, body: (await res.text()).slice(0, 1000) }
}

// 무인 일일 정비(OEE 일배치 + 알림 생성). 멱등이라 반복 호출 안전.
async function triggerDaily(env: Env): Promise<{ status: number; body: string }> {
  const res = await fetch(`${env.MES_URL}/api/cron/daily-maintenance`, {
    method: 'POST',
    headers: { 'X-Agent-Key': env.AGENT_API_KEY, 'Content-Type': 'application/json' },
    body: '{}',
  })
  return { status: res.status, body: (await res.text()).slice(0, 1000) }
}

// 예산 점검(바로빌 잔액 + Cloudflare 사용량). 임계 초과 시 ADMIN 알림, 당일 1회 dedup.
//   ★수집(barobill-sync) **뒤에** 돌린다 — 그날 조회 요금이 빠져나간 뒤의 잔액을 봐야
//   "내일 수집이 돌아갈 수 있나"를 판정할 수 있다. 먼저 보면 이미 쓴 돈이 잔액에 안 잡힌다.
async function triggerBudget(env: Env): Promise<{ status: number; body: string }> {
  const res = await fetch(`${env.MES_URL}/api/cron/budget-check`, {
    method: 'POST',
    headers: { 'X-Agent-Key': env.AGENT_API_KEY, 'Content-Type': 'application/json' },
    body: '{}',
  })
  return { status: res.status, body: (await res.text()).slice(0, 1000) }
}

export default {
  // 정기 스케줄 — wrangler.jsonc triggers.crons
  async scheduled(_event: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    try {
      const r = await trigger(env)
      console.log(`[barobill-cron] barobill-sync ${r.status} ${r.body}`)
    } catch (err) {
      console.error('[barobill-cron] barobill-sync failed', err instanceof Error ? err.message : String(err))
    }
    try {
      const d = await triggerDaily(env)
      console.log(`[barobill-cron] daily-maintenance ${d.status} ${d.body}`)
    } catch (err) {
      console.error('[barobill-cron] daily-maintenance failed', err instanceof Error ? err.message : String(err))
    }
    try {
      const b = await triggerBudget(env)
      console.log(`[barobill-cron] budget-check ${b.status} ${b.body}`)
    } catch (err) {
      console.error('[barobill-cron] budget-check failed', err instanceof Error ? err.message : String(err))
    }
  },

  // 수동 점검/즉시 1회 실행 — X-Agent-Key 헤더 필수(공개 URL 남용 방지).
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.headers.get('X-Agent-Key') !== env.AGENT_API_KEY) {
      return new Response('Forbidden', { status: 403 })
    }
    const r = await trigger(env)
    return new Response(r.body, { status: r.status, headers: { 'Content-Type': 'application/json' } })
  },
}
