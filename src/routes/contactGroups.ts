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
import { entityFilter } from '../utils/entityFilter'
import {
  resolveSegment, parseSegmentFilter, buildMatchedReason,
  SEGMENT_KEYS, SEGMENT_LABELS, SEGMENT_HINTS,
} from '../services/clientSegment'

const contactGroupsRouter = new Hono<HonoEnv>()
contactGroupsRouter.use('/*', authMiddleware, requireRole('ADMIN', 'MANAGER'))

type MemberType = 'CLIENT' | 'EMPLOYEE'

function normalizeMemberType(v: unknown): MemberType {
  return String(v || 'CLIENT').toUpperCase() === 'EMPLOYEE' ? 'EMPLOYEE' : 'CLIENT'
}

/**
 * filter_json 을 저장 가능한 문자열로 정규화한다. null = 조건 없는 수동 그룹.
 * 빈 조건({})도 "전 법인·전 묶음·최근 12개월"이라는 유효한 조건이므로 null 과 구분해야 한다.
 */
function serializeFilter(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null
  return JSON.stringify(parseSegmentFilter(raw))
}

// ── GET / — 그룹 목록 (멤버 수 포함) ────────────────────────────────────────
contactGroupsRouter.get('/', async (c) => {
  try {
    const includeInactive = c.req.query('include_inactive') === '1'
    const { results } = await c.env.DB.prepare(`
      SELECT g.id, g.name, g.description, g.is_active, g.created_at, g.updated_at,
             g.filter_json, g.synced_at,
             u.name AS created_by_name,
             (SELECT COUNT(*) FROM contact_group_members m WHERE m.group_id = g.id) AS member_count,
             (SELECT COUNT(*) FROM contact_group_members m WHERE m.group_id = g.id AND m.source = 'AUTO') AS auto_count
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

// ── GET /segment-options — 조건 선택기용 메타(품목묶음·법인) ────────────────
// 라벨을 프론트에 하드코딩하면 서버 판정 규칙과 어긋난다 → 서버가 내려준다.
// ⚠️ `/:id` 형태 라우트보다 먼저 등록해야 한다(경로 선점).
contactGroupsRouter.get('/segment-options', async (c) => {
  try {
    // E2E 전용 법인(99)은 발송 대상 선택에 노출하지 않는다 [[feedback-e2e-entity]]
    const { results } = await c.env.DB.prepare(
      'SELECT id, name FROM entities WHERE id < 99 ORDER BY id'
    ).all<{ id: number; name: string }>()
    return c.json({
      success: true,
      data: {
        segments: SEGMENT_KEYS.map(k => ({ key: k, label: SEGMENT_LABELS[k], hint: SEGMENT_HINTS[k] })),
        entities: results || [],
      },
    })
  } catch (error) {
    console.error('src/routes/contactGroups.ts GET /segment-options error:', error)
    return c.json({ success: false, error: '조건 옵션 조회 실패' }, 500)
  }
})

// ── POST /preview — 조건으로 대상 산출(과금 없음, 저장 없음) ────────────────
// 발송 전에 "몇 명·얼마"를 반드시 눈으로 보게 한다. 그룹을 만들지 않고도 쓸 수 있어
// 명절 공지처럼 1회성 발송은 여기서 바로 수신자를 채운다.
contactGroupsRouter.post('/preview', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({})) as any
    const seg = await resolveSegment(c.env.DB, body.filter ?? body)
    const includeList = body.include_list === true

    return c.json({
      success: true,
      data: {
        filter: seg.filter,
        matched: seg.matched,
        sendable: seg.clients.length,
        no_phone: seg.no_phone,
        merged_duplicate: seg.merged_duplicate,
        // 명단 검증용 상위 표본 — 전량은 include_list=true 일 때만(수신자 채우기 경로)
        sample: seg.clients.slice(0, 20).map(x => ({
          client_id: x.client_id, name: x.name, phone: x.phone,
          segments: x.segments, last_order_date: x.last_order_date, amount: x.amount,
        })),
        clients: includeList ? seg.clients : undefined,
      },
    })
  } catch (error) {
    console.error('src/routes/contactGroups.ts POST /preview error:', error)
    return c.json({ success: false, error: '대상 미리보기 실패' }, 500)
  }
})

// ── GET /:id/members — 그룹 멤버 + 연락처(발송 대상 미리보기와 동일 소스) ──
contactGroupsRouter.get('/:id/members', async (c) => {
  try {
    const groupId = parseInt(c.req.param('id'), 10)
    if (!groupId) return c.json({ success: false, error: '그룹 ID가 올바르지 않습니다.' }, 400)

    const { results: rows } = await c.env.DB.prepare(
      `SELECT member_type, member_id, source, matched_reason
         FROM contact_group_members WHERE group_id = ? ORDER BY id`
    ).bind(groupId).all<{ member_type: string; member_id: number; source: string; matched_reason: string | null }>()

    const clientIds = (rows || []).filter(r => r.member_type === 'CLIENT').map(r => r.member_id)
    const employeeIds = (rows || []).filter(r => r.member_type === 'EMPLOYEE').map(r => r.member_id)
    // 멤버 행의 근거(왜 들어왔는지)를 조회 결과에 다시 붙이기 위한 색인
    const metaOf = new Map<string, { source: string; matched_reason: string | null }>()
    for (const r of rows || []) {
      metaOf.set(`${r.member_type}:${r.member_id}`, { source: r.source || 'MANUAL', matched_reason: r.matched_reason })
    }

    const members: Array<{
      member_type: string; member_id: number; name: string; phone: string; email: string
      source: string; matched_reason: string | null
    }> = []

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
        const meta = metaOf.get(`CLIENT:${r.id}`)
        members.push({
          member_type: 'CLIENT', member_id: r.id, name: r.client_name || '',
          phone: r.mobile || r.phone || '', email: r.email || '',
          source: meta?.source || 'MANUAL', matched_reason: meta?.matched_reason ?? null,
        })
      }
    }
    // 그룹 자체는 전사 공유지만 employees 는 법인 소유(0148)다 — 필터가 없으면 타법인 직원의
    // 이름·전화·이메일(PII)이 그대로 응답에 실린다. 제외분은 위 clients 와 같이 orphan_count 로 잡힌다.
    const efEmp = entityFilter(c)
    for (let i = 0; i < employeeIds.length; i += 80) {
      const chunk = employeeIds.slice(i, i + 80)
      const ph = chunk.map(() => '?').join(',')
      const { results } = await c.env.DB.prepare(
        `SELECT id, name, phone, email FROM employees WHERE id IN (${ph}) AND is_deleted = 0${efEmp.clause}`
      ).bind(...chunk, ...efEmp.params).all<{ id: number; name: string; phone: string; email: string }>()
      for (const r of results || []) {
        const meta = metaOf.get(`EMPLOYEE:${r.id}`)
        members.push({
          member_type: 'EMPLOYEE', member_id: r.id, name: r.name || '', phone: r.phone || '', email: r.email || '',
          source: meta?.source || 'MANUAL', matched_reason: meta?.matched_reason ?? null,
        })
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
      `INSERT INTO contact_groups (name, description, filter_json, created_by) VALUES (?, ?, ?, ?)`
    ).bind(
      name,
      String(body.description || '').trim() || null,
      serializeFilter(body.filter),
      c.get('user').id,
    ).run()

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
    // filter: null 을 명시하면 조건을 떼고 순수 수동 그룹으로 되돌린다(멤버는 그대로 남는다)
    if (body.filter !== undefined) { sets.push('filter_json = ?'); binds.push(serializeFilter(body.filter)) }
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

    // 직원은 법인 소유(0148)라 담는 시점에 막는다 — 조회 필터만 두면 행은 들어가고 화면에서만 사라져
    // member_count 와 실제 대상 수가 영구히 어긋난다(orphan_count 로 잡히지만 원인은 안 보인다).
    const empIds = rawMembers
      .filter(m => normalizeMemberType(m.member_type) === 'EMPLOYEE')
      .map(m => parseInt(String(m.member_id ?? m.id), 10))
      .filter(n => !!n)
    const foreignEmpIds = new Set<number>()
    const efAdd = entityFilter(c)
    if (efAdd.clause && empIds.length > 0) {
      const uniq = [...new Set(empIds)]
      for (let i = 0; i < uniq.length; i += 80) {
        const chunk = uniq.slice(i, i + 80)
        const ph = chunk.map(() => '?').join(',')
        const { results } = await c.env.DB.prepare(
          `SELECT id FROM employees WHERE id IN (${ph})${efAdd.clause}`
        ).bind(...chunk, ...efAdd.params).all<{ id: number }>()
        const owned = new Set((results || []).map(r => r.id))
        for (const id of chunk) if (!owned.has(id)) foreignEmpIds.add(id)
      }
    }
    if (foreignEmpIds.size > 0) {
      return c.json({ success: false, error: `다른 법인 소속 직원은 담을 수 없습니다(${foreignEmpIds.size}명).` }, 400)
    }

    const stmts = []
    for (const m of rawMembers) {
      const memberId = parseInt(String(m.member_id ?? m.id), 10)
      if (!memberId) continue
      // 손으로 담은 멤버는 MANUAL — 조건 갱신(sync)이 지우지 않는다.
      stmts.push(
        c.env.DB.prepare(
          `INSERT OR IGNORE INTO contact_group_members (group_id, member_type, member_id, source) VALUES (?, ?, ?, 'MANUAL')`
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

// ── POST /:id/sync — 조건으로 멤버 채우기(갱신) ────────────────────────────
// ★AUTO 멤버만 교체한다. 손으로 담은 MANUAL 멤버는 보존 — 이게 없으면 갱신 한 번에
//   수동으로 관리하던 대상이 조용히 사라진다.
// dry_run=true 면 반영하지 않고 diff(추가/제거)만 돌려준다 — 확인 후 확정하는 흐름.
contactGroupsRouter.post('/:id/sync', async (c) => {
  try {
    const groupId = parseInt(c.req.param('id'), 10)
    if (!groupId) return c.json({ success: false, error: '그룹 ID가 올바르지 않습니다.' }, 400)
    const body = await c.req.json().catch(() => ({})) as any

    const group = await c.env.DB.prepare('SELECT id, name, filter_json FROM contact_groups WHERE id = ?')
      .bind(groupId).first<{ id: number; name: string; filter_json: string | null }>()
    if (!group) return c.json({ success: false, error: '그룹을 찾을 수 없습니다.' }, 404)

    // 요청에 조건이 실려 오면 그것으로(조건 변경 + 갱신을 한 번에), 아니면 저장된 조건으로
    const rawFilter = body.filter !== undefined ? body.filter : group.filter_json
    if (rawFilter === null || rawFilter === undefined) {
      return c.json({ success: false, error: '이 그룹에는 조건이 없습니다. 조건을 먼저 설정하세요.' }, 400)
    }

    const seg = await resolveSegment(c.env.DB, rawFilter)

    const { results: existRows } = await c.env.DB.prepare(
      `SELECT member_id FROM contact_group_members
        WHERE group_id = ? AND member_type = 'CLIENT' AND source = 'AUTO'`
    ).bind(groupId).all<{ member_id: number }>()
    const existing = new Set((existRows || []).map(r => r.member_id))
    const next = new Set(seg.clients.map(x => x.client_id))

    const added = seg.clients.filter(x => !existing.has(x.client_id))
    const removedIds = Array.from(existing).filter(id => !next.has(id))

    // 제거 대상 이름 — "무엇이 빠지는지" 확인용. 표본이므로 바인드 한도 안쪽 80건만 조회한다.
    const removedNames: Array<{ id: number; name: string }> = []
    const removedSampleIds = removedIds.slice(0, 80)
    if (removedSampleIds.length > 0) {
      const ph = removedSampleIds.map(() => '?').join(',')
      const { results } = await c.env.DB.prepare(
        `SELECT id, client_name FROM clients WHERE id IN (${ph})`
      ).bind(...removedSampleIds).all<{ id: number; client_name: string }>()
      for (const r of results || []) removedNames.push({ id: r.id, name: r.client_name || '' })
    }

    const diff = {
      filter: seg.filter,
      total: seg.clients.length,
      added: added.length,
      removed: removedIds.length,
      kept: seg.clients.length - added.length,
      no_phone: seg.no_phone,
      merged_duplicate: seg.merged_duplicate,
      added_sample: added.slice(0, 20).map(x => ({ id: x.client_id, name: x.name, reason: buildMatchedReason(x) })),
      removed_sample: removedNames.slice(0, 20),
    }

    if (body.dry_run === true) return c.json({ success: true, data: { dry_run: true, ...diff } })

    // 반영 — AUTO 전량 삭제 후 재삽입(근거 문구도 함께 갱신되어야 하므로 upsert 대신 교체)
    await c.env.DB.prepare(
      `DELETE FROM contact_group_members WHERE group_id = ? AND source = 'AUTO'`
    ).bind(groupId).run()

    // 행당 바인드 5개 → 16행씩(한도 100) [[d1-bind-param-limit]]
    const ROWS_PER_STMT = 16
    const stmts = []
    for (let i = 0; i < seg.clients.length; i += ROWS_PER_STMT) {
      const chunk = seg.clients.slice(i, i + ROWS_PER_STMT)
      const values = chunk.map(() => '(?, ?, ?, ?, ?)').join(', ')
      const binds: any[] = []
      for (const x of chunk) binds.push(groupId, 'CLIENT', x.client_id, 'AUTO', buildMatchedReason(x))
      stmts.push(
        c.env.DB.prepare(
          `INSERT OR IGNORE INTO contact_group_members
             (group_id, member_type, member_id, source, matched_reason) VALUES ${values}`
        ).bind(...binds)
      )
    }
    // batch 한 번에 몰아넣지 않고 나눠 실행 — 대상이 수백~수천이면 statement 수가 커진다
    for (let i = 0; i < stmts.length; i += 20) {
      await c.env.DB.batch(stmts.slice(i, i + 20))
    }

    await c.env.DB.prepare(
      `UPDATE contact_groups SET filter_json = ?, synced_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
    ).bind(JSON.stringify(seg.filter), groupId).run()

    return c.json({ success: true, data: { dry_run: false, ...diff } })
  } catch (error) {
    console.error('src/routes/contactGroups.ts POST /:id/sync error:', error)
    return c.json({ success: false, error: '명단 갱신 실패' }, 500)
  }
})

export default contactGroupsRouter
