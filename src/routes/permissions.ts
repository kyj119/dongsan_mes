// 권한 관리 API
// 설계: .claude/plans/2026-04-16-permission-management-system.md

import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { invalidatePermissionCache, getAccessiblePages } from '../middleware/permissions'
import { ROLES, ROLE_SET } from '../types/roles'

const permissionsRouter = new Hono<HonoEnv>()
permissionsRouter.use('/*', authMiddleware)

// GET /api/permissions/me - 현재 사용자가 접근 가능한 page_key 배열 (사이드바용, 모든 로그인 사용자)
permissionsRouter.get('/me', async (c) => {
  try {
    const user = c.get('user')
    const allowed = await getAccessiblePages(c.env.DB, user.role)
    return c.json({ success: true, data: { role: user.role, pages: Array.from(allowed) } })
  } catch (err) {
    console.error('permissions /me error:', err)
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// GET /api/permissions/pages - 페이지 마스터 (모든 로그인 사용자)
permissionsRouter.get('/pages', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      `SELECT page_key, page_label, page_section, page_icon, badge_id, sort_order, is_active
       FROM permission_pages
       ORDER BY sort_order, page_key`
    ).all()
    return c.json({ success: true, data: results || [] })
  } catch (err) {
    console.error('permissions /pages error:', err)
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// GET /api/permissions/matrix - 역할×페이지 매트릭스 (ADMIN only)
permissionsRouter.get('/matrix', requireRole('ADMIN'), async (c) => {
  try {
    const [pagesRes, permsRes] = await Promise.all([
      c.env.DB.prepare(
        `SELECT page_key, page_label, page_section, page_icon, sort_order
         FROM permission_pages WHERE is_active = 1
         ORDER BY sort_order, page_key`
      ).all(),
      c.env.DB.prepare(
        `SELECT role, page_key, can_access FROM role_page_permissions WHERE can_access = 1`
      ).all<{ role: string; page_key: string; can_access: number }>(),
    ])
    const matrix: Record<string, Record<string, number>> = {}
    for (const r of ROLES) matrix[r] = {}
    for (const p of permsRes.results || []) {
      if (!matrix[p.role]) matrix[p.role] = {}
      matrix[p.role][p.page_key] = 1
    }
    return c.json({ success: true, data: { pages: pagesRes.results || [], matrix } })
  } catch (err) {
    console.error('permissions /matrix error:', err)
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// PATCH /api/permissions - 매트릭스 일괄 업데이트 (ADMIN only)
// body: [{ role, page_key, can_access }]
permissionsRouter.patch('/', requireRole('ADMIN'), async (c) => {
  try {
    const updates = (await c.req.json()) as Array<{ role: string; page_key: string; can_access: number }>
    if (!Array.isArray(updates)) {
      return c.json({ success: false, error: 'updates 배열이 필요합니다' }, 400)
    }
    if (updates.length === 0) {
      return c.json({ success: true, updated: 0 })
    }
    const user = c.get('user')
    for (const u of updates) {
      if (!ROLE_SET.has(u.role)) {
        return c.json({ success: false, error: `잘못된 역할: ${u.role}` }, 400)
      }
      if (u.role === 'ADMIN') {
        return c.json({ success: false, error: 'ADMIN 권한은 편집할 수 없습니다' }, 400)
      }
    }
    const stmts = updates.map(u =>
      c.env.DB.prepare(
        `INSERT INTO role_page_permissions (role, page_key, can_access, updated_by, updated_at)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(role, page_key) DO UPDATE SET
           can_access = excluded.can_access,
           updated_by = excluded.updated_by,
           updated_at = CURRENT_TIMESTAMP`
      ).bind(u.role, u.page_key, u.can_access ? 1 : 0, user.id)
    )
    await c.env.DB.batch(stmts)
    invalidatePermissionCache()
    return c.json({ success: true, updated: updates.length })
  } catch (err) {
    console.error('permissions PATCH error:', err)
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// 코드 레벨에서 ADMIN-only 로 하드 가드된 페이지 — 권한 토글해도 접근 불가하므로 요청 차단.
// 신규 ADMIN-only 페이지 추가 시 여기도 등록.
const HARD_ADMIN_ONLY_PAGES = new Set<string>([
  '/permissions',
])

// POST /api/permissions/request - 사용자가 ADMIN에게 페이지 권한 부여 요청 (notifications 생성)
// body: { page_key: '/orders' } — page_key 가 마스터에 존재해야 함. 당일 동일 사용자+페이지 중복 차단.
permissionsRouter.post('/request', async (c) => {
  try {
    const user = c.get('user')
    const body = await c.req.json().catch(() => ({})) as { page_key?: string }
    const pageKey = body.page_key
    if (!pageKey || typeof pageKey !== 'string') {
      return c.json({ success: false, error: 'page_key 가 필요합니다' }, 400)
    }
    if (HARD_ADMIN_ONLY_PAGES.has(pageKey)) {
      return c.json({ success: false, error: '이 페이지는 ADMIN 전용으로 설정되어 권한 부여가 불가능합니다.' }, 403)
    }
    // 페이지 존재 확인 + 라벨 조회
    const page = await c.env.DB.prepare(
      `SELECT page_key, page_label FROM permission_pages WHERE page_key = ? AND is_active = 1`
    ).bind(pageKey).first<{ page_key: string; page_label: string }>()
    if (!page) {
      return c.json({ success: false, error: '존재하지 않는 페이지입니다' }, 404)
    }
    // 이미 권한이 있으면 거부
    const allowed = await getAccessiblePages(c.env.DB, user.role)
    if (allowed.has(pageKey)) {
      return c.json({ success: false, error: '이미 접근 권한이 있습니다' }, 400)
    }
    // 당일 동일 요청 중복 차단 (스팸 방지)
    const userName = user.username || `#${user.id}`
    const title = `[권한 요청] ${userName} → ${page.page_label}`
    const dup = await c.env.DB.prepare(
      `SELECT id FROM notifications WHERE target_role = 'ADMIN' AND title = ? AND date(created_at) = date('now') LIMIT 1`
    ).bind(title).first()
    if (dup) {
      return c.json({ success: false, error: '오늘 이미 동일한 요청을 보내셨습니다. ADMIN 처리를 기다려주세요.' }, 429)
    }
    const message = `${userName} (${user.role}) 님이 "${page.page_label}" (${pageKey}) 페이지 접근 권한을 요청합니다.`
    await c.env.DB.prepare(
      `INSERT INTO notifications (target_role, title, message, link) VALUES ('ADMIN', ?, ?, '/permissions')`
    ).bind(title, message).run()
    return c.json({ success: true, message: 'ADMIN에게 요청이 전송되었습니다.' })
  } catch (err) {
    console.error('permissions /request error:', err)
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

export default permissionsRouter
