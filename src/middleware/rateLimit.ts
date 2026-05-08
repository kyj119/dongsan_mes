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

export function rateLimitMiddleware(maxAttempts: number = 10, windowMs: number = 60000) {
  return createMiddleware<HonoEnv>(async (c, next) => {
    const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown'
    const key = `${ip}:${new URL(c.req.url).pathname}`
    const now = Date.now()

    // 30초마다 정리
    if (attempts.size > 1000) cleanup()

    const record = attempts.get(key)
    if (record) {
      if (now > record.resetAt) {
        // 윈도우 만료 → 리셋
        attempts.set(key, { count: 1, resetAt: now + windowMs })
      } else if (record.count >= maxAttempts) {
        const retryAfter = Math.ceil((record.resetAt - now) / 1000)
        c.header('Retry-After', String(retryAfter))
        return c.json({
          success: false,
          error: `요청이 너무 많습니다. ${retryAfter}초 후에 다시 시도하세요.`
        }, 429)
      } else {
        record.count++
      }
    } else {
      attempts.set(key, { count: 1, resetAt: now + windowMs })
    }

    await next()
  })
}
