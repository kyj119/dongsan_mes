// 지출결의서
import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { requirePagePermission } from '../middleware/permissions'
import { getEntityId, entityFilter } from '../utils/entityFilter'
import { getNextSeqNumber, getNextEntitySeqNumber, withSeqRetry } from '../utils/sequenceGenerator'

const paymentRequestsRouter = new Hono<HonoEnv>()
paymentRequestsRouter.use('/*', authMiddleware, requirePagePermission('/payment-requests'))

// 목록
paymentRequestsRouter.get('/', async (c) => {
  try {
    const { status, from, to, type, search } = c.req.query()
    const clauses: string[] = []
    const params: any[] = []
    const ef = entityFilter(c, 'pr')
    if (status) { clauses.push('pr.status = ?'); params.push(status) }
    if (type) { clauses.push('pr.request_type = ?'); params.push(type) }
    if (from) { clauses.push('pr.request_date >= ?'); params.push(from) }
    if (to) { clauses.push('pr.request_date <= ?'); params.push(to) }
    // #345: 지급처/사유/거래처명 키워드 검색
    if (search) {
      clauses.push('(pr.recipient_name LIKE ? OR pr.description LIKE ? OR c.client_name LIKE ?)')
      const kw = `%${search}%`
      params.push(kw, kw, kw)
    }
    if (ef.clause) { clauses.push(ef.clause.replace(' AND ', '')); params.push(...ef.params) }

    const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : ''

    // #359: 200 하드캡 → page/limit 페이지네이션 + 총건수 (silent truncation 제거)
    const page = Math.max(1, parseInt(c.req.query('page') || '1'))
    const limit = Math.min(Math.max(parseInt(c.req.query('limit') || '50'), 1), 200)
    const offset = (page - 1) * limit

    const countRow = await c.env.DB.prepare(`
      SELECT COUNT(*) as cnt
      FROM payment_requests pr
      LEFT JOIN clients c ON c.id = pr.recipient_client_id
      ${where}
    `).bind(...params).first<{ cnt: number }>()
    const total = countRow?.cnt ?? 0

    const { results } = await c.env.DB.prepare(`
      SELECT pr.*,
        cr.name as creator_name,
        ap.name as approver_name,
        c.client_name as recipient_client_name,
        po.po_number as related_po_number
      FROM payment_requests pr
      LEFT JOIN users cr ON cr.id = pr.created_by
      LEFT JOIN users ap ON ap.id = pr.approved_by
      LEFT JOIN clients c ON c.id = pr.recipient_client_id
      LEFT JOIN purchase_orders po ON po.id = pr.related_po_id
      ${where}
      ORDER BY pr.request_date DESC, pr.id DESC
      LIMIT ? OFFSET ?
    `).bind(...params, limit, offset).all()

    return c.json({
      success: true,
      data: results,
      pagination: { page, limit, total, total_pages: Math.ceil(total / limit) }
    })
  } catch (error) {
    console.error('payment-requests list error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// 상세
paymentRequestsRouter.get('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const ef = entityFilter(c, 'pr')
    const result = await c.env.DB.prepare(`
      SELECT pr.*,
        cr.name as creator_name,
        ap.name as approver_name,
        c.client_name as recipient_client_name,
        po.po_number as related_po_number
      FROM payment_requests pr
      LEFT JOIN users cr ON cr.id = pr.created_by
      LEFT JOIN users ap ON ap.id = pr.approved_by
      LEFT JOIN clients c ON c.id = pr.recipient_client_id
      LEFT JOIN purchase_orders po ON po.id = pr.related_po_id
      WHERE pr.id = ?${ef.clause}
    `).bind(id, ...ef.params).first()

    if (!result) return c.json({ success: false, error: '없음' }, 404)
    return c.json({ success: true, data: result })
  } catch (error) {
    console.error('payment-requests detail error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// 생성
paymentRequestsRouter.post('/', async (c) => {
  try {
    const user = c.get('user')
    const body = await c.req.json<Record<string, unknown>>()

    if (!body.recipient_name || !body.amount || !body.description) {
      return c.json({ success: false, error: '필수 항목 누락' }, 400)
    }

    // 결의서 번호 생성 (entity별 독립 시퀀스)
    const today = new Date()
    const dateStr = today.toISOString().substring(0, 10).replace(/-/g, '')
    const eid = getEntityId(c) || 1
    const requestNumber = await getNextEntitySeqNumber(c.env.DB, 'payment_requests', 'request_number', eid, dateStr, { base: 'PR-' })

    const result = await c.env.DB.prepare(`
      INSERT INTO payment_requests (
        request_number, request_date, request_type,
        recipient_client_id, recipient_name, recipient_account, recipient_bank,
        amount, description, related_po_id, attachment_url, notes, status, created_by,
        entity_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?)
    `).bind(
      requestNumber,
      body.request_date || today.toISOString().substring(0, 10),
      body.request_type || 'EXPENSE',
      body.recipient_client_id || null,
      body.recipient_name,
      body.recipient_account || null,
      body.recipient_bank || null,
      body.amount,
      body.description,
      body.related_po_id || null,
      body.attachment_url || null,
      body.notes || null,
      user?.id || null,
      eid
    ).run()

    return c.json({ success: true, data: { id: result.meta.last_row_id, request_number: requestNumber }, message: '지출결의서가 생성되었습니다.' })
  } catch (error) {
    console.error('payment-requests create error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// 발주서에서 자동 생성
paymentRequestsRouter.post('/from-po/:poId', async (c) => {
  try {
    const user = c.get('user')
    const poId = c.req.param('poId')

    const po = await c.env.DB.prepare(`
      SELECT po.*, c.client_name, c.transfer_info
      FROM purchase_orders po
      LEFT JOIN clients c ON c.id = po.supplier_id
      WHERE po.id = ?
    `).bind(poId).first<Record<string, unknown>>()

    if (!po) return c.json({ success: false, error: '발주서 없음' }, 404)

    // 이미 있는지 확인
    const existing = await c.env.DB.prepare(
      'SELECT id FROM payment_requests WHERE related_po_id = ? AND status != ?'
    ).bind(poId, 'CANCELLED').first()
    if (existing) {
      return c.json({ success: false, error: '이미 지출결의서가 있습니다.' }, 400)
    }

    const today = new Date()
    const dateStr = today.toISOString().substring(0, 10).replace(/-/g, '')
    const eidApprove = getEntityId(c) || 1
    const requestNumber = await getNextEntitySeqNumber(c.env.DB, 'payment_requests', 'request_number', eidApprove, dateStr, { base: 'PR-' })

    const result = await c.env.DB.prepare(`
      INSERT INTO payment_requests (
        request_number, request_date, request_type,
        recipient_client_id, recipient_name,
        amount, description, related_po_id, status, created_by,
        entity_id
      ) VALUES (?, ?, 'PURCHASE', ?, ?, ?, ?, ?, 'DRAFT', ?, ?)
    `).bind(
      requestNumber,
      today.toISOString().substring(0, 10),
      po.supplier_id,
      po.client_name || '공급사',
      po.final_amount,
      `발주서 ${po.po_number} 매입대금 지급`,
      poId,
      user?.id || null,
      eidApprove
    ).run()

    return c.json({ success: true, data: { id: result.meta.last_row_id, request_number: requestNumber } })
  } catch (error) {
    console.error('payment-requests from-po error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// 수정
paymentRequestsRouter.patch('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json<Record<string, unknown>>()
    const updates: string[] = []
    const params: any[] = [] // dynamic SQL params
    for (const f of ['recipient_name', 'recipient_account', 'recipient_bank', 'amount', 'description', 'notes']) {
      if (body[f] !== undefined) { updates.push(`${f} = ?`); params.push(body[f]) }
    }
    if (updates.length === 0) return c.json({ success: false, error: '변경할 항목 없음' }, 400)
    updates.push('updated_at = CURRENT_TIMESTAMP')
    params.push(id)
    const ef = entityFilter(c, '')
    params.push(...ef.params)
    await c.env.DB.prepare(`UPDATE payment_requests SET ${updates.join(', ')} WHERE id = ? AND status = 'DRAFT'${ef.clause}`).bind(...params).run()
    return c.json({ success: true, message: '수정되었습니다.' })
  } catch (error) {
    console.error('payment-requests update error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// 삭제
paymentRequestsRouter.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const ef = entityFilter(c, '')
    await c.env.DB.prepare(`DELETE FROM payment_requests WHERE id = ? AND status = ?${ef.clause}`).bind(id, 'DRAFT', ...ef.params).run()
    return c.json({ success: true, message: '삭제되었습니다.' })
  } catch (error) {
    console.error('payment-requests delete error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// 상신 (DRAFT → PENDING)
paymentRequestsRouter.patch('/:id/submit', async (c) => {
  try {
    const id = c.req.param('id')
    const ef = entityFilter(c, '')
    await c.env.DB.prepare(`
      UPDATE payment_requests SET status = 'PENDING', updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'DRAFT'${ef.clause}
    `).bind(id, ...ef.params).run()
    return c.json({ success: true, message: '결재 상신되었습니다.' })
  } catch (error) {
    console.error('payment-requests submit error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// 승인 (MANAGER+)
paymentRequestsRouter.patch('/:id/approve', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')
    const user = c.get('user')

    // 먼저 현재 데이터를 읽은 후 batch로 원자적 업데이트 (타법인 결의서 승인 차단)
    const ef = entityFilter(c, '')
    const pr = await c.env.DB.prepare(
      `SELECT id, request_date, request_type, recipient_client_id, recipient_name, amount, description, status, entity_id FROM payment_requests WHERE id = ?${ef.clause}`
    ).bind(id, ...ef.params).first<Record<string, unknown>>()
    if (!pr || pr.status !== 'PENDING') {
      return c.json({ success: false, error: '승인 가능한 상태가 아닙니다.' }, 400)
    }

    // batch: 승인 + 자금 예정 등록을 단일 왕복으로 처리 (cash_schedule는 결의서 행의 entity로 귀속)
    await c.env.DB.batch([
      c.env.DB.prepare(`
        UPDATE payment_requests SET status = 'APPROVED', approved_by = ?, approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'PENDING'
      `).bind(user?.id || null, id),
      c.env.DB.prepare(`
        INSERT INTO cash_schedule (schedule_date, flow_type, source_type, source_id, client_id, amount, description, created_by, entity_id)
        VALUES (?, 'OUT', ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        pr.request_date, pr.request_type || 'OTHER', pr.id, pr.recipient_client_id, pr.amount,
        `[지출결의] ${pr.recipient_name} ${pr.description}`,
        user?.id || null, pr.entity_id
      )
    ])

    return c.json({ success: true, message: '승인되었습니다.' })
  } catch (error) {
    console.error('payment-requests approve error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// 반려
paymentRequestsRouter.patch('/:id/reject', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')
    const { reject_reason } = await c.req.json() as { reject_reason?: string }
    const ef = entityFilter(c, '')
    await c.env.DB.prepare(`
      UPDATE payment_requests SET status = 'REJECTED', reject_reason = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'PENDING'${ef.clause}
    `).bind(reject_reason || null, id, ...ef.params).run()
    return c.json({ success: true, message: '반려되었습니다.' })
  } catch (error) {
    console.error('payment-requests reject error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// 이체 완료 처리
paymentRequestsRouter.patch('/:id/pay', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')
    const user = c.get('user')
    const { bank_transaction_id, paid_at } = await c.req.json<{ bank_transaction_id?: string; paid_at?: string }>()

    const ef = entityFilter(c, '')
    const pr2 = await c.env.DB.prepare(
      `SELECT id, request_date, amount, status, request_type FROM payment_requests WHERE id = ?${ef.clause}`
    ).bind(id, ...ef.params).first<Record<string, unknown>>()
    if (!pr2 || pr2.status !== 'APPROVED') {
      return c.json({ success: false, error: '이체 가능한 상태가 아닙니다.' }, 400)
    }

    // batch: 이체완료 + 자금 예정 완료를 단일 왕복으로 처리
    // ⚠️ approve(:278)가 source_type = request_type(EXPENSE/PURCHASE/OTHER)로 INSERT하므로
    //    pay도 동일 source_type으로 매칭해야 함. 과거 'OTHER' 하드코딩 → EXPENSE/PURCHASE 결의가
    //    지급 후에도 PENDING 영구 잔존(캐시플로 지출 과대·거짓 연체). source_id+source_type로 정정.
    const csSourceType = (pr2.request_type as string) || 'OTHER'
    await c.env.DB.batch([
      c.env.DB.prepare(`
        UPDATE payment_requests SET status = 'PAID',
          paid_at = COALESCE(?, CURRENT_TIMESTAMP),
          paid_by = ?, bank_transaction_id = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'APPROVED'
      `).bind(paid_at || null, user?.id || null, bank_transaction_id || null, id),
      c.env.DB.prepare(`
        UPDATE cash_schedule SET status = 'DONE', actual_date = ?, actual_amount = ?
        WHERE source_type = ? AND source_id = ?
      `).bind(paid_at || pr2.request_date as string, pr2.amount, csSourceType, id)
    ])

    return c.json({ success: true, message: '이체 완료 처리되었습니다.' })
  } catch (error) {
    console.error('payment-requests pay error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// 통계
paymentRequestsRouter.get('/stats/summary', async (c) => {
  try {
    const ef = entityFilter(c)
    const stats = await c.env.DB.prepare(`
      SELECT
        SUM(CASE WHEN status = 'DRAFT' THEN 1 ELSE 0 END) as draft_count,
        SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending_count,
        SUM(CASE WHEN status = 'APPROVED' THEN 1 ELSE 0 END) as approved_count,
        SUM(CASE WHEN status = 'PAID' THEN 1 ELSE 0 END) as paid_count,
        SUM(CASE WHEN status = 'PENDING' THEN amount ELSE 0 END) as pending_amount,
        SUM(CASE WHEN status = 'APPROVED' THEN amount ELSE 0 END) as approved_amount
      FROM payment_requests
      WHERE request_date >= date('now', '-90 days')${ef.clause}
    `).bind(...ef.params).first()
    return c.json({ success: true, data: stats })
  } catch (error) {
    console.error('payment-requests stats error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

export default paymentRequestsRouter
