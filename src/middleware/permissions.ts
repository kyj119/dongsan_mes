// 페이지 권한 미들웨어 (DB 기반 + 메모리 캐시)
// 설계: .claude/plans/2026-04-16-permission-management-system.md
// ADMIN 은 모든 페이지 통과. 나머지 역할은 role_page_permissions 매트릭스 기준.

import type { MiddlewareHandler } from 'hono'
import type { HonoEnv } from '../types/env'

let _cache: Map<string, Set<string>> | null = null

async function buildCache(db: D1Database): Promise<Map<string, Set<string>>> {
  const { results } = await db
    .prepare('SELECT role, page_key FROM role_page_permissions WHERE can_access = 1')
    .all<{ role: string; page_key: string }>()
  const map = new Map<string, Set<string>>()
  for (const r of results || []) {
    if (!map.has(r.role)) map.set(r.role, new Set())
    map.get(r.role)!.add(r.page_key)
  }
  return map
}

export async function getAccessiblePages(db: D1Database, role: string): Promise<Set<string>> {
  if (role === 'ADMIN') {
    // ADMIN 은 별도 처리 — 마스터 전체 반환
    const { results } = await db.prepare('SELECT page_key FROM permission_pages WHERE is_active = 1').all<{ page_key: string }>()
    return new Set((results || []).map(r => r.page_key))
  }
  if (!_cache) _cache = await buildCache(db)
  return _cache.get(role) || new Set()
}

export function invalidatePermissionCache(): void {
  _cache = null
}

export function requirePagePermission(pageKey: string): MiddlewareHandler<HonoEnv> {
  return async (c, next) => {
    const user = c.get('user') as any
    // 비-SPA 초기 페이지 로드: pageAuthMiddleware 가 user 를 set 하지 않음 → 통과.
    // 클라이언트 JS 가 토큰 확인 후 데이터 API 호출 시 다시 권한 검증됨.
    if (!user?.role) return next()
    if (user.role === 'ADMIN') return next()
    const allowed = await getAccessiblePages(c.env.DB, user.role)
    if (!allowed.has(pageKey)) {
      return c.json({ success: false, error: '이 페이지에 접근할 권한이 없습니다' }, 403)
    }
    await next()
  }
}

// 페이지용 ADMIN 전용 가드 (비-SPA 초기 로드에서 user 없으면 통과, SPA에서만 차단).
// requireAdmin(auth.ts)은 API용이라 user 없으면 401 반환 → 페이지 직접 접근 시 깨짐.
export function requireAdminPage(): MiddlewareHandler<HonoEnv> {
  return async (c, next) => {
    const user = c.get('user') as any
    if (!user?.role) return next()
    if (user.role !== 'ADMIN') {
      return c.json({ success: false, error: 'ADMIN 전용 페이지입니다' }, 403)
    }
    await next()
  }
}

// 여러 페이지 중 하나라도 권한이 있으면 통과 (라우터-와이드 가드용).
// 예: PO 데이터 API 는 /purchase-orders 또는 /receiving 페이지에서 사용 → 둘 중 하나만 있어도 OK.
export function requireAnyPagePermission(...pageKeys: string[]): MiddlewareHandler<HonoEnv> {
  return async (c, next) => {
    const user = c.get('user') as any
    if (!user?.role) {
      return c.json({ success: false, error: '인증이 필요합니다' }, 401)
    }
    if (user.role === 'ADMIN') return next()
    const allowed = await getAccessiblePages(c.env.DB, user.role)
    if (!pageKeys.some(k => allowed.has(k))) {
      return c.json({ success: false, error: '이 데이터에 접근할 권한이 없습니다' }, 403)
    }
    await next()
  }
}
