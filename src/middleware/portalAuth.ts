// ============================================================================
// 고객 포털 JWT 인증 미들웨어
// ============================================================================

import { createMiddleware } from 'hono/factory'
import { verify, sign } from 'hono/jwt'
import type { HonoEnv } from '../types/env'

export interface PortalUser {
  portal_client_id: number
  client_account_id: number
  client_name: string
  contact_name: string
}

// 포털 JWT 토큰 생성 (4시간 만료)
export async function createPortalToken(env: { JWT_SECRET: string }, user: PortalUser): Promise<string> {
  const payload = {
    ...user,
    portal: true,
    exp: Math.floor(Date.now() / 1000) + 4 * 60 * 60,
  }
  return await sign(payload, env.JWT_SECRET, 'HS256')
}

// 포털 API 인증 미들웨어
export const portalAuthMiddleware = createMiddleware<HonoEnv>(async (c, next) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ success: false, error: '인증이 필요합니다.' }, 401)
  }

  try {
    const token = authHeader.substring(7)
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256') as any

    if (!payload.portal || !payload.portal_client_id) {
      return c.json({ success: false, error: '유효하지 않은 포털 토큰입니다.' }, 401)
    }

    c.set('portalUser' as any, {
      portal_client_id: payload.portal_client_id,
      client_account_id: payload.client_account_id,
      client_name: payload.client_name,
      contact_name: payload.contact_name,
    } as PortalUser)

    await next()
  } catch {
    return c.json({ success: false, error: '토큰이 만료되었거나 유효하지 않습니다.' }, 401)
  }
})

