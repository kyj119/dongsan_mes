import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireAdmin } from '../middleware/auth'
import { hashPassword, verifyPassword } from '../utils/crypto'
import { ROLES as VALID_ROLES } from '../types/roles'

export const usersRouter = new Hono<HonoEnv>()

// Apply authentication middleware to all routes
usersRouter.use('/*', authMiddleware)

// GET /api/users — 전체 목록 (ADMIN only)
// 쿼리: ?is_active=1|0 (생략 시 전체)
usersRouter.get('/', requireAdmin, async (c) => {
  try {
    const { is_active } = c.req.query()

    let query = `
      SELECT u.id, u.username, u.name, u.email, u.phone, u.role, u.is_active,
        u.last_login_at, u.created_at, u.updated_at, u.default_entity_id,
        e.short_name as entity_name
      FROM users u
      LEFT JOIN entities e ON e.id = u.default_entity_id
    `
    const params: any[] = []

    if (is_active !== undefined && is_active !== '') {
      query += ` WHERE u.is_active = ?`
      params.push(parseInt(is_active))
    }

    query += ` ORDER BY u.id ASC`

    const stmt = c.env.DB.prepare(query)
    const { results } = params.length > 0
      ? await stmt.bind(...params).all()
      : await stmt.all()

    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('GET /api/users error:', error)
    console.error('src/routes/users.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// POST /api/users/change-password — 본인 비밀번호 변경 (인증된 사용자)
// ※ /:id 라우트보다 먼저 등록해야 충돌 방지
usersRouter.post('/change-password', async (c) => {
  try {
    const user = c.get('user')
    const body = await c.req.json()
    const { current_password, new_password } = body

    if (!current_password || !new_password) {
      return c.json({ success: false, error: '현재 비밀번호와 새 비밀번호를 모두 입력하세요.' }, 400)
    }
    if (new_password.length < 4) {
      return c.json({ success: false, error: '새 비밀번호는 4자 이상이어야 합니다.' }, 400)
    }

    // 현재 비밀번호 확인
    const existing = await c.env.DB.prepare(
      `SELECT id, password_hash FROM users WHERE id = ? AND is_active = 1`
    ).bind(user.id).first() as any

    if (!existing) {
      return c.json({ success: false, error: '사용자를 찾을 수 없습니다.' }, 404)
    }
    const isValid = await verifyPassword(current_password, existing.password_hash)
    if (!isValid) {
      return c.json({ success: false, error: '현재 비밀번호가 올바르지 않습니다.' }, 400)
    }

    const hashedPassword = await hashPassword(new_password)
    await c.env.DB.prepare(
      `UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(hashedPassword, user.id).run()

    return c.json({ success: true, message: '비밀번호가 변경되었습니다.' })
  } catch (error) {
    console.error('POST /api/users/change-password error:', error)
    console.error('src/routes/users.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// POST /api/users — 계정 생성 (ADMIN only)
usersRouter.post('/', requireAdmin, async (c) => {
  try {
    const body = await c.req.json()
    const { username, password, name, email, phone, role, default_entity_id } = body

    if (!username || !password || !name || !role) {
      return c.json({ success: false, error: 'username, password, name, role은 필수입니다.' }, 400)
    }
    if (!VALID_ROLES.includes(role)) {
      return c.json({ success: false, error: `role은 ${VALID_ROLES.join(', ')} 중 하나여야 합니다.` }, 400)
    }

    // username 중복 체크
    const existing = await c.env.DB.prepare(
      `SELECT id FROM users WHERE username = ?`
    ).bind(username).first()
    if (existing) {
      return c.json({ success: false, error: '이미 사용 중인 아이디입니다.' }, 409)
    }

    const hashedPassword = await hashPassword(password)
    const result = await c.env.DB.prepare(`
      INSERT INTO users (username, password_hash, name, email, phone, role, is_active, default_entity_id)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?)
    `).bind(username, hashedPassword, name, email ?? null, phone ?? null, role, default_entity_id || 1).run()

    const created = await c.env.DB.prepare(
      `SELECT id, username, name, email, phone, role, is_active, created_at, updated_at FROM users WHERE rowid = ?`
    ).bind(result.meta.last_row_id).first()

    return c.json({ success: true, data: created }, 201)
  } catch (error) {
    console.error('POST /api/users error:', error)
    console.error('src/routes/users.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// POST /api/users/:id/reset-password — 비밀번호 초기화 (ADMIN only)
usersRouter.post('/:id/reset-password', requireAdmin, async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    if (isNaN(id)) {
      return c.json({ success: false, error: '유효하지 않은 사용자 ID입니다.' }, 400)
    }

    const existing = await c.env.DB.prepare(
      `SELECT id FROM users WHERE id = ? AND is_active = 1`
    ).bind(id).first()
    if (!existing) {
      return c.json({ success: false, error: '사용자를 찾을 수 없습니다.' }, 404)
    }

    const body = await c.req.json().catch(() => ({})) as any
    const newPw = body.password || 'password'

    const hashedPassword = await hashPassword(newPw)
    await c.env.DB.prepare(
      `UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(hashedPassword, id).run()

    return c.json({ success: true, message: '비밀번호가 초기화되었습니다.' })
  } catch (error) {
    console.error('POST /api/users/:id/reset-password error:', error)
    console.error('src/routes/users.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// PATCH /api/users/:id — 사용자 수정 (ADMIN only)
usersRouter.patch('/:id', requireAdmin, async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    if (isNaN(id)) {
      return c.json({ success: false, error: '유효하지 않은 사용자 ID입니다.' }, 400)
    }

    const existing = await c.env.DB.prepare(
      `SELECT id, role, is_active FROM users WHERE id = ?`
    ).bind(id).first<{ id: number; role: string; is_active: number }>()
    if (!existing) {
      return c.json({ success: false, error: '사용자를 찾을 수 없습니다.' }, 404)
    }

    const body = await c.req.json()
    const { name, role, is_active, email, phone, default_entity_id } = body

    // 마지막 활성 ADMIN 강등/비활성화 차단 — 시스템 잠금 방지
    const isCurrentlyActiveAdmin = existing.role === 'ADMIN' && existing.is_active === 1
    const willDemoteRole = role !== undefined && role !== 'ADMIN'
    const willDeactivate = is_active !== undefined && !is_active
    if (isCurrentlyActiveAdmin && (willDemoteRole || willDeactivate)) {
      const cnt = await c.env.DB.prepare(
        `SELECT COUNT(*) as cnt FROM users WHERE role = 'ADMIN' AND is_active = 1 AND id != ?`
      ).bind(id).first<{ cnt: number }>()
      if (!cnt || cnt.cnt === 0) {
        return c.json({
          success: false,
          error: '시스템에 최소 1명의 ADMIN이 필요합니다. 다른 사용자를 ADMIN으로 변경한 후 진행하세요.'
        }, 400)
      }
    }

    const updates: string[] = []
    const params: any[] = []

    if (name !== undefined) {
      updates.push('name = ?')
      params.push(name)
    }
    if (role !== undefined) {
      if (!VALID_ROLES.includes(role)) {
        return c.json({ success: false, error: `role은 ${VALID_ROLES.join(', ')} 중 하나여야 합니다.` }, 400)
      }
      updates.push('role = ?')
      params.push(role)
    }
    if (is_active !== undefined) {
      updates.push('is_active = ?')
      params.push(is_active ? 1 : 0)
    }
    if (email !== undefined) {
      updates.push('email = ?')
      params.push(email)
    }
    if (phone !== undefined) {
      updates.push('phone = ?')
      params.push(phone)
    }
    if (default_entity_id !== undefined) {
      updates.push('default_entity_id = ?')
      params.push(default_entity_id)
    }

    if (updates.length === 0) {
      return c.json({ success: false, error: '수정할 필드가 없습니다.' }, 400)
    }

    updates.push('updated_at = CURRENT_TIMESTAMP')
    params.push(id)

    await c.env.DB.prepare(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...params).run()

    const updated = await c.env.DB.prepare(
      `SELECT id, username, name, email, phone, role, is_active, last_login_at, created_at, updated_at FROM users WHERE id = ?`
    ).bind(id).first()

    return c.json({ success: true, data: updated })
  } catch (error) {
    console.error('PATCH /api/users/:id error:', error)
    console.error('src/routes/users.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

export default usersRouter
