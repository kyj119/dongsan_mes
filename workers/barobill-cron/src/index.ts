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

/**
 * 계좌만 수집 — 매시 정각.
 * prod 계좌 11개가 바로빌 `HOUR1`(1시간 주기·월 4,400원)로 등록돼 있는데 하루 1회만 받아가고 있었다.
 * 거래내역 조회는 무과금이라 시간당 받아도 추가 비용이 없다(용준님 결정 2026-08-11).
 * 카드는 전부 DAY1 이라 제외 — 시간당 불러도 갱신될 게 없다.
 */
async function triggerBankOnly(env: Env): Promise<{ status: number; body: string }> {
  const res = await fetch(`${env.MES_URL}/api/cron/barobill-sync`, {
    method: 'POST',
    headers: { 'X-Agent-Key': env.AGENT_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ bankOnly: true }),
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
  //   "0 21 * * *"        = 06:00 KST 전체(카드+계좌 → 일일정비 → 예산점검)
  //   "0 0-20,22-23 * * *" = 매시 정각 계좌만. 21 시를 뺀 이유는 전체 회차와 겹치지 않게 하려는 것뿐이다
  //                          (겹쳐도 멱등이라 사고는 아니지만 로그가 두 벌 남는다).
  async scheduled(event: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    if (event.cron !== '0 21 * * *') {
      try {
        const b = await triggerBankOnly(env)
        console.log(`[barobill-cron] bank-only ${b.status} ${b.body}`)
      } catch (err) {
        console.error('[barobill-cron] bank-only failed', err instanceof Error ? err.message : String(err))
      }
      return
    }
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
