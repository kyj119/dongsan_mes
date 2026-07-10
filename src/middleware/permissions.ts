// 페이지 권한 미들웨어 (DB 기반 + 메모리 캐시)
// 설계: .claude/plans/2026-04-16-permission-management-system.md
// ADMIN 은 모든 페이지 통과. 나머지 역할은 role_page_permissions 매트릭스 기준.
// can_access(열람) / can_edit(편집) 2단 — 0453.

import type { MiddlewareHandler } from 'hono'
import type { HonoEnv } from '../types/env'

interface RolePerm { access: Set<string>; edit: Set<string> }
let _cache: Map<string, RolePerm> | null = null

async function buildCache(db: D1Database): Promise<Map<string, RolePerm>> {
  const { results } = await db
    .prepare('SELECT role, page_key, can_access, can_edit FROM role_page_permissions')
    .all<{ role: string; page_key: string; can_access: number; can_edit: number }>()
  const map = new Map<string, RolePerm>()
  for (const r of results || []) {
    if (!map.has(r.role)) map.set(r.role, { access: new Set(), edit: new Set() })
    const rp = map.get(r.role)!
    if (r.can_access) rp.access.add(r.page_key)
    if (r.can_edit) rp.edit.add(r.page_key)
  }
  return map
}

// ADMIN 은 마스터 전체(모든 활성 페이지) 반환.
async function allActivePages(db: D1Database): Promise<Set<string>> {
  const { results } = await db.prepare('SELECT page_key FROM permission_pages WHERE is_active = 1').all<{ page_key: string }>()
  return new Set((results || []).map(r => r.page_key))
}

export async function getAccessiblePages(db: D1Database, role: string): Promise<Set<string>> {
  if (role === 'ADMIN') return allActivePages(db)
  if (!_cache) _cache = await buildCache(db)
  return _cache.get(role)?.access || new Set()
}

// can_edit=1 인 페이지 집합. ADMIN 은 전체 편집 가능.
export async function getEditablePages(db: D1Database, role: string): Promise<Set<string>> {
  if (role === 'ADMIN') return allActivePages(db)
  if (!_cache) _cache = await buildCache(db)
  return _cache.get(role)?.edit || new Set()
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

// 쓰기(생성/수정/삭제) 가드 — can_edit 기준. 열람은 되지만 편집 불가한 역할을 차단.
// 데이터 API 이므로 user 없으면 401 (요청은 항상 authMiddleware 뒤에 온다).
export function requirePageEdit(pageKey: string): MiddlewareHandler<HonoEnv> {
  return async (c, next) => {
    const user = c.get('user') as any
    if (!user?.role) {
      return c.json({ success: false, error: '인증이 필요합니다' }, 401)
    }
    if (user.role === 'ADMIN') return next()
    const editable = await getEditablePages(c.env.DB, user.role)
    if (!editable.has(pageKey)) {
      return c.json({ success: false, error: '이 데이터를 수정할 권한이 없습니다 (열람 전용)' }, 403)
    }
    await next()
  }
}

// 가산형 쓰기 가드 — 레거시 requireRole 대체용(회귀 0).
//   ADMIN 또는 명시된 legacyRoles 는 매트릭스와 무관하게 통과(기존 동작 보존),
//   그 외 역할(신규 ACCOUNTANT/SALES/FINISHING/SHIPPING 등)은 해당 페이지 can_edit=1 이면 통과.
//   즉 신규 역할은 권한관리 매트릭스로 편집을 통제하고, 기존 역할은 종전 그대로.
//   삭제·토글 등 민감 엔드포인트는 이 가드 대신 requireRole('ADMIN') 유지.
export function requireEditOrRole(pageKey: string, ...legacyRoles: string[]): MiddlewareHandler<HonoEnv> {
  return async (c, next) => {
    const user = c.get('user') as any
    if (!user?.role) {
      return c.json({ success: false, error: '인증이 필요합니다' }, 401)
    }
    if (user.role === 'ADMIN' || legacyRoles.includes(user.role)) return next()
    const editable = await getEditablePages(c.env.DB, user.role)
    if (!editable.has(pageKey)) {
      return c.json({ success: false, error: '이 데이터를 수정할 권한이 없습니다 (열람 전용)' }, 403)
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
