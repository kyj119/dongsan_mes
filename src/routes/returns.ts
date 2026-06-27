import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { getEntityId, entityFilter } from '../utils/entityFilter'
import { getNextEntitySeqNumber, withSeqRetry } from '../utils/sequenceGenerator'
import { getItemDefaultZones } from '../utils/inventoryZone'

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

  // 번호 생성 — 법인코드 E{eid} 내장 (행 entity_id와 동일 eid). 채번 경로 통일.
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const returnNumber = await getNextEntitySeqNumber(c.env.DB, 'returns', 'return_number', getEntityId(c) || 1, today, { base: 'RMA-' })

  const result = await c.env.DB.prepare(`
    INSERT INTO returns (return_number, order_id, client_id, claim_id, return_date, return_reason, notes, entity_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    returnNumber, order_id, client_id, claim_id || null,
    return_date || new Date().toISOString().split('T')[0],
    return_reason, notes || null, getEntityId(c), userId
  ).run()

  const returnId = result.meta.last_row_id as number

  // #126 #137: 아이템 batch 실패 시 헤더 롤백 (고아 방지)
  const itemStmts = items.map((item: any) =>
    c.env.DB.prepare(`
      INSERT INTO return_items (return_id, order_item_id, quantity, condition, disposition, notes, entity_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(returnId, item.order_item_id, item.quantity, item.condition || 'UNKNOWN', item.disposition || null, item.notes || null, getEntityId(c) || 1)
  )
  try {
    if (itemStmts.length > 0) await c.env.DB.batch(itemStmts)
  } catch (e) {
    await c.env.DB.prepare('DELETE FROM returns WHERE id = ?').bind(returnId).run()
    throw e
  }

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

  // #133: 상태머신 전환 검증
  const transitions: Record<string, string[]> = {
    REQUESTED: ['APPROVED'],
    APPROVED: ['SHIPPED_BACK'],
    SHIPPED_BACK: ['RECEIVED'],
    RECEIVED: ['INSPECTED'],
    INSPECTED: ['RESOLVED'],
  }
  // #132: entity 격리
  const patchEf = entityFilter(c)
  const currentReturn = await c.env.DB.prepare(
    `SELECT status FROM returns WHERE id = ?${patchEf.clause}`
  ).bind(id, ...patchEf.params).first<{ status: string }>()
  if (!currentReturn) return c.json({ success: false, error: '반품을 찾을 수 없습니다.' }, 404)

  const allowed = transitions[currentReturn.status]
  if (!allowed || !allowed.includes(status)) {
    return c.json({ success: false, error: `${currentReturn.status} → ${status} 전환은 허용되지 않습니다.` }, 400)
  }

  let sql = `UPDATE returns SET status = ?, updated_at = CURRENT_TIMESTAMP`
  const binds: any[] = [status]

  if (resolution) { sql += ', resolution = ?'; binds.push(resolution) }
  if (refund_amount !== undefined) { sql += ', refund_amount = ?'; binds.push(refund_amount) }

  sql += ` WHERE id = ?${patchEf.clause}`
  binds.push(id, ...patchEf.params)

  await c.env.DB.prepare(sql).bind(...binds).run()

  // RESOLVED + RESTOCK → 재고 복원
  if (status === 'RESOLVED') {
    const { results: returnItems } = await c.env.DB.prepare(`
      SELECT ri.*, oi.item_id FROM return_items ri
      LEFT JOIN order_items oi ON ri.order_item_id = oi.id
      WHERE ri.return_id = ? AND ri.disposition = 'RESTOCK' AND oi.item_id IS NOT NULL
    `).bind(id).all<{ item_id: number; quantity: number }>()

    if (returnItems.length > 0) {
      const eid = getEntityId(c) || 1
      // 0396: 창고별 다중행 — 품목 기본창고로 환원 (NULL=미배정). 키 = (item, entity, zone)
      const zoneMap = await getItemDefaultZones(c.env.DB, returnItems.map(ri => ri.item_id))
      // #164: balance_after를 서브쿼리로 읽어 race condition 방지
      await c.env.DB.batch(
        returnItems.flatMap(ri => {
          const zoneId = zoneMap.get(ri.item_id) ?? null
          return [
            // 대상 창고 행이 없으면 생성 (UNIQUE=IFNULL(zone,0) → 미배정 NULL 행과 구분)
            c.env.DB.prepare(
              `INSERT OR IGNORE INTO inventory (item_id, entity_id, storage_zone_id, quantity) VALUES (?, ?, ?, 0)`
            ).bind(ri.item_id, eid, zoneId),
            c.env.DB.prepare(
              `UPDATE inventory SET quantity = quantity + ?, last_updated = CURRENT_TIMESTAMP
               WHERE item_id = ? AND entity_id = ? AND IFNULL(storage_zone_id,0) = IFNULL(?,0)`
            ).bind(ri.quantity, ri.item_id, eid, zoneId),
            c.env.DB.prepare(`
              INSERT INTO inventory_transactions
                (item_id, transaction_type, quantity, unit_price, total_amount,
                 reference_type, reference_id, reason, transaction_date, balance_after, entity_id, storage_zone_id)
              VALUES (?, 'IN', ?, 0, 0, 'RETURN', ?, '반품 입고', CURRENT_TIMESTAMP,
                (SELECT quantity FROM inventory WHERE item_id = ? AND entity_id = ? AND IFNULL(storage_zone_id,0) = IFNULL(?,0)), ?, ?)
            `).bind(ri.item_id, ri.quantity, id, ri.item_id, eid, zoneId, eid, zoneId),
          ]
        })
      )
    }
  }

  return c.json({ success: true })
})

// ─── 반품 상세 ───────────────────────────────────────────────────────────────
returns.get('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const retEf = entityFilter(c, 'r')
  const ret = await c.env.DB.prepare(`
    SELECT r.*, cl.client_name, o.order_number
    FROM returns r
    LEFT JOIN clients cl ON r.client_id = cl.id
    LEFT JOIN orders o ON r.order_id = o.id
    WHERE r.id = ? ${retEf.clause}
  `).bind(id, ...retEf.params).first()

  const { results: items } = await c.env.DB.prepare(`
    SELECT ri.*, oi.item_name, oi.quantity as original_qty
    FROM return_items ri
    LEFT JOIN order_items oi ON ri.order_item_id = oi.id
    WHERE ri.return_id = ?
  `).bind(id).all()

  return c.json({ success: true, data: { ...ret, items } })
})

export default returns
