// ============================================================================
// 연락처 그룹 (/api/contact-groups) — 메시지 대량발송 대상 그룹
//
// 정적(수동 지정) 그룹. 거래처는 법인 공유 자산이라 그룹도 전사 공유(entity 필터 없음).
// 멤버는 참조만 저장하고 연락처는 발송 시점에 clients/employees에서 조회한다
//   → 거래처 전화번호가 바뀌어도 그룹을 다시 손댈 필요가 없다(스냅샷 금지).
// ============================================================================

import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'

const contactGroupsRouter = new Hono<HonoEnv>()
contactGroupsRouter.use('/*', authMiddleware, requireRole('ADMIN', 'MANAGER'))

type MemberType = 'CLIENT' | 'EMPLOYEE'

function normalizeMemberType(v: unknown): MemberType {
  return String(v || 'CLIENT').toUpperCase() === 'EMPLOYEE' ? 'EMPLOYEE' : 'CLIENT'
}

// ── GET / — 그룹 목록 (멤버 수 포함) ────────────────────────────────────────
contactGroupsRouter.get('/', async (c) => {
  try {
    const includeInactive = c.req.query('include_inactive') === '1'
    const { results } = await c.env.DB.prepare(`
      SELECT g.id, g.name, g.description, g.is_active, g.created_at, g.updated_at,
             u.name AS created_by_name,
             (SELECT COUNT(*) FROM contact_group_members m WHERE m.group_id = g.id) AS member_count
      FROM contact_groups g
      LEFT JOIN users u ON g.created_by = u.id
      ${includeInactive ? '' : 'WHERE g.is_active = 1'}
      ORDER BY g.name
    `).all()
    return c.json({ success: true, data: results || [] })
  } catch (error) {
    console.error('src/routes/contactGroups.ts GET / error:', error)
    return c.json({ success: false, error: '그룹 목록 조회 실패' }, 500)
  }
})

// ── GET /:id/members — 그룹 멤버 + 연락처(발송 대상 미리보기와 동일 소스) ──
contactGroupsRouter.get('/:id/members', async (c) => {
  try {
    const groupId = parseInt(c.req.param('id'), 10)
    if (!groupId) return c.json({ success: false, error: '그룹 ID가 올바르지 않습니다.' }, 400)

    const { results: rows } = await c.env.DB.prepare(
      `SELECT member_type, member_id FROM contact_group_members WHERE group_id = ? ORDER BY id`
    ).bind(groupId).all<{ member_type: string; member_id: number }>()

    const clientIds = (rows || []).filter(r => r.member_type === 'CLIENT').map(r => r.member_id)
    const employeeIds = (rows || []).filter(r => r.member_type === 'EMPLOYEE').map(r => r.member_id)

    const members: Array<{ member_type: string; member_id: number; name: string; phone: string; email: string }> = []

    // D1 바인드 파라미터 한도(~100) → 80개 청크 분할 [[d1-bind-param-limit]]
    for (let i = 0; i < clientIds.length; i += 80) {
      const chunk = clientIds.slice(i, i + 80)
      const ph = chunk.map(() => '?').join(',')
      const { results } = await c.env.DB.prepare(
        // #580: 비활성 거래처 제외 — 형제 경로(employees)의 is_deleted=0과 대칭.
        // 거래처 삭제는 soft delete(clients.ts SET is_active=0)라 필터가 없으면
        // 거래 종료·폐업 거래처가 대량발송(MMS 100원/건) 대상에 그대로 포함된다.
        // 제외분은 아래 orphan_count에 잡혀 UI 경고로 노출된다(주석·경고 문구의 원래 전제).
        `SELECT id, client_name, mobile, phone, email FROM clients WHERE id IN (${ph}) AND is_active = 1`
      ).bind(...chunk).all<{ id: number; client_name: string; mobile: string; phone: string; email: string }>()
      for (const r of results || []) {
        members.push({
          member_type: 'CLIENT', member_id: r.id, name: r.client_name || '',
          phone: r.mobile || r.phone || '', email: r.email || '',
        })
      }
    }
    for (let i = 0; i < employeeIds.length; i += 80) {
      const chunk = employeeIds.slice(i, i + 80)
      const ph = chunk.map(() => '?').join(',')
      const { results } = await c.env.DB.prepare(
        `SELECT id, name, phone, email FROM employees WHERE id IN (${ph}) AND is_deleted = 0`
      ).bind(...chunk).all<{ id: number; name: string; phone: string; email: string }>()
      for (const r of results || []) {
        members.push({ member_type: 'EMPLOYEE', member_id: r.id, name: r.name || '', phone: r.phone || '', email: r.email || '' })
      }
    }

    return c.json({
      success: true,
      data: {
        members,
        total: members.length,
        // 연락처가 비어 발송 대상에서 빠질 멤버 — UI가 경고로 노출
        missing_phone: members.filter(m => !m.phone).length,
        // 멤버 행은 있는데 거래처/직원이 조회되지 않는 건수(하드삭제·비활성 등).
        // 그룹 목록의 member_count와 실제 발송 대상 수가 어긋나는 원인이라 명시적으로 돌려준다.
        orphan_count: (rows || []).length - members.length,
      }
    })
  } catch (error) {
    console.error('src/routes/contactGroups.ts GET /:id/members error:', error)
    return c.json({ success: false, error: '그룹 멤버 조회 실패' }, 500)
  }
})

// ── POST / — 그룹 생성 ──────────────────────────────────────────────────────
contactGroupsRouter.post('/', async (c) => {
  try {
    const body = await c.req.json() as any
    const name = String(body.name || '').trim()
    if (!name) return c.json({ success: false, error: '그룹명은 필수입니다.' }, 400)

    const dup = await c.env.DB.prepare('SELECT id FROM contact_groups WHERE name = ?').bind(name).first()
    if (dup) return c.json({ success: false, error: '같은 이름의 그룹이 이미 있습니다.' }, 409)

    const res = await c.env.DB.prepare(
      `INSERT INTO contact_groups (name, description, created_by) VALUES (?, ?, ?)`
    ).bind(name, String(body.description || '').trim() || null, c.get('user').id).run()

    return c.json({ success: true, data: { id: res.meta.last_row_id, name } })
  } catch (error) {
    console.error('src/routes/contactGroups.ts POST / error:', error)
    return c.json({ success: false, error: '그룹 생성 실패' }, 500)
  }
})

// ── PATCH /:id — 그룹 수정(이름·설명·활성) ──────────────────────────────────
contactGroupsRouter.patch('/:id', async (c) => {
  try {
    const groupId = parseInt(c.req.param('id'), 10)
    if (!groupId) return c.json({ success: false, error: '그룹 ID가 올바르지 않습니다.' }, 400)
    const body = await c.req.json() as any

    const sets: string[] = []
    const binds: any[] = []
    if (body.name !== undefined) {
      const name = String(body.name).trim()
      if (!name) return c.json({ success: false, error: '그룹명은 비울 수 없습니다.' }, 400)
      const dup = await c.env.DB.prepare('SELECT id FROM contact_groups WHERE name = ? AND id != ?').bind(name, groupId).first()
      if (dup) return c.json({ success: false, error: '같은 이름의 그룹이 이미 있습니다.' }, 409)
      sets.push('name = ?'); binds.push(name)
    }
    if (body.description !== undefined) { sets.push('description = ?'); binds.push(String(body.description).trim() || null) }
    if (body.is_active !== undefined) { sets.push('is_active = ?'); binds.push(body.is_active ? 1 : 0) }
    if (sets.length === 0) return c.json({ success: false, error: '변경할 항목이 없습니다.' }, 400)

    sets.push("updated_at = datetime('now')")
    await c.env.DB.prepare(`UPDATE contact_groups SET ${sets.join(', ')} WHERE id = ?`).bind(...binds, groupId).run()
    return c.json({ success: true })
  } catch (error) {
    console.error('src/routes/contactGroups.ts PATCH /:id error:', error)
    return c.json({ success: false, error: '그룹 수정 실패' }, 500)
  }
})

// ── DELETE /:id — 그룹 삭제 (멤버는 CASCADE) ────────────────────────────────
contactGroupsRouter.delete('/:id', async (c) => {
  try {
    const groupId = parseInt(c.req.param('id'), 10)
    if (!groupId) return c.json({ success: false, error: '그룹 ID가 올바르지 않습니다.' }, 400)
    // D1은 기본적으로 FK가 켜져 있으나, 환경차 대비 멤버를 명시 삭제 후 그룹 삭제
    await c.env.DB.prepare('DELETE FROM contact_group_members WHERE group_id = ?').bind(groupId).run()
    await c.env.DB.prepare('DELETE FROM contact_groups WHERE id = ?').bind(groupId).run()
    return c.json({ success: true })
  } catch (error) {
    console.error('src/routes/contactGroups.ts DELETE /:id error:', error)
    return c.json({ success: false, error: '그룹 삭제 실패' }, 500)
  }
})

// ── POST /:id/members — 멤버 추가(배열, 중복 무시) ──────────────────────────
contactGroupsRouter.post('/:id/members', async (c) => {
  try {
    const groupId = parseInt(c.req.param('id'), 10)
    if (!groupId) return c.json({ success: false, error: '그룹 ID가 올바르지 않습니다.' }, 400)
    const body = await c.req.json() as any
    const rawMembers: any[] = Array.isArray(body.members) ? body.members : []
    if (rawMembers.length === 0) return c.json({ success: false, error: '추가할 대상이 없습니다.' }, 400)

    const group = await c.env.DB.prepare('SELECT id FROM contact_groups WHERE id = ?').bind(groupId).first()
    if (!group) return c.json({ success: false, error: '그룹을 찾을 수 없습니다.' }, 404)

    const stmts = []
    for (const m of rawMembers) {
      const memberId = parseInt(String(m.member_id ?? m.id), 10)
      if (!memberId) continue
      stmts.push(
        c.env.DB.prepare(
          `INSERT OR IGNORE INTO contact_group_members (group_id, member_type, member_id) VALUES (?, ?, ?)`
        ).bind(groupId, normalizeMemberType(m.member_type), memberId)
      )
    }
    if (stmts.length === 0) return c.json({ success: false, error: '유효한 대상이 없습니다.' }, 400)
    await c.env.DB.batch(stmts)

    const cnt = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM contact_group_members WHERE group_id = ?')
      .bind(groupId).first<{ n: number }>()
    return c.json({ success: true, data: { member_count: cnt?.n || 0 } })
  } catch (error) {
    console.error('src/routes/contactGroups.ts POST /:id/members error:', error)
    return c.json({ success: false, error: '멤버 추가 실패' }, 500)
  }
})

// ── DELETE /:id/members/:memberType/:memberId — 멤버 1건 제거 ───────────────
contactGroupsRouter.delete('/:id/members/:memberType/:memberId', async (c) => {
  try {
    const groupId = parseInt(c.req.param('id'), 10)
    const memberId = parseInt(c.req.param('memberId'), 10)
    if (!groupId || !memberId) return c.json({ success: false, error: '파라미터가 올바르지 않습니다.' }, 400)
    await c.env.DB.prepare(
      'DELETE FROM contact_group_members WHERE group_id = ? AND member_type = ? AND member_id = ?'
    ).bind(groupId, normalizeMemberType(c.req.param('memberType')), memberId).run()
    return c.json({ success: true })
  } catch (error) {
    console.error('src/routes/contactGroups.ts DELETE member error:', error)
    return c.json({ success: false, error: '멤버 제거 실패' }, 500)
  }
})

export default contactGroupsRouter
