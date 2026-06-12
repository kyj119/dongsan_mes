import { createMiddleware } from 'hono/factory'
import { verify } from 'hono/jwt'
import type { HonoEnv } from '../types/env'
import type { AuthUser } from '../types/models'

export type { AuthUser }

// JWT 토큰 검증 미들웨어
export const authMiddleware = createMiddleware<HonoEnv>(async (c, next) => {
  try {
    const authHeader = c.req.header('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ success: false, message: 'Unauthorized - No token provided' }, 401)
    }

    const token = authHeader.substring(7)
    const jwtSecret = c.env.JWT_SECRET
    if (!jwtSecret) {
      console.error('JWT_SECRET environment variable is not set')
      return c.json({ success: false, message: 'Server configuration error' }, 500)
    }
    const payload = await verify(token, jwtSecret, 'HS256')

    const authUser = payload as unknown as AuthUser
    c.set('user', authUser)
    c.set('entityId', (authUser.entityId != null) ? authUser.entityId : 1)
    await next()
  } catch (error) {
    console.error('Auth middleware error:', error)
    return c.json({ success: false, message: 'Unauthorized - Invalid token' }, 401)
  }
})

// 역할 기반 접근 제어 (RBAC) 미들웨어
export function requireRole(...allowedRoles: string[]) {
  return createMiddleware<HonoEnv>(async (c, next) => {
    const user = c.get('user')

    if (!user) {
      return c.json({ success: false, message: 'Unauthorized' }, 401)
    }

    if (!allowedRoles.includes(user.role)) {
      return c.json({
        success: false,
        message: `Forbidden - Required role: ${allowedRoles.join(' or ')}`
      }, 403)
    }

    await next()
  })
}

// 관리자 전용 미들웨어
export const requireAdmin = requireRole('ADMIN')

// 페이지용 인증 미들웨어 — SPA 요청 시 서버 토큰 검증, 일반 요청은 HTML 반환 (클라이언트 JS가 처리)
export const pageAuthMiddleware = createMiddleware<HonoEnv>(async (c, next) => {
  const isSPA = c.req.header('X-SPA-Request') === '1'

  if (isSPA) {
    const authHeader = c.req.header('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    try {
      const token = authHeader.substring(7)
      const payload = await verify(token, c.env.JWT_SECRET, 'HS256')
      const authUser = payload as unknown as AuthUser
      c.set('user', authUser)
      c.set('entityId', (authUser.entityId != null) ? authUser.entityId : 1)
    } catch {
      return c.json({ error: 'Unauthorized' }, 401)
    }
  }
  await next()
})

// Agent API Key 미들웨어 (LogWatcher/RIP 에이전트용)
export const agentKeyMiddleware = createMiddleware<HonoEnv>(async (c, next) => {
  const expectedKey = c.env.AGENT_API_KEY
  if (!expectedKey) {
    console.error('AGENT_API_KEY environment variable is not set')
    return c.json({ success: false, error: 'Server configuration error' }, 500)
  }
  const key = c.req.header('X-Agent-Key')
  if (!key || key !== expectedKey) {
    return c.json({ success: false, error: 'Invalid or missing API key' }, 401)
  }
  await next()
})

// #375: 카드 조회용 결합 인증 — X-Agent-Key(LogWatcher/EdgeAgent) → 전역(법인 무관, entityId=0),
//   아니면 일반 JWT(사용자 → 자기 법인 한정). 에이전트는 교차법인 카드 매칭이 정당하므로 전역 허용,
//   사용자 토큰은 cardEntityFilter로 자기 법인만. (by-number 등 에이전트 겸용 조회에 사용)
export const agentKeyOrAuthMiddleware = createMiddleware<HonoEnv>(async (c, next) => {
  const agentKey = c.req.header('X-Agent-Key')
  if (agentKey) {
    const expectedKey = c.env.AGENT_API_KEY
    if (expectedKey && agentKey === expectedKey) {
      c.set('entityId', 0)  // 에이전트 = 전역 조회(법인 필터 생략)
      await next()
      return
    }
    return c.json({ success: false, error: 'Invalid API key' }, 401)
  }
  // agent-key 없으면 일반 JWT 인증 (authMiddleware와 동일 시맨틱)
  const authHeader = c.req.header('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ success: false, message: 'Unauthorized - No token provided' }, 401)
  }
  try {
    const payload = await verify(authHeader.substring(7), c.env.JWT_SECRET, 'HS256')
    const authUser = payload as unknown as AuthUser
    c.set('user', authUser)
    c.set('entityId', (authUser.entityId != null) ? authUser.entityId : 1)
    await next()
  } catch (error) {
    console.error('agentKeyOrAuth middleware error:', error)
    return c.json({ success: false, message: 'Unauthorized - Invalid token' }, 401)
  }
})
