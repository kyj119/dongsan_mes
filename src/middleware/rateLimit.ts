import { createMiddleware } from 'hono/factory'
import type { HonoEnv } from '../types/env'

// 간단한 메모리 기반 Rate Limiter (Workers isolate 내에서 동작)
// 참고: Cloudflare Workers는 isolate가 재사용되므로 어느 정도 효과적
const attempts = new Map<string, { count: number; resetAt: number }>()

// 주기적으로 만료된 엔트리 정리
function cleanup() {
  const now = Date.now()
  for (const [key, val] of attempts) {
    if (now > val.resetAt) attempts.delete(key)
  }
}

/** 한 버킷에 1회 기록. 한도를 넘었으면 남은 초를 돌려준다(0 = 통과). */
function hit(key: string, maxAttempts: number, windowMs: number, now: number): number {
  const record = attempts.get(key)
  if (!record || now > record.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + windowMs })
    return 0
  }
  if (record.count >= maxAttempts) return Math.ceil((record.resetAt - now) / 1000)
  record.count++
  return 0
}

export type RateLimitOptions = {
  /**
   * 계정 단위 한도 — 요청 JSON 의 `field`(기본 username) 값마다 따로 센다.
   * 왜: 로그인은 IP 만으로 세면 **사무실 NAT 뒤 직원 전원이 한 IP** 라 아침에 3~4명째부터 429 가 났다
   *     (여정 루프 실측 2026-09-11, 한도 5회/분). 계정별로 세면 무차별 대입 방어는 그대로고
   *     IP 한도는 **계정 스프레이**만 막을 만큼 느슨하게 둘 수 있다.
   * body 를 못 읽거나 필드가 없으면 IP 한도만 적용한다(GET·폼 아님).
   */
  perAccount?: { max: number; field?: string }
}

export function rateLimitMiddleware(maxAttempts: number = 10, windowMs: number = 60000, opts: RateLimitOptions = {}) {
  return createMiddleware<HonoEnv>(async (c, next) => {
    const xff = c.req.header('X-Forwarded-For')
    const ip = c.req.header('CF-Connecting-IP') || (xff ? xff.split(',')[0].trim() : '') || 'unknown'
    const path = new URL(c.req.url).pathname
    const now = Date.now()

    // 30초마다 정리
    if (attempts.size > 1000) cleanup()

    let retryAfter = hit(`${ip}:${path}`, maxAttempts, windowMs, now)

    if (!retryAfter && opts.perAccount) {
      let account = ''
      try {
        // Hono 는 파싱한 body 를 캐시하므로 핸들러가 다시 c.req.json() 을 불러도 된다
        const body = await c.req.json<Record<string, unknown>>()
        const v = body?.[opts.perAccount.field || 'username']
        account = typeof v === 'string' ? v.trim().toLowerCase() : ''
      } catch {
        account = ''
      }
      if (account) retryAfter = hit(`acct:${path}:${account}`, opts.perAccount.max, windowMs, now)
    }

    if (retryAfter) {
      c.header('Retry-After', String(retryAfter))
      return c.json({
        success: false,
        error: `요청이 너무 많습니다. ${retryAfter}초 후에 다시 시도하세요.`
      }, 429)
    }

    await next()
  })
}
