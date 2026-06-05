import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { getEntityId, entityFilter } from '../utils/entityFilter'

interface CashReceiptRow {
  id: number; receipt_number: string; status: string; trade_date: string;
  trade_type: string; identity_number: string; item_name: string | null;
  supply_amount: number; tax_amount: number; service_amount: number;
  total_amount: number; nts_approval_number: string | null;
  [key: string]: unknown
}

const cashReceiptsRouter = new Hono<HonoEnv>()
cashReceiptsRouter.use('/*', authMiddleware, requireRole('ADMIN', 'MANAGER'))

// ────────────────────────────────────────────────────────────────────────────
// 공통 헬퍼: 관리번호 채번 (CR-YYYY-NNNN)
// ────────────────────────────────────────────────────────────────────────────
async function generateReceiptNumber(db: D1Database, entityId: number): Promise<string> {
  const year = new Date().getFullYear()
  // #290: 법인별 독립 채번 — entity 프리픽스로 글로벌 UNIQUE와 충돌 없이 분리
  const prefix = `CR-E${entityId}-${year}-`
  const lastRow = await db.prepare(
    `SELECT receipt_number FROM cash_receipts WHERE receipt_number LIKE ? ORDER BY receipt_number DESC LIMIT 1`
  ).bind(`${prefix}%`).first<{ receipt_number: string }>()
  let nextSeq = 1
  if (lastRow?.receipt_number) {
    const parts = lastRow.receipt_number.split('-')
    nextSeq = Number(parts[parts.length - 1]) + 1
  }
  return `${prefix}${String(nextSeq).padStart(4, '0')}`
}

// ────────────────────────────────────────────────────────────────────────────
// 공통 헬퍼: 회사 설정 조회 (entities 테이블 우선)
// ────────────────────────────────────────────────────────────────────────────
import { getEntityCompanyInfo } from '../utils/entitySettings'

async function getCompanySettings(db: D1Database, entityId?: number): Promise<Record<string, string>> {
  if (entityId && entityId > 0) {
    return getEntityCompanyInfo(db, entityId)
  }
  const { results: settingRows } = await db.prepare(
    `SELECT setting_key, setting_value FROM settings
     WHERE setting_key IN (
       'company_name', 'company_business_registration_number',
       'company_representative', 'company_address',
       'company_business_type', 'company_business_item'
     )`
  ).all()
  const settings: Record<string, string> = {}
  for (const row of settingRows as Array<{ setting_key: string; setting_value: string }>) {
    settings[row.setting_key] = row.setting_value || ''
  }
  return settings
}

// ────────────────────────────────────────────────────────────────────────────
// GET / — List cash receipts (paginated)
// ────────────────────────────────────────────────────────────────────────────
cashReceiptsRouter.get('/', async (c) => {
  try {
    const { page = '1', limit = '50', status = '', search = '', date_from = '', date_to = '' } = c.req.query()
    const safeLimit = Math.min(parseInt(limit) || 50, 200)
    const offset = (parseInt(page) - 1) * safeLimit

    let query = `
      SELECT
        cr.*,
        cl.client_name
      FROM cash_receipts cr
      LEFT JOIN clients cl ON cr.client_id = cl.id
    `
    const params: any[] = []
    const whereClauses: string[] = []
    const ef = entityFilter(c, 'cr')

    if (status) {
      whereClauses.push('cr.status = ?')
      params.push(status)
    }
    if (search) {
      whereClauses.push('(cr.receipt_number LIKE ? OR cl.client_name LIKE ? OR cr.identity_number LIKE ?)')
      const p = `%${search}%`
      params.push(p, p, p)
    }
    if (date_from) {
      whereClauses.push('cr.trade_date >= ?')
      params.push(date_from)
    }
    if (date_to) {
      whereClauses.push('cr.trade_date <= ?')
      params.push(date_to)
    }
    if (ef.clause) {
      whereClauses.push(ef.clause.replace(' AND ', ''))
      params.push(...ef.params)
    }

    if (whereClauses.length > 0) {
      query += ' WHERE ' + whereClauses.join(' AND ')
    }
    query += ' ORDER BY cr.created_at DESC LIMIT ? OFFSET ?'
    params.push(safeLimit, offset)

    const { results } = await c.env.DB.prepare(query).bind(...params).all()

    // Count total
    let countQuery = `
      SELECT COUNT(*) as count
      FROM cash_receipts cr
      LEFT JOIN clients cl ON cr.client_id = cl.id
    `
    const countParams: any[] = []
    const countWhereClauses: string[] = []

    if (status) {
      countWhereClauses.push('cr.status = ?')
      countParams.push(status)
    }
    if (search) {
      countWhereClauses.push('(cr.receipt_number LIKE ? OR cl.client_name LIKE ? OR cr.identity_number LIKE ?)')
      const p = `%${search}%`
      countParams.push(p, p, p)
    }
    if (date_from) {
      countWhereClauses.push('cr.trade_date >= ?')
      countParams.push(date_from)
    }
    if (date_to) {
      countWhereClauses.push('cr.trade_date <= ?')
      countParams.push(date_to)
    }
    if (ef.clause) {
      countWhereClauses.push(ef.clause.replace(' AND ', ''))
      countParams.push(...ef.params)
    }

    if (countWhereClauses.length > 0) {
      countQuery += ' WHERE ' + countWhereClauses.join(' AND ')
    }

    const countRow = await c.env.DB.prepare(countQuery).bind(...countParams).first<{ count: number }>()
    const count = countRow?.count ?? 0

    return c.json({
      success: true,
      data: results,
      pagination: {
        page: parseInt(page),
        limit: safeLimit,
        total: count,
        total_pages: Math.ceil(count / safeLimit)
      }
    })
  } catch (error) {
    console.error('src/routes/cashReceipts.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ────────────────────────────────────────────────────────────────────────────
// GET /:id — Get single cash receipt
// ────────────────────────────────────────────────────────────────────────────
cashReceiptsRouter.get('/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    const ef = entityFilter(c, 'cr')

    const receipt = await c.env.DB.prepare(`
      SELECT cr.*, cl.client_name
      FROM cash_receipts cr
      LEFT JOIN clients cl ON cr.client_id = cl.id
      WHERE cr.id = ?${ef.clause}
    `).bind(id, ...ef.params).first()

    if (!receipt) {
      return c.json({ success: false, error: '현금영수증을 찾을 수 없습니다.' }, 404)
    }

    return c.json({ success: true, data: receipt })
  } catch (error) {
    console.error('src/routes/cashReceipts.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ────────────────────────────────────────────────────────────────────────────
// POST / — Create new cash receipt (DRAFT status)
// ────────────────────────────────────────────────────────────────────────────
cashReceiptsRouter.post('/', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const body = await c.req.json<{
      client_id?: number
      order_id?: number
      trade_date: string
      identity_type: string
      identity_number: string
      supply_amount: number
      tax_amount: number
      total_amount: number
      service_amount?: number
      item_name?: string
      receipt_type?: string
      trade_type?: string
      notes?: string
    }>()

    if (!body.trade_date) {
      return c.json({ success: false, error: 'trade_date는 필수입니다.' }, 400)
    }
    if (!body.identity_type) {
      return c.json({ success: false, error: 'identity_type은 필수입니다.' }, 400)
    }
    if (!body.identity_number) {
      return c.json({ success: false, error: 'identity_number는 필수입니다.' }, 400)
    }

    const receiptNumber = await generateReceiptNumber(c.env.DB, getEntityId(c) || 1)
    const receiptType = body.receipt_type || 'EXPENSE'
    const tradeType = body.trade_type || 'CONSUMER'
    const serviceAmount = body.service_amount || 0

    const result = await c.env.DB.prepare(`
      INSERT INTO cash_receipts (
        receipt_number, receipt_type, trade_type,
        identity_type, identity_number,
        client_id, order_id,
        trade_date, supply_amount, tax_amount, total_amount,
        service_amount, item_name,
        status, notes,
        entity_id,
        created_at, updated_at
      ) VALUES (
        ?, ?, ?,
        ?, ?,
        ?, ?,
        ?, ?, ?, ?,
        ?, ?,
        'DRAFT', ?,
        ?,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `).bind(
      receiptNumber, receiptType, tradeType,
      body.identity_type, body.identity_number,
      body.client_id || null, body.order_id || null,
      body.trade_date, body.supply_amount, body.tax_amount, body.total_amount,
      serviceAmount, body.item_name || null,
      body.notes || null,
      getEntityId(c)
    ).run()

    const receiptId = result.meta.last_row_id

    const created = await c.env.DB.prepare(`
      SELECT cr.*, cl.client_name
      FROM cash_receipts cr
      LEFT JOIN clients cl ON cr.client_id = cl.id
      WHERE cr.id = ?
    `).bind(receiptId).first()

    return c.json({ success: true, data: created }, 201)
  } catch (error) {
    console.error('src/routes/cashReceipts.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ────────────────────────────────────────────────────────────────────────────
// POST /:id/issue — Issue cash receipt (DRAFT -> ISSUED)
// ────────────────────────────────────────────────────────────────────────────
cashReceiptsRouter.post('/:id/issue', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    const user = c.get('user')

    const ef = entityFilter(c, '')
    const existing = await c.env.DB.prepare(
      `SELECT id, receipt_number, status, trade_date, trade_type, identity_number, item_name, supply_amount, tax_amount, service_amount, total_amount, nts_approval_number FROM cash_receipts WHERE id = ?${ef.clause}`
    ).bind(id, ...ef.params).first<CashReceiptRow>()

    if (!existing) {
      return c.json({ success: false, error: '현금영수증을 찾을 수 없습니다.' }, 404)
    }
    if (existing.status !== 'DRAFT') {
      return c.json({ success: false, error: '임시저장 상태의 현금영수증만 발행할 수 있습니다.' }, 400)
    }

    // 로컬 발행 (현금영수증은 바로빌 미연동 — 향후 확장 시 바로빌 Provider 추가)
    await c.env.DB.prepare(`
      UPDATE cash_receipts
      SET status = 'ISSUED',
          provider_name = 'barobill',
          issued_by = ?,
          issued_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(user.id, id).run()

    const updated = await c.env.DB.prepare(`
      SELECT cr.*, cl.client_name
      FROM cash_receipts cr
      LEFT JOIN clients cl ON cr.client_id = cl.id
      WHERE cr.id = ?
    `).bind(id).first()

    return c.json({ success: true, data: updated })
  } catch (error) {
    console.error('src/routes/cashReceipts.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ────────────────────────────────────────────────────────────────────────────
// POST /:id/cancel — Cancel issued cash receipt
// ────────────────────────────────────────────────────────────────────────────
cashReceiptsRouter.post('/:id/cancel', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    const body = await c.req.json<{
      cancel_reason?: string
    }>()

    const ef = entityFilter(c, '')
    const existing = await c.env.DB.prepare(
      `SELECT id, receipt_number, status, trade_date, trade_type, identity_number, item_name, supply_amount, tax_amount, service_amount, total_amount, nts_approval_number FROM cash_receipts WHERE id = ?${ef.clause}`
    ).bind(id, ...ef.params).first<CashReceiptRow>()

    if (!existing) {
      return c.json({ success: false, error: '현금영수증을 찾을 수 없습니다.' }, 404)
    }
    if (!['ISSUED', 'NTS_SUCCESS'].includes(existing.status)) {
      return c.json({ success: false, error: '발행 완료 상태의 현금영수증만 취소할 수 있습니다.' }, 400)
    }
    if (!existing.nts_approval_number) {
      return c.json({ success: false, error: '국세청 승인번호가 없어 취소할 수 없습니다.' }, 400)
    }

    // 상태 업데이트
    await c.env.DB.prepare(`
      UPDATE cash_receipts
      SET status = 'CANCELLED',
          cancelled_at = CURRENT_TIMESTAMP,
          cancel_reason = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(body.cancel_reason || null, id).run()

    const updated = await c.env.DB.prepare(`
      SELECT cr.*, cl.client_name
      FROM cash_receipts cr
      LEFT JOIN clients cl ON cr.client_id = cl.id
      WHERE cr.id = ?
    `).bind(id).first()

    return c.json({ success: true, data: updated })
  } catch (error) {
    console.error('src/routes/cashReceipts.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ────────────────────────────────────────────────────────────────────────────
// POST /:id/refresh-status — Refresh status (현금영수증은 현재 미지원)
// ────────────────────────────────────────────────────────────────────────────
cashReceiptsRouter.post('/:id/refresh-status', requireRole('ADMIN', 'MANAGER'), async (c) => {
  return c.json({ success: false, error: '현금영수증 상태 새로고침은 현재 지원하지 않습니다.' }, 400)
})

// ────────────────────────────────────────────────────────────────────────────
// DELETE /:id — Delete draft cash receipt
// ────────────────────────────────────────────────────────────────────────────
cashReceiptsRouter.delete('/:id', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = parseInt(c.req.param('id'))

    const ef = entityFilter(c, '')
    const existing = await c.env.DB.prepare(
      `SELECT id, status FROM cash_receipts WHERE id = ?${ef.clause}`
    ).bind(id, ...ef.params).first<{ id: number; status: string }>()

    if (!existing) {
      return c.json({ success: false, error: '현금영수증을 찾을 수 없습니다.' }, 404)
    }
    if (existing.status !== 'DRAFT') {
      return c.json({ success: false, error: '임시저장 상태의 현금영수증만 삭제할 수 있습니다.' }, 400)
    }

    await c.env.DB.prepare(`DELETE FROM cash_receipts WHERE id = ?${ef.clause}`).bind(id, ...ef.params).run()

    return c.json({ success: true, data: { id } })
  } catch (error) {
    console.error('src/routes/cashReceipts.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

export default cashReceiptsRouter
