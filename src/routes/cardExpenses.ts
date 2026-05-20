import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { getEntityId, entityFilter } from '../utils/entityFilter'

const cardExpensesRouter = new Hono<HonoEnv>()
cardExpensesRouter.use('/*', authMiddleware, requireRole('ADMIN', 'MANAGER'))

// ============================================================================
// 경비 분류 CRUD
// ============================================================================

// GET /categories
cardExpensesRouter.get('/categories', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM expense_categories WHERE is_active = 1 ORDER BY sort_order, name'
  ).all()
  return c.json({ success: true, data: results })
})

// POST /categories
cardExpensesRouter.post('/categories', async (c) => {
  const body = await c.req.json() as any
  const { name, icon, color } = body
  if (!name) return c.json({ success: false, error: '분류명은 필수입니다.' }, 400)

  const maxSort = await c.env.DB.prepare(
    'SELECT MAX(sort_order) as mx FROM expense_categories'
  ).first<{ mx: number }>()

  const result = await c.env.DB.prepare(
    'INSERT INTO expense_categories (name, icon, color, sort_order, entity_id) VALUES (?, ?, ?, ?, ?)'
  ).bind(name, icon || 'fa-tag', color || '#6b7280', (maxSort?.mx || 0) + 1, getEntityId(c)).run()

  return c.json({ success: true, data: { id: result.meta.last_row_id } })
})

// PUT /categories/:id
cardExpensesRouter.put('/categories/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json() as any
  const fields: string[] = []
  const params: any[] = []

  if (body.name !== undefined) { fields.push('name = ?'); params.push(body.name) }
  if (body.icon !== undefined) { fields.push('icon = ?'); params.push(body.icon) }
  if (body.color !== undefined) { fields.push('color = ?'); params.push(body.color) }
  if (body.sort_order !== undefined) { fields.push('sort_order = ?'); params.push(body.sort_order) }

  if (!fields.length) return c.json({ success: false, error: '수정할 항목이 없습니다.' }, 400)
  params.push(id)

  await c.env.DB.prepare(
    `UPDATE expense_categories SET ${fields.join(', ')} WHERE id = ?`
  ).bind(...params).run()

  return c.json({ success: true })
})

// DELETE /categories/:id (soft delete)
cardExpensesRouter.delete('/categories/:id', async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare(
    'UPDATE expense_categories SET is_active = 0 WHERE id = ?'
  ).bind(id).run()
  return c.json({ success: true })
})

// ============================================================================
// 법인카드 CRUD
// ============================================================================

// GET /cards
cardExpensesRouter.get('/cards', async (c) => {
  const ef = entityFilter(c)
  const { results } = await c.env.DB.prepare(
    `SELECT cc.*,
       (SELECT COUNT(*) FROM card_transactions ct WHERE ct.card_id = cc.id) as tx_count,
       (SELECT COALESCE(SUM(ct.amount),0) FROM card_transactions ct WHERE ct.card_id = cc.id
        AND ct.transaction_date >= strftime('%Y-%m-01', 'now')) as month_total
     FROM corporate_cards cc WHERE cc.is_active = 1${ef.clause} ORDER BY cc.card_name`
  ).bind(...ef.params).all()
  return c.json({ success: true, data: results })
})

// POST /cards
cardExpensesRouter.post('/cards', async (c) => {
  const body = await c.req.json() as any
  const { card_name, card_company, card_number_last4, holder_name, monthly_limit } = body
  if (!card_name || !card_company) return c.json({ success: false, error: '카드명과 카드사는 필수입니다.' }, 400)

  const result = await c.env.DB.prepare(
    `INSERT INTO corporate_cards (card_name, card_company, card_number_last4, holder_name, monthly_limit, entity_id)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(card_name, card_company, card_number_last4 || null, holder_name || null,
    monthly_limit || 0, getEntityId(c)).run()

  return c.json({ success: true, data: { id: result.meta.last_row_id } })
})

// PUT /cards/:id
cardExpensesRouter.put('/cards/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json() as any
  const fields: string[] = []
  const params: any[] = []

  if (body.card_name !== undefined) { fields.push('card_name = ?'); params.push(body.card_name) }
  if (body.card_company !== undefined) { fields.push('card_company = ?'); params.push(body.card_company) }
  if (body.card_number_last4 !== undefined) { fields.push('card_number_last4 = ?'); params.push(body.card_number_last4) }
  if (body.holder_name !== undefined) { fields.push('holder_name = ?'); params.push(body.holder_name) }
  if (body.monthly_limit !== undefined) { fields.push('monthly_limit = ?'); params.push(body.monthly_limit) }

  if (!fields.length) return c.json({ success: false, error: '수정할 항목이 없습니다.' }, 400)
  fields.push('updated_at = CURRENT_TIMESTAMP')
  params.push(id)

  await c.env.DB.prepare(
    `UPDATE corporate_cards SET ${fields.join(', ')} WHERE id = ?`
  ).bind(...params).run()
  return c.json({ success: true })
})

// DELETE /cards/:id (soft delete)
cardExpensesRouter.delete('/cards/:id', async (c) => {
  await c.env.DB.prepare(
    'UPDATE corporate_cards SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).bind(c.req.param('id')).run()
  return c.json({ success: true })
})

// ============================================================================
// 카드 사용 내역
// ============================================================================

// GET /transactions — 내역 목록 (필터)
cardExpensesRouter.get('/transactions', async (c) => {
  const { card_id, status, category_id, start_date, end_date, search, page = '1', limit = '50' } = c.req.query()
  const ef = entityFilter(c, 'ct')
  const where: string[] = [`1=1${ef.clause}`]
  const params: any[] = [...ef.params]

  if (card_id) { where.push('ct.card_id = ?'); params.push(card_id) }
  if (status) { where.push('ct.status = ?'); params.push(status) }
  if (category_id) { where.push('ct.category_id = ?'); params.push(category_id) }
  if (start_date) { where.push('ct.transaction_date >= ?'); params.push(start_date) }
  if (end_date) { where.push('ct.transaction_date <= ?'); params.push(end_date) }
  if (search) { where.push('ct.merchant_name LIKE ?'); params.push(`%${search}%`) }

  const offset = (parseInt(page) - 1) * parseInt(limit)
  const whereClause = where.join(' AND ')

  const [countRes, dataRes] = await Promise.all([
    c.env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM card_transactions ct WHERE ${whereClause}`
    ).bind(...params).first<{ cnt: number }>(),
    c.env.DB.prepare(
      `SELECT ct.*, cc.card_name, cc.card_company, cc.card_number_last4,
              ec.name as category_name, ec.icon as category_icon, ec.color as category_color
       FROM card_transactions ct
       LEFT JOIN corporate_cards cc ON cc.id = ct.card_id
       LEFT JOIN expense_categories ec ON ec.id = ct.category_id
       WHERE ${whereClause}
       ORDER BY ct.transaction_date DESC, ct.transaction_time DESC
       LIMIT ? OFFSET ?`
    ).bind(...params, parseInt(limit), offset).all()
  ])

  return c.json({
    success: true,
    data: dataRes.results,
    pagination: { total: countRes?.cnt || 0, page: parseInt(page), limit: parseInt(limit) }
  })
})

// GET /transactions/summary — 월별/카드별 요약
cardExpensesRouter.get('/transactions/summary', async (c) => {
  const ef = entityFilter(c, 'ct')

  // 이번달 요약
  const monthSummary = await c.env.DB.prepare(`
    SELECT COUNT(*) as total_count,
           COALESCE(SUM(amount),0) as total_amount,
           SUM(CASE WHEN status='UNCLASSIFIED' THEN 1 ELSE 0 END) as unclassified_count,
           SUM(CASE WHEN status='CLASSIFIED' THEN 1 ELSE 0 END) as classified_count,
           SUM(CASE WHEN status='REQUESTED' THEN 1 ELSE 0 END) as requested_count,
           SUM(CASE WHEN status='APPROVED' THEN 1 ELSE 0 END) as approved_count
    FROM card_transactions ct
    WHERE ct.transaction_date >= strftime('%Y-%m-01', 'now')${ef.clause}
  `).bind(...ef.params).first()

  // 분류별 합계 (이번달)
  const { results: byCategory } = await c.env.DB.prepare(`
    SELECT ec.name, ec.icon, ec.color, COUNT(*) as cnt, COALESCE(SUM(ct.amount),0) as total
    FROM card_transactions ct
    LEFT JOIN expense_categories ec ON ec.id = ct.category_id
    WHERE ct.transaction_date >= strftime('%Y-%m-01', 'now')${ef.clause}
    GROUP BY ct.category_id ORDER BY total DESC
  `).bind(...ef.params).all()

  // 카드별 합계 (이번달)
  const { results: byCard } = await c.env.DB.prepare(`
    SELECT cc.card_name, cc.card_company, cc.card_number_last4, cc.monthly_limit,
           COUNT(*) as cnt, COALESCE(SUM(ct.amount),0) as total
    FROM card_transactions ct
    JOIN corporate_cards cc ON cc.id = ct.card_id
    WHERE ct.transaction_date >= strftime('%Y-%m-01', 'now')${ef.clause}
    GROUP BY ct.card_id ORDER BY total DESC
  `).bind(...ef.params).all()

  return c.json({ success: true, data: { summary: monthSummary, byCategory, byCard } })
})

// POST /transactions — 수동 등록
cardExpensesRouter.post('/transactions', async (c) => {
  const body = await c.req.json() as any
  const { card_id, transaction_date, merchant_name, amount, category_id, memo, installments } = body
  if (!card_id || !transaction_date || !amount) {
    return c.json({ success: false, error: '카드, 날짜, 금액은 필수입니다.' }, 400)
  }

  const result = await c.env.DB.prepare(`
    INSERT INTO card_transactions (card_id, transaction_date, merchant_name, amount, installments, category_id, memo, status, entity_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(card_id, transaction_date, merchant_name || null, amount, installments || 1,
    category_id || null, memo || null, category_id ? 'CLASSIFIED' : 'UNCLASSIFIED',
    getEntityId(c), c.get('user').id).run()

  return c.json({ success: true, data: { id: result.meta.last_row_id } })
})

// PUT /transactions/:id — 내역 수정 (분류/메모/영수증)
cardExpensesRouter.put('/transactions/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json() as any
  const fields: string[] = ['updated_at = CURRENT_TIMESTAMP']
  const params: any[] = []

  if (body.category_id !== undefined) { fields.push('category_id = ?'); params.push(body.category_id || null) }
  if (body.memo !== undefined) { fields.push('memo = ?'); params.push(body.memo || null) }
  if (body.receipt_data !== undefined) { fields.push('receipt_data = ?'); params.push(body.receipt_data || null) }
  if (body.merchant_name !== undefined) { fields.push('merchant_name = ?'); params.push(body.merchant_name) }
  if (body.amount !== undefined) { fields.push('amount = ?'); params.push(body.amount) }

  // 분류가 지정되면 CLASSIFIED로 변경
  if (body.category_id) {
    fields.push("status = CASE WHEN status = 'UNCLASSIFIED' THEN 'CLASSIFIED' ELSE status END")
  }

  params.push(id)
  await c.env.DB.prepare(
    `UPDATE card_transactions SET ${fields.join(', ')} WHERE id = ?`
  ).bind(...params).run()
  return c.json({ success: true })
})

// DELETE /transactions/:id
cardExpensesRouter.delete('/transactions/:id', async (c) => {
  const id = c.req.param('id')
  const tx = await c.env.DB.prepare(
    'SELECT status FROM card_transactions WHERE id = ?'
  ).bind(id).first<{ status: string }>()
  if (tx?.status === 'APPROVED') {
    return c.json({ success: false, error: '승인된 내역은 삭제할 수 없습니다.' }, 400)
  }
  await c.env.DB.prepare('DELETE FROM card_transactions WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// POST /transactions/bulk-classify — 일괄 분류
cardExpensesRouter.post('/transactions/bulk-classify', async (c) => {
  const body = await c.req.json() as { ids: number[]; category_id: number }
  if (!body.ids?.length || !body.category_id) {
    return c.json({ success: false, error: 'ids와 category_id가 필요합니다.' }, 400)
  }
  const ph = body.ids.map(() => '?').join(',')
  await c.env.DB.prepare(
    `UPDATE card_transactions SET category_id = ?, status = 'CLASSIFIED', updated_at = CURRENT_TIMESTAMP
     WHERE id IN (${ph}) AND status IN ('UNCLASSIFIED','CLASSIFIED')`
  ).bind(body.category_id, ...body.ids).run()
  return c.json({ success: true, data: { updated: body.ids.length } })
})

// POST /transactions/create-requests — 일괄 지출결의 생성
cardExpensesRouter.post('/transactions/create-requests', async (c) => {
  const body = await c.req.json() as { ids: number[] }
  if (!body.ids?.length) return c.json({ success: false, error: 'ids가 필요합니다.' }, 400)

  const ph = body.ids.map(() => '?').join(',')
  const { results: txList } = await c.env.DB.prepare(
    `SELECT ct.*, ec.name as category_name, cc.card_name
     FROM card_transactions ct
     LEFT JOIN expense_categories ec ON ec.id = ct.category_id
     LEFT JOIN corporate_cards cc ON cc.id = ct.card_id
     WHERE ct.id IN (${ph}) AND ct.status IN ('CLASSIFIED')`
  ).bind(...body.ids).all<any>()

  if (!txList.length) return c.json({ success: false, error: '분류 완료된 내역이 없습니다.' }, 400)

  const userId = c.get('user').id
  const entityId = getEntityId(c)
  const today = new Date().toISOString().substring(0, 10).replace(/-/g, '')

  // 일련번호 조회
  const seqRow = await c.env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM payment_requests WHERE request_number LIKE ?`
  ).bind(`PR-${today}-%`).first<{ cnt: number }>()
  let seq = (seqRow?.cnt || 0) + 1

  const stmts: any[] = []
  const txIds: number[] = []

  for (const tx of txList) {
    const reqNum = `PR-${today}-${String(seq++).padStart(3, '0')}`
    const desc = `[법인카드] ${tx.card_name || ''} - ${tx.merchant_name || ''} (${tx.category_name || '미분류'})`

    stmts.push(
      c.env.DB.prepare(`
        INSERT INTO payment_requests (request_number, request_date, request_type, amount, description, status, card_transaction_id, entity_id, created_by)
        VALUES (?, date('now'), 'EXPENSE', ?, ?, 'PENDING', ?, ?, ?)
      `).bind(reqNum, tx.amount, desc, tx.id, entityId, userId)
    )
    stmts.push(
      c.env.DB.prepare(
        `UPDATE card_transactions SET status = 'REQUESTED', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
      ).bind(tx.id)
    )
    txIds.push(tx.id)
  }

  await c.env.DB.batch(stmts)
  return c.json({ success: true, data: { created: txIds.length } })
})

// POST /transactions/import-csv — CSV 업로드 가져오기
cardExpensesRouter.post('/transactions/import-csv', async (c) => {
  const body = await c.req.json() as { card_id: number; rows: any[] }
  if (!body.card_id || !body.rows?.length) {
    return c.json({ success: false, error: 'card_id와 rows가 필요합니다.' }, 400)
  }

  const entityId = getEntityId(c)
  const userId = c.get('user').id
  let imported = 0

  for (const row of body.rows) {
    const txId = `csv_${body.card_id}_${row.date}_${row.time || ''}_${row.amount}`
    try {
      await c.env.DB.prepare(`
        INSERT OR IGNORE INTO card_transactions
          (card_id, transaction_date, transaction_time, merchant_name, amount, installments, codef_transaction_id, entity_id, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(body.card_id, row.date, row.time || null, row.merchant || null,
        Math.abs(parseFloat(row.amount) || 0), parseInt(row.installments) || 1,
        txId, entityId, userId).run()
      imported++
    } catch (_e) { /* duplicate, skip */ }
  }

  return c.json({ success: true, data: { imported, total: body.rows.length } })
})

export default cardExpensesRouter
