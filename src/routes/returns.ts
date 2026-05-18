import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { getEntityId, entityFilter } from '../utils/entityFilter'

const returns = new Hono<HonoEnv>()
returns.use('*', authMiddleware)

// ─── 반품 목록 ───────────────────────────────────────────────────────────────
returns.get('/', async (c) => {
  const status = c.req.query('status')
  const eFilter = entityFilter(c, 'r')
  let where = `WHERE 1=1 ${eFilter.clause}`
  const binds: any[] = [...eFilter.params]
  if (status) { where += ' AND r.status = ?'; binds.push(status) }

  const { results } = await c.env.DB.prepare(`
    SELECT r.*, cl.client_name, o.order_number
    FROM returns r
    LEFT JOIN clients cl ON r.client_id = cl.id
    LEFT JOIN orders o ON r.order_id = o.id
    ${where}
    ORDER BY r.created_at DESC LIMIT 100
  `).bind(...binds).all()

  return c.json({ success: true, data: results })
})

// ─── 반품 생성 ───────────────────────────────────────────────────────────────
returns.post('/', async (c) => {
  const body = await c.req.json()
  const userId = c.get('user')?.id
  const { order_id, client_id, return_date, return_reason, items, claim_id, notes } = body

  if (!order_id || !client_id || !return_reason || !items?.length) {
    return c.json({ success: false, error: 'order_id, client_id, return_reason, items 필수' }, 400)
  }

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const { results: existing } = await c.env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM returns WHERE return_number LIKE ?`
  ).bind(`RMA-${today}-%`).all<{ cnt: number }>()
  const seq = (existing[0]?.cnt || 0) + 1
  const returnNumber = `RMA-${today}-${String(seq).padStart(3, '0')}`

  const result = await c.env.DB.prepare(`
    INSERT INTO returns (return_number, order_id, client_id, claim_id, return_date, return_reason, notes, entity_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    returnNumber, order_id, client_id, claim_id || null,
    return_date || new Date().toISOString().split('T')[0],
    return_reason, notes || null, getEntityId(c), userId
  ).run()

  const returnId = result.meta.last_row_id as number

  // 반품 아이템 생성
  const itemStmts = items.map((item: any) =>
    c.env.DB.prepare(`
      INSERT INTO return_items (return_id, order_item_id, quantity, condition, disposition, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(returnId, item.order_item_id, item.quantity, item.condition || 'UNKNOWN', item.disposition || null, item.notes || null)
  )
  if (itemStmts.length > 0) await c.env.DB.batch(itemStmts)

  return c.json({ success: true, data: { id: returnId, return_number: returnNumber } })
})

// ─── 반품 상태 변경 ──────────────────────────────────────────────────────────
returns.patch('/:id/status', requireRole('ADMIN', 'MANAGER'), async (c) => {
  const id = Number(c.req.param('id'))
  const { status, resolution, refund_amount } = await c.req.json()

  const validStatuses = ['REQUESTED', 'APPROVED', 'SHIPPED_BACK', 'RECEIVED', 'INSPECTED', 'RESOLVED']
  if (!validStatuses.includes(status)) {
    return c.json({ success: false, error: `유효한 상태: ${validStatuses.join(', ')}` }, 400)
  }

  let sql = `UPDATE returns SET status = ?, updated_at = CURRENT_TIMESTAMP`
  const binds: any[] = [status]

  if (resolution) { sql += ', resolution = ?'; binds.push(resolution) }
  if (refund_amount !== undefined) { sql += ', refund_amount = ?'; binds.push(refund_amount) }

  sql += ' WHERE id = ?'
  binds.push(id)

  await c.env.DB.prepare(sql).bind(...binds).run()

  // RESOLVED + RESTOCK → 재고 복원
  if (status === 'RESOLVED') {
    const { results: returnItems } = await c.env.DB.prepare(`
      SELECT ri.*, oi.item_id FROM return_items ri
      LEFT JOIN order_items oi ON ri.order_item_id = oi.id
      WHERE ri.return_id = ? AND ri.disposition = 'RESTOCK' AND oi.item_id IS NOT NULL
    `).bind(id).all<{ item_id: number; quantity: number }>()

    if (returnItems.length > 0) {
      const itemIds = returnItems.map(ri => ri.item_id)
      const placeholders = itemIds.map(() => '?').join(',')
      const { results: balances } = await c.env.DB.prepare(
        `SELECT item_id, quantity FROM inventory WHERE item_id IN (${placeholders})`
      ).bind(...itemIds).all<{ item_id: number; quantity: number }>()
      const balMap: Record<number, number> = {}
      for (const b of balances) balMap[b.item_id] = b.quantity

      const eid = getEntityId(c) || 1
      await c.env.DB.batch(
        returnItems.map(ri => {
          const balanceAfter = (balMap[ri.item_id] || 0) + ri.quantity
          return c.env.DB.prepare(`
            INSERT INTO inventory_transactions
              (item_id, transaction_type, quantity, unit_price, total_amount,
               reference_type, reference_id, reason, transaction_date, balance_after, entity_id)
            VALUES (?, 'IN', ?, 0, 0, 'RETURN', ?, '반품 입고', CURRENT_TIMESTAMP, ?, ?)
          `).bind(ri.item_id, ri.quantity, id, balanceAfter, eid)
        })
      )
    }
  }

  return c.json({ success: true })
})

// ─── 반품 상세 ───────────────────────────────────────────────────────────────
returns.get('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const ret = await c.env.DB.prepare(`
    SELECT r.*, cl.client_name, o.order_number
    FROM returns r
    LEFT JOIN clients cl ON r.client_id = cl.id
    LEFT JOIN orders o ON r.order_id = o.id
    WHERE r.id = ?
  `).bind(id).first()

  const { results: items } = await c.env.DB.prepare(`
    SELECT ri.*, oi.item_name, oi.quantity as original_qty
    FROM return_items ri
    LEFT JOIN order_items oi ON ri.order_item_id = oi.id
    WHERE ri.return_id = ?
  `).bind(id).all()

  return c.json({ success: true, data: { ...ret, items } })
})

export default returns
