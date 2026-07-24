import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireAdmin } from '../middleware/auth'
import { hashPassword, verifyPassword } from '../utils/crypto'
import { ROLES as VALID_ROLES, toLegacyRole } from '../types/roles'
import { logActivity } from '../utils/activityLog'
import { getEntityId } from '../utils/entityFilter'

export const usersRouter = new Hono<HonoEnv>()

// Apply authentication middleware to all routes
usersRouter.use('/*', authMiddleware)

// GET /api/users — 전체 목록 (ADMIN only)
// 쿼리: ?is_active=1|0 (생략 시 전체)
usersRouter.get('/', requireAdmin, async (c) => {
  try {
    const { is_active } = c.req.query()

    let query = `
      SELECT u.id, u.username, u.name, u.email, u.phone, COALESCE(u.job_role, u.role) AS role, u.is_active,
        u.last_login_at, u.created_at, u.updated_at, u.default_entity_id, u.is_coordinator,
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
    ).bind(user.id).first<{ id: number; password_hash: string }>()

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
    const { username, password, name, email, phone, role, default_entity_id, is_coordinator } = body

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
    // 확장 역할은 job_role 에 저장, role 엔 CHECK-안전 대체값(레거시 역할).
    const result = await c.env.DB.prepare(`
      INSERT INTO users (username, password_hash, name, email, phone, role, job_role, is_active, default_entity_id, is_coordinator)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).bind(username, hashedPassword, name, email ?? null, phone ?? null, toLegacyRole(role), role, default_entity_id || 1, is_coordinator ? 1 : 0).run()

    const created = await c.env.DB.prepare(
      `SELECT id, username, name, email, phone, COALESCE(job_role, role) AS role, is_active, created_at, updated_at FROM users WHERE rowid = ?`
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

    const body = await c.req.json().catch(() => ({})) as { password?: string }
    // #338: 예측 가능한 기본값('password') 제거 — 비밀번호 필수화
    const newPw = typeof body.password === 'string' ? body.password.trim() : ''
    if (!newPw) {
      return c.json({ success: false, error: '새 비밀번호를 입력하세요.' }, 400)
    }

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
      `SELECT id, COALESCE(job_role, role) AS role, is_active FROM users WHERE id = ?`
    ).bind(id).first<{ id: number; role: string; is_active: number }>()
    if (!existing) {
      return c.json({ success: false, error: '사용자를 찾을 수 없습니다.' }, 404)
    }

    const body = await c.req.json()
    const { name, role, is_active, email, phone, default_entity_id, is_coordinator } = body

    // 마지막 활성 ADMIN 강등/비활성화 차단 — 시스템 잠금 방지
    const isCurrentlyActiveAdmin = existing.role === 'ADMIN' && existing.is_active === 1
    const willDemoteRole = role !== undefined && role !== 'ADMIN'
    const willDeactivate = is_active !== undefined && !is_active
    if (isCurrentlyActiveAdmin && (willDemoteRole || willDeactivate)) {
      const cnt = await c.env.DB.prepare(
        `SELECT COUNT(*) as cnt FROM users WHERE COALESCE(job_role, role) = 'ADMIN' AND is_active = 1 AND id != ?`
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
      // 확장 역할은 job_role 에, role 컬럼엔 CHECK-안전 대체값.
      updates.push('job_role = ?')
      params.push(role)
      updates.push('role = ?')
      params.push(toLegacyRole(role))
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
    if (is_coordinator !== undefined) {
      updates.push('is_coordinator = ?')
      params.push(is_coordinator ? 1 : 0)
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
      `SELECT id, username, name, email, phone, COALESCE(job_role, role) AS role, is_active, last_login_at, created_at, updated_at FROM users WHERE id = ?`
    ).bind(id).first()

    return c.json({ success: true, data: updated })
  } catch (error) {
    console.error('PATCH /api/users/:id error:', error)
    console.error('src/routes/users.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// DELETE /api/users/:id/hard — 하드(완전) 삭제 (ADMIN only). "참조 0건 가드".
//   users 를 참조하는 모든 FK를 PRAGMA foreign_key_list 로 동적 열거해 카운트.
//   비-CASCADE 참조(주문·카드·감사 등)가 하나라도 있으면 차단 → 비활성화 권장.
//   CASCADE FK(user_sessions 등 소유·휘발성)와 비FK 소유테이블(user_item_access)은 자동 정리.
usersRouter.delete('/:id/hard', requireAdmin, async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    if (isNaN(id)) {
      return c.json({ success: false, error: '유효하지 않은 사용자 ID입니다.' }, 400)
    }

    const actor = c.get('user')
    if (actor?.id === id) {
      return c.json({ success: false, error: '본인 계정은 하드 삭제할 수 없습니다.' }, 400)
    }

    const target = await c.env.DB.prepare(
      `SELECT id, username, name, COALESCE(job_role, role) AS role, is_active FROM users WHERE id = ?`
    ).bind(id).first<{ id: number; username: string; name: string; role: string; is_active: number }>()
    if (!target) {
      return c.json({ success: false, error: '사용자를 찾을 수 없습니다.' }, 404)
    }

    // 마지막 활성 ADMIN 삭제 차단 — 시스템 잠금 방지
    if (target.role === 'ADMIN') {
      const cnt = await c.env.DB.prepare(
        `SELECT COUNT(*) as cnt FROM users WHERE COALESCE(job_role, role) = 'ADMIN' AND is_active = 1 AND id != ?`
      ).bind(id).first<{ cnt: number }>()
      if (!cnt || cnt.cnt === 0) {
        return c.json({ success: false, error: '시스템에 최소 1명의 ADMIN이 필요합니다. 다른 ADMIN을 둔 뒤 삭제하세요.' }, 400)
      }
    }

    // users 를 참조하는 모든 FK 동적 열거 (PRAGMA foreign_key_list)
    const { results: tableRows } = await c.env.DB.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`
    ).all<{ name: string }>()

    const blockers: Array<{ table: string; column: string; count: number }> = []
    const cascadeChildren: Array<{ table: string; column: string }> = []
    const seenCascade = new Set<string>()
    let capped = false

    for (const t of tableRows) {
      if (capped) break
      const tName = t.name
      if (!/^[A-Za-z0-9_]+$/.test(tName) || tName === 'users' || tName.startsWith('_cf_')) continue
      let fkRows: Array<{ table: string; from: string; on_delete: string }> = []
      try {
        const r = await c.env.DB.prepare(`PRAGMA foreign_key_list(${tName})`).all<{ table: string; from: string; on_delete: string }>()
        fkRows = r.results || []
      } catch { continue }
      for (const fk of fkRows) {
        if (fk.table !== 'users') continue
        const col = fk.from
        if (!/^[A-Za-z0-9_]+$/.test(col)) continue
        const cntRow = await c.env.DB.prepare(
          `SELECT COUNT(*) as c FROM "${tName}" WHERE "${col}" = ?`
        ).bind(id).first<{ c: number }>()
        const n = cntRow?.c || 0
        if (n <= 0) continue
        if ((fk.on_delete || '').toUpperCase() === 'CASCADE') {
          const key = tName + '.' + col
          if (!seenCascade.has(key)) { seenCascade.add(key); cascadeChildren.push({ table: tName, column: col }) }
        } else {
          blockers.push({ table: tName, column: col, count: n })
          if (blockers.length >= 20) { capped = true; break } // 차단 확정 — 나열은 20건까지만
        }
      }
    }

    if (blockers.length > 0) {
      return c.json({
        success: false,
        error: '다른 데이터에서 참조 중이라 하드 삭제할 수 없습니다. 비활성화를 권장합니다.',
        references: blockers
      }, 409)
    }

    // 소유/휘발성 정리 + 사용자 삭제 (원자적 배치 — 자식 먼저, 부모 나중)
    // CASCADE FK(세션 등)는 cascadeChildren 로 이미 포함. user_item_access 는 비FK 소유테이블이라
    // 명시 정리하되, DB마다 테이블 유무가 달라 존재할 때만(하드코딩 테이블 없으면 500 방지).
    const tableSet = new Set((tableRows || []).map((t) => t.name))
    const stmts = []
    for (const ch of cascadeChildren) {
      stmts.push(c.env.DB.prepare(`DELETE FROM "${ch.table}" WHERE "${ch.column}" = ?`).bind(id))
    }
    if (tableSet.has('user_item_access')) {
      stmts.push(c.env.DB.prepare(`DELETE FROM user_item_access WHERE user_id = ?`).bind(id))
    }
    stmts.push(c.env.DB.prepare(`DELETE FROM users WHERE id = ?`).bind(id))
    await c.env.DB.batch(stmts)

    await logActivity({
      db: c.env.DB, userId: actor?.id, userName: actor?.username,
      action: 'HARD_DELETE', entityType: 'USER', entityId: id,
      entityLabel: target.username,
      details: JSON.stringify({ name: target.name, role: target.role, cleaned: cascadeChildren.map((x) => x.table) }),
      actorEntityId: getEntityId(c)
    })

    return c.json({ success: true, message: '사용자가 완전 삭제되었습니다.' })
  } catch (error) {
    console.error('DELETE /api/users/:id/hard error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ── C2: 사용자별 사용품목(item_group) 배정 ──────────────────────────
// GET /:id/item-access — 사용자 허용 그룹 목록
usersRouter.get('/:id/item-access', requireAdmin, async (c) => {
  try {
    const id = c.req.param('id')
    const { results } = await c.env.DB.prepare(
      'SELECT item_group FROM user_item_access WHERE user_id = ? ORDER BY item_group'
    ).bind(id).all<{ item_group: string }>()
    return c.json({ success: true, data: { groups: results.map((r) => r.item_group) } })
  } catch (error) {
    console.error('GET /api/users/:id/item-access error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// PUT /:id/item-access — 허용 그룹 일괄 교체 (body: { groups: string[] })
usersRouter.put('/:id/item-access', requireAdmin, async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json().catch(() => ({})) as { groups?: string[] }
    const groups = Array.isArray(body.groups) ? body.groups.filter((g) => g && String(g).trim()) : []
    await c.env.DB.prepare('DELETE FROM user_item_access WHERE user_id = ?').bind(id).run()
    if (groups.length > 0) {
      // 청크 (바인드 한도) — user_id + group 2바인드/행, 80행 청크
      for (let i = 0; i < groups.length; i += 80) {
        const chunk = groups.slice(i, i + 80)
        const ph = chunk.map(() => '(?, ?)').join(', ')
        const binds: any[] = []
        chunk.forEach((g) => { binds.push(id, g) })
        await c.env.DB.prepare(
          `INSERT OR IGNORE INTO user_item_access (user_id, item_group) VALUES ${ph}`
        ).bind(...binds).run()
      }
    }
    return c.json({ success: true, data: { count: groups.length } })
  } catch (error) {
    console.error('PUT /api/users/:id/item-access error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

export default usersRouter
