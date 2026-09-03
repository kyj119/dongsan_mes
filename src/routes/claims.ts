import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { requireEditOrRole } from '../middleware/permissions'
import { getEntityId, entityFilter } from '../utils/entityFilter'
import { getNextEntitySeqNumber, withSeqRetry } from '../utils/sequenceGenerator'
import { kstYmd, kstYmdCompact } from '../utils/kstDate'
import { syncArAdjustmentStmts } from './ledger/ar-helpers'

const claims = new Hono<HonoEnv>()
claims.use('*', authMiddleware)

// ─── 불량 코드 목록 ──────────────────────────────────────────────────────────
claims.get('/defect-codes', async (c) => {
  const dcEf = entityFilter(c, 'd')
  const { results } = await c.env.DB.prepare(`
    SELECT d.*, p.name as parent_name
    FROM defect_codes d
    LEFT JOIN defect_codes p ON d.parent_id = p.id
    WHERE d.is_active = 1 ${dcEf.clause}
    ORDER BY d.sort_order ASC, d.id ASC
  `).bind(...dcEf.params).all()
  return c.json({ success: true, data: results })
})

// ─── 불량 코드 생성 ──────────────────────────────────────────────────────────
claims.post('/defect-codes', requireRole('ADMIN', 'MANAGER'), async (c) => {
  const { code, name, parent_id, category, description, preventive_action } = await c.req.json()
  if (!code || !name || !category) {
    return c.json({ success: false, error: 'code, name, category 필수' }, 400)
  }
  const result = await c.env.DB.prepare(`
    INSERT INTO defect_codes (code, name, parent_id, category, description, preventive_action, entity_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(code, name, parent_id || null, category, description || null, preventive_action || null, getEntityId(c) || 1).run()
  return c.json({ success: true, data: { id: result.meta.last_row_id } })
})

// ─── 클레임 목록 ──────────────────────────────────────────────────────────────
claims.get('/', async (c) => {
  const status = c.req.query('status')
  const clientId = c.req.query('client_id')
  // 하위호환: page/limit 파라미터가 없으면 기존 동작(전체) + 방어적 cap 500. 있으면 기본 50·cap 200.
  const pageQ = c.req.query('page')
  const limitQ = c.req.query('limit')
  const hasPaging = pageQ !== undefined || limitQ !== undefined
  const page = Math.max(1, Number(pageQ) || 1)
  const maxLimit = hasPaging ? 200 : 500
  let limit = hasPaging ? (Number(limitQ) || 50) : 500
  if (limit < 1) limit = hasPaging ? 50 : 500
  if (limit > maxLimit) limit = maxLimit
  const offset = (page - 1) * limit
  const eFilter = entityFilter(c, 'cc')

  let where = `WHERE 1=1 ${eFilter.clause}`
  const binds: any[] = [...eFilter.params]

  if (status) { where += ' AND cc.status = ?'; binds.push(status) }
  if (clientId) { where += ' AND cc.client_id = ?'; binds.push(clientId) }

  const countRow = await c.env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM customer_claims cc ${where}`
  ).bind(...binds).first<{ cnt: number }>()

  const { results } = await c.env.DB.prepare(`
    SELECT cc.*, cl.client_name, o.order_number
    FROM customer_claims cc
    LEFT JOIN clients cl ON cc.client_id = cl.id
    LEFT JOIN orders o ON cc.order_id = o.id
    ${where}
    ORDER BY cc.created_at DESC, cc.id DESC
    LIMIT ? OFFSET ?
  `).bind(...binds, limit, offset).all()

  const total = countRow?.cnt || 0
  return c.json({ success: true, data: results, pagination: { total, page, limit, total_pages: Math.ceil(total / limit) || 1 } })
})

// ─── 클레임 생성 ──────────────────────────────────────────────────────────────
claims.post('/', async (c) => {
  const body = await c.req.json()
  const userId = c.get('user')?.id
  const { order_id, client_id, claim_date, claim_type, description, claimed_amount, quality_issue_id } = body

  if (!order_id || !client_id || !description) {
    return c.json({ success: false, error: 'order_id, client_id, description 필수' }, 400)
  }

  // 번호 생성 — 법인코드 E{eid} 내장 (행 entity_id와 동일 eid). 채번 경로 통일.
  const today = kstYmdCompact()
  const claimNumber = await getNextEntitySeqNumber(c.env.DB, 'customer_claims', 'claim_number', getEntityId(c) || 1, today, { base: 'CLM-' })

  const result = await c.env.DB.prepare(`
    INSERT INTO customer_claims (claim_number, order_id, client_id, claim_date, claim_type, description, claimed_amount, quality_issue_id, entity_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    claimNumber, order_id, client_id,
    claim_date || kstYmd(),
    claim_type || 'DEFECT', description, claimed_amount || 0,
    quality_issue_id || null, getEntityId(c) || 1, userId
  ).run()

  return c.json({ success: true, data: { id: result.meta.last_row_id, claim_number: claimNumber } })
})

// ─── 클레임 해결 ──────────────────────────────────────────────────────────────
claims.patch('/:id/resolve', requireEditOrRole('/quality', 'MANAGER'), async (c) => {
  const id = Number(c.req.param('id'))
  const userId = c.get('user')?.id
  const { resolution_type, resolved_amount, rework_order_id } = await c.req.json()

  const ef = entityFilter(c)  // #446: 타법인 클레임 변조 차단(형제 분석은 cc 격리)
  // #567: 조정 스탬프에 필요한 client_id/order_id/entity_id/claim_number 조회 (겸 404·소유 검증)
  const claim = await c.env.DB.prepare(
    `SELECT client_id, order_id, entity_id, claim_number FROM customer_claims WHERE id = ?${ef.clause}`
  ).bind(id, ...ef.params).first<{ client_id: number; order_id: number | null; entity_id: number; claim_number: string }>()
  if (!claim) return c.json({ success: false, error: '클레임을 찾을 수 없습니다.' }, 404)

  // ★해결금액 한도 — REFUND·DISCOUNT 는 그대로 AR 감액(외상매출 차감)이 되므로 상한이 없으면
  //   품질 페이지 편집 권한만으로 임의 금액의 고객 여신을 발행할 수 있다.
  //   음수는 거부하고, 연결된 주문이 있으면 그 주문 청구액을 넘지 못하게 한다.
  const amount = Math.round(Number(resolved_amount) || 0)
  if (amount < 0) {
    return c.json({ success: false, error: '해결금액은 0원 이상이어야 합니다.' }, 400)
  }
  if (claim.order_id && amount > 0) {
    const claimOrder = await c.env.DB.prepare(
      'SELECT final_amount FROM orders WHERE id = ?'
    ).bind(claim.order_id).first<{ final_amount: number | null }>()
    const claimCap = Math.round(Number(claimOrder?.final_amount) || 0)
    if (claimCap > 0 && amount > claimCap) {
      return c.json({ success: false, error: `해결금액이 원 주문 금액(${claimCap.toLocaleString()}원)을 초과할 수 없습니다.` }, 400)
    }
  }
  // #567: 환불/할인(REFUND·DISCOUNT)만 AR 감액. 재작업·재제작·반려는 조정 없음.
  const arAmount = (resolution_type === 'REFUND' || resolution_type === 'DISCOUNT') ? amount : 0

  await c.env.DB.batch([
    c.env.DB.prepare(`
      UPDATE customer_claims
      SET status = 'RESOLVED', resolution_type = ?, resolved_amount = ?,
          rework_order_id = ?, resolved_by = ?, resolved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?${ef.clause}
    `).bind(resolution_type, amount, rework_order_id || null, userId, id, ...ef.params),
    // #567: 해결금액 → AR 자동조정 멱등 동기화 (재해결/금액변경/방식전환 자동 정합)
    ...syncArAdjustmentStmts(c.env.DB, {
      sourceType: 'CLAIM', sourceId: id,
      clientId: claim.client_id, orderId: claim.order_id, entityId: claim.entity_id,
      amount: arAmount, type: 'CLAIM',
      reason: `클레임 ${claim.claim_number} 해결(${resolution_type}) 자동조정`,
      createdBy: userId ?? null,
    }),
  ])

  return c.json({ success: true })
})

// ─── 클레임 분석 ──────────────────────────────────────────────────────────────
claims.get('/analytics', async (c) => {
  const eFilter = entityFilter(c, 'cc')

  // 유형별 건수
  const { results: byType } = await c.env.DB.prepare(`
    SELECT claim_type, COUNT(*) as cnt, COALESCE(SUM(claimed_amount),0) as total_amount
    FROM customer_claims cc WHERE 1=1 ${eFilter.clause}
    GROUP BY claim_type
  `).bind(...eFilter.params).all()

  // 거래처별 TOP 10
  const { results: byClient } = await c.env.DB.prepare(`
    SELECT cc.client_id, cl.client_name, COUNT(*) as cnt, COALESCE(SUM(cc.claimed_amount),0) as total_amount
    FROM customer_claims cc
    LEFT JOIN clients cl ON cc.client_id = cl.id
    WHERE 1=1 ${eFilter.clause}
    GROUP BY cc.client_id ORDER BY cnt DESC LIMIT 10
  `).bind(...eFilter.params).all()

  // 월별 추이 (최근 6개월)
  const { results: monthly } = await c.env.DB.prepare(`
    SELECT strftime('%Y-%m', claim_date) as month, COUNT(*) as cnt, COALESCE(SUM(claimed_amount),0) as total
    FROM customer_claims cc WHERE claim_date >= date('now','-6 months') ${eFilter.clause}
    GROUP BY month ORDER BY month
  `).bind(...eFilter.params).all()

  return c.json({ success: true, data: { byType, byClient, monthly } })
})

export default claims
