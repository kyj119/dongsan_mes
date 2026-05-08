// ============================================================================
// 전자결재 라우트
// ============================================================================

import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { requirePagePermission } from '../middleware/permissions'

const approvals = new Hono<HonoEnv>()
approvals.use('*', authMiddleware, requirePagePermission('/approvals'))

// ─── 결재 양식 관리 (ADMIN) ──────────────────────────────────────────────────

approvals.get('/templates', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      `SELECT * FROM approval_templates WHERE is_active = 1 ORDER BY type, name`
    ).all()
    return c.json({ success: true, data: results })
  } catch (e) {
    console.error('Approvals error:', e)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

approvals.post('/templates', requireRole('ADMIN'), async (c) => {
  try {
    const body = await c.req.json()
    const userId = c.get('user')?.id
    const { name, type, description, steps } = body

    const result = await c.env.DB.prepare(`
      INSERT INTO approval_templates (name, type, description, steps, created_by)
      VALUES (?, ?, ?, ?, ?)
    `).bind(name, type || 'GENERAL', description || null, JSON.stringify(steps || []), userId).run()

    return c.json({ success: true, data: { id: result.meta?.last_row_id } })
  } catch (e) {
    console.error('Approvals error:', e)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

approvals.put('/templates/:id', requireRole('ADMIN'), async (c) => {
  try {
    const id = Number(c.req.param('id'))
    const body = await c.req.json()
    const { name, type, description, steps } = body

    await c.env.DB.prepare(`
      UPDATE approval_templates SET name = ?, type = ?, description = ?, steps = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(name, type || 'GENERAL', description || null, JSON.stringify(steps || []), id).run()

    return c.json({ success: true })
  } catch (e) {
    console.error('Approvals error:', e)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

approvals.delete('/templates/:id', requireRole('ADMIN'), async (c) => {
  try {
    const id = Number(c.req.param('id'))
    await c.env.DB.prepare(
      `UPDATE approval_templates SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(id).run()
    return c.json({ success: true })
  } catch (e) {
    console.error('Approvals error:', e)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ─── 내 결재 목록 ─────────────────────────────────────────────────────────────

approvals.get('/', async (c) => {
  try {
    const userId = c.get('user')?.id
    const userRole = c.get('user')?.role
    const { status, type } = c.req.query()

    let query = `
      SELECT ar.*, u.name as requester_name
      FROM approval_requests ar
      LEFT JOIN users u ON ar.requester_id = u.id
      WHERE 1=1
    `
    const params: any[] = []

    // ADMIN/MANAGER는 전체 조회, 나머지는 자기 것만
    if (userRole !== 'ADMIN' && userRole !== 'MANAGER') {
      query += ` AND ar.requester_id = ?`
      params.push(userId)
    }
    if (status) {
      query += ` AND ar.status = ?`
      params.push(status)
    }
    if (type) {
      query += ` AND ar.type = ?`
      params.push(type)
    }
    query += ` ORDER BY ar.created_at DESC LIMIT 100`

    const stmt = params.length > 0 ? c.env.DB.prepare(query).bind(...params) : c.env.DB.prepare(query)
    const { results } = await stmt.all()
    return c.json({ success: true, data: results })
  } catch (e) {
    console.error('Approvals error:', e)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ─── 내가 결재할 건 ──────────────────────────────────────────────────────────

approvals.get('/pending', async (c) => {
  try {
    const userId = c.get('user')?.id
    const userRole = c.get('user')?.role

    const { results } = await c.env.DB.prepare(`
      SELECT ar.*, u.name as requester_name, ast.step_order, ast.label as step_label
      FROM approval_requests ar
      JOIN approval_steps ast ON ar.id = ast.request_id
      LEFT JOIN users u ON ar.requester_id = u.id
      WHERE ar.status IN ('PENDING', 'IN_REVIEW')
        AND ast.status = 'PENDING'
        AND ast.step_order = ar.current_step
        AND (ast.approver_id = ? OR ast.approver_role = ?)
      ORDER BY ar.created_at DESC
    `).bind(userId, userRole).all()

    return c.json({ success: true, data: results })
  } catch (e) {
    console.error('Approvals error:', e)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ─── 결재 요청 생성 ──────────────────────────────────────────────────────────

approvals.post('/', async (c) => {
  try {
    const body = await c.req.json()
    const userId = c.get('user')?.id
    const { template_id, type, title, content, amount, reference_type, reference_id } = body

    // 번호 생성
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const { results: existing } = await c.env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM approval_requests WHERE request_number LIKE ?`
    ).bind(`APR-${today}-%`).all()
    const seq = ((existing[0] as any)?.cnt || 0) + 1
    const requestNumber = `APR-${today}-${String(seq).padStart(3, '0')}`

    // 템플릿에서 결재 단계 가져오기
    let steps: any[] = []
    let totalSteps = 0
    if (template_id) {
      const tmpl = await c.env.DB.prepare(
        `SELECT steps FROM approval_templates WHERE id = ?`
      ).bind(template_id).first() as { steps: string } | null
      if (tmpl) {
        steps = JSON.parse(tmpl.steps || '[]')
        totalSteps = steps.length
      }
    }

    const result = await c.env.DB.prepare(`
      INSERT INTO approval_requests (request_number, template_id, type, requester_id, title, content, amount, reference_type, reference_id, status, current_step, total_steps)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', 1, ?)
    `).bind(
      requestNumber, template_id || null, type || 'GENERAL', userId,
      title, content ? JSON.stringify(content) : null, amount || 0,
      reference_type || null, reference_id || null, totalSteps
    ).run()

    const requestId = result.meta?.last_row_id as number

    // 결재 단계 생성
    for (const step of steps) {
      const isRole = ['ADMIN', 'MANAGER', 'DESIGNER', 'OPERATOR'].includes(step.role_or_user_id)
      await c.env.DB.prepare(`
        INSERT INTO approval_steps (request_id, step_order, approver_id, approver_role, label, status)
        VALUES (?, ?, ?, ?, ?, 'PENDING')
      `).bind(
        requestId, step.step_order,
        isRole ? null : Number(step.role_or_user_id) || null,
        isRole ? step.role_or_user_id : null,
        step.label || `${step.step_order}단계`
      ).run()
    }

    return c.json({ success: true, data: { id: requestId, requestNumber } })
  } catch (e) {
    console.error('Approvals error:', e)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ─── 결재 요청 조회 ──────────────────────────────────────────────────────────

approvals.get('/:id', async (c) => {
  try {
    const id = Number(c.req.param('id'))

    const request = await c.env.DB.prepare(`
      SELECT ar.*, u.name as requester_name
      FROM approval_requests ar
      LEFT JOIN users u ON ar.requester_id = u.id
      WHERE ar.id = ?
    `).bind(id).first()

    if (!request) return c.json({ success: false, error: '결재 요청을 찾을 수 없습니다.' }, 404)

    const { results: steps } = await c.env.DB.prepare(`
      SELECT ast.*, u.name as approver_name
      FROM approval_steps ast
      LEFT JOIN users u ON ast.approver_id = u.id
      WHERE ast.request_id = ?
      ORDER BY ast.step_order
    `).bind(id).all()

    const { results: attachments } = await c.env.DB.prepare(
      `SELECT id, file_name, file_type, uploaded_by, created_at FROM approval_attachments WHERE request_id = ?`
    ).bind(id).all()

    return c.json({ success: true, data: { request, steps, attachments } })
  } catch (e) {
    console.error('Approvals error:', e)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ─── 결재 요청 수정 (DRAFT만) ────────────────────────────────────────────────

approvals.put('/:id', async (c) => {
  try {
    const id = Number(c.req.param('id'))
    const body = await c.req.json()
    const { title, content, amount } = body

    const req = await c.env.DB.prepare(
      `SELECT status FROM approval_requests WHERE id = ?`
    ).bind(id).first() as { status: string } | null

    if (!req || req.status !== 'DRAFT') {
      return c.json({ success: false, error: 'DRAFT 상태에서만 수정 가능합니다.' }, 400)
    }

    await c.env.DB.prepare(`
      UPDATE approval_requests SET title = ?, content = ?, amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(title, content ? JSON.stringify(content) : null, amount || 0, id).run()

    return c.json({ success: true })
  } catch (e) {
    console.error('Approvals error:', e)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ─── 상신 (DRAFT → PENDING) ──────────────────────────────────────────────────

approvals.post('/:id/submit', async (c) => {
  try {
    const id = Number(c.req.param('id'))

    const req = await c.env.DB.prepare(
      `SELECT status, total_steps FROM approval_requests WHERE id = ?`
    ).bind(id).first() as { status: string; total_steps: number } | null

    if (!req || req.status !== 'DRAFT') {
      return c.json({ success: false, error: 'DRAFT 상태에서만 상신 가능합니다.' }, 400)
    }
    if (req.total_steps === 0) {
      return c.json({ success: false, error: '결재 단계가 설정되지 않았습니다.' }, 400)
    }

    await c.env.DB.prepare(`
      UPDATE approval_requests SET status = 'PENDING', current_step = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(id).run()

    return c.json({ success: true })
  } catch (e) {
    console.error('Approvals error:', e)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ─── 승인 ────────────────────────────────────────────────────────────────────

approvals.post('/:id/approve', async (c) => {
  try {
    const id = Number(c.req.param('id'))
    const userId = c.get('user')?.id
    const userRole = c.get('user')?.role
    const body = await c.req.json()

    const req = await c.env.DB.prepare(
      `SELECT * FROM approval_requests WHERE id = ?`
    ).bind(id).first() as any
    if (!req || !['PENDING', 'IN_REVIEW'].includes(req.status)) {
      return c.json({ success: false, error: '승인 가능한 상태가 아닙니다.' }, 400)
    }

    // 현재 단계 조회
    const step = await c.env.DB.prepare(`
      SELECT * FROM approval_steps
      WHERE request_id = ? AND step_order = ? AND status = 'PENDING'
    `).bind(id, req.current_step).first() as any

    if (!step) {
      return c.json({ success: false, error: '현재 결재 단계를 찾을 수 없습니다.' }, 400)
    }

    // 권한 확인
    const canApprove = (step.approver_id && step.approver_id === userId) ||
                       (step.approver_role && step.approver_role === userRole) ||
                       userRole === 'ADMIN'
    if (!canApprove) {
      return c.json({ success: false, error: '결재 권한이 없습니다.' }, 403)
    }

    // 단계 승인
    await c.env.DB.prepare(`
      UPDATE approval_steps SET status = 'APPROVED', comment = ?, approver_id = ?, acted_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(body.comment || null, userId, step.id).run()

    // 다음 단계 확인
    const nextStep = req.current_step + 1
    if (nextStep > req.total_steps) {
      // 최종 승인
      await c.env.DB.prepare(`
        UPDATE approval_requests SET status = 'APPROVED', final_comment = ?, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).bind(body.comment || null, id).run()

      // Post-approval hook
      await handlePostApproval(c.env.DB, req)
    } else {
      await c.env.DB.prepare(`
        UPDATE approval_requests SET status = 'IN_REVIEW', current_step = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).bind(nextStep, id).run()
    }

    return c.json({ success: true })
  } catch (e) {
    console.error('Approvals error:', e)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ─── 반려 ────────────────────────────────────────────────────────────────────

approvals.post('/:id/reject', async (c) => {
  try {
    const id = Number(c.req.param('id'))
    const userId = c.get('user')?.id
    const userRole = c.get('user')?.role
    const body = await c.req.json()

    const req = await c.env.DB.prepare(
      `SELECT * FROM approval_requests WHERE id = ?`
    ).bind(id).first() as any
    if (!req || !['PENDING', 'IN_REVIEW'].includes(req.status)) {
      return c.json({ success: false, error: '반려 가능한 상태가 아닙니다.' }, 400)
    }

    const step = await c.env.DB.prepare(`
      SELECT * FROM approval_steps
      WHERE request_id = ? AND step_order = ? AND status = 'PENDING'
    `).bind(id, req.current_step).first() as any

    if (!step) {
      return c.json({ success: false, error: '현재 결재 단계를 찾을 수 없습니다.' }, 400)
    }

    const canApprove = (step.approver_id && step.approver_id === userId) ||
                       (step.approver_role && step.approver_role === userRole) ||
                       userRole === 'ADMIN'
    if (!canApprove) {
      return c.json({ success: false, error: '결재 권한이 없습니다.' }, 403)
    }

    await c.env.DB.prepare(`
      UPDATE approval_steps SET status = 'REJECTED', comment = ?, approver_id = ?, acted_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(body.comment || '반려', userId, step.id).run()

    await c.env.DB.prepare(`
      UPDATE approval_requests SET status = 'REJECTED', final_comment = ?, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(body.comment || '반려', id).run()

    return c.json({ success: true })
  } catch (e) {
    console.error('Approvals error:', e)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ─── 취소 ────────────────────────────────────────────────────────────────────

approvals.post('/:id/cancel', async (c) => {
  try {
    const id = Number(c.req.param('id'))
    const userId = c.get('user')?.id

    const req = await c.env.DB.prepare(
      `SELECT requester_id, status FROM approval_requests WHERE id = ?`
    ).bind(id).first() as any

    if (!req || req.requester_id !== userId) {
      return c.json({ success: false, error: '본인의 요청만 취소 가능합니다.' }, 403)
    }
    if (!['DRAFT', 'PENDING'].includes(req.status)) {
      return c.json({ success: false, error: '취소 가능한 상태가 아닙니다.' }, 400)
    }

    await c.env.DB.prepare(`
      UPDATE approval_requests SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(id).run()

    return c.json({ success: true })
  } catch (e) {
    console.error('Approvals error:', e)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ─── 첨부 파일 ──────────────────────────────────────────────────────────────

approvals.post('/:id/attachments', async (c) => {
  try {
    const id = Number(c.req.param('id'))
    const userId = c.get('user')?.id
    const body = await c.req.json()
    const { file_name, file_type, file_data } = body

    const result = await c.env.DB.prepare(`
      INSERT INTO approval_attachments (request_id, file_name, file_type, file_data, uploaded_by)
      VALUES (?, ?, ?, ?, ?)
    `).bind(id, file_name, file_type || null, file_data, userId).run()

    return c.json({ success: true, data: { id: result.meta?.last_row_id } })
  } catch (e) {
    console.error('Approvals error:', e)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

approvals.get('/:id/attachments/:attachId', async (c) => {
  try {
    const attachId = Number(c.req.param('attachId'))
    const att = await c.env.DB.prepare(
      `SELECT * FROM approval_attachments WHERE id = ?`
    ).bind(attachId).first()
    if (!att) return c.json({ success: false, error: '첨부 파일을 찾을 수 없습니다.' }, 404)
    return c.json({ success: true, data: att })
  } catch (e) {
    console.error('Approvals error:', e)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ─── 대기 건수 (뱃지용) ─────────────────────────────────────────────────────

approvals.get('/badge/count', async (c) => {
  try {
    const userId = c.get('user')?.id
    const userRole = c.get('user')?.role

    const result = await c.env.DB.prepare(`
      SELECT COUNT(*) as cnt
      FROM approval_requests ar
      JOIN approval_steps ast ON ar.id = ast.request_id
      WHERE ar.status IN ('PENDING', 'IN_REVIEW')
        AND ast.status = 'PENDING'
        AND ast.step_order = ar.current_step
        AND (ast.approver_id = ? OR ast.approver_role = ?)
    `).bind(userId, userRole).first() as { cnt: number }

    return c.json({ success: true, data: { count: result?.cnt || 0 } })
  } catch (e) {
    console.error('Approvals error:', e)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ─── Post-approval hook ─────────────────────────────────────────────────────

async function handlePostApproval(db: D1Database, req: any) {
  // 연관 엔티티에 따른 후처리
  if (req.reference_type === 'purchase_request' && req.reference_id) {
    // PR 자동 승인
    await db.prepare(`
      UPDATE purchase_requests SET status = 'APPROVED', approved_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'PENDING'
    `).bind(req.reference_id).run()
  }
}

export default approvals
