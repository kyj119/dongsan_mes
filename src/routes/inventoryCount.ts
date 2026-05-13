import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { getEntityId } from '../utils/entityFilter'

const inventoryCountRouter = new Hono<HonoEnv>()
inventoryCountRouter.use('/*', authMiddleware, requireRole('ADMIN', 'MANAGER'))

// GET / — 실사 목록 (페이징, 필터)
inventoryCountRouter.get('/', async (c) => {
  try {
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100)
    const offset = parseInt(c.req.query('offset') || '0')
    const status = c.req.query('status')

    let query = 'SELECT id, count_number, count_date, count_type, status, submitted_at, approved_at, notes FROM inventory_counts WHERE 1=1'
    const params: any[] = []

    if (status) {
      query += ' AND status = ?'
      params.push(status)
    }

    query += ' ORDER BY count_date DESC LIMIT ? OFFSET ?'
    params.push(limit, offset)

    const { results } = await c.env.DB.prepare(query).bind(...params).all()

    // 전체 개수
    let countQuery = 'SELECT COUNT(*) as cnt FROM inventory_counts WHERE 1=1'
    if (status) {
      countQuery += ' AND status = ?'
    }
    const countRes = await c.env.DB.prepare(countQuery).bind(...params.slice(0, -2)).first()

    return c.json({
      success: true,
      data: results || [],
      total: (countRes as any)?.cnt || 0,
      limit,
      offset
    })
  } catch (error) {
    console.error('src/routes/inventoryCount.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// POST / — 실사 생성 (DRAFT)
inventoryCountRouter.post('/', async (c) => {
  try {
    const body = await c.req.json()
    const { count_type = 'FULL', notes = '', category = '' } = body

    // count_number 생성: IC-YYYYMMDDHHMM
    const now = new Date()
    const countNumber = `IC-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
    const countDate = now.toISOString().substring(0, 10)

    // 부분 실사: count_type='PERIODIC'이고 category가 있으면 해당 카테고리만
    const actualType = category ? 'PERIODIC' : count_type
    const countNotes = category ? `[${category}] ${notes}` : notes

    // inventory_counts 생성
    const result = await c.env.DB.prepare(`
      INSERT INTO inventory_counts (count_number, count_date, count_type, status, notes, entity_id)
      VALUES (?, ?, ?, 'DRAFT', ?, ?)
    `).bind(countNumber, countDate, actualType, countNotes, getEntityId(c) || 1).run()

    const countId = (result.meta.last_row_id as number)

    // 품목 로드: category 필터 적용
    let itemQuery = `
      SELECT i.id, i.item_code, i.item_name, i.unit, i.category, inv.quantity
      FROM items i
      LEFT JOIN inventory inv ON i.id = inv.item_id
      WHERE i.is_active = 1 AND i.is_purchase_item = 1
    `
    const params: any[] = []
    if (category) {
      itemQuery += ' AND i.category = ?'
      params.push(category)
    }
    itemQuery += ' ORDER BY i.category, i.item_name'

    const { results: items } = await c.env.DB.prepare(itemQuery).bind(...params).all()

    if (items && items.length > 0) {
      await c.env.DB.batch(
        (items as any[]).map((item: any) =>
          c.env.DB.prepare(`
            INSERT INTO inventory_count_items (count_id, item_id, system_quantity, unit)
            VALUES (?, ?, ?, ?)
          `).bind(countId, item.id, item.quantity || 0, item.unit || 'YD')
        )
      )
    }

    return c.json({
      success: true,
      data: {
        id: countId,
        count_number: countNumber,
        count_date: countDate,
        count_type: actualType,
        status: 'DRAFT',
        notes: countNotes,
        item_count: (items || []).length
      }
    })
  } catch (error) {
    console.error('src/routes/inventoryCount.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// GET /:id — 실사 상세
inventoryCountRouter.get('/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'))

    const count = await c.env.DB.prepare(`
      SELECT * FROM inventory_counts WHERE id = ?
    `).bind(id).first()

    if (!count) {
      return c.json({ success: false, error: 'Count not found' }, 404)
    }

    const { results: items } = await c.env.DB.prepare(`
      SELECT ci.id, ci.count_id, ci.item_id, ci.system_quantity, ci.counted_quantity, ci.difference, ci.difference_pct, ci.unit, ci.notes,
             i.item_code, i.item_name
      FROM inventory_count_items ci
      JOIN items i ON ci.item_id = i.id
      WHERE ci.count_id = ?
      ORDER BY i.item_code
    `).bind(id).all()

    return c.json({
      success: true,
      data: {
        ...count,
        items: items || []
      }
    })
  } catch (error) {
    console.error('src/routes/inventoryCount.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// PUT /:id/items — 실사 항목 일괄 업데이트
inventoryCountRouter.put('/:id/items', async (c) => {
  try {
    const countId = parseInt(c.req.param('id'))
    const body = await c.req.json() as any
    const { items = [] } = body

    // 일괄 업데이트 (batch)
    if (items.length > 0) {
      await c.env.DB.batch(
        items.map((item: any) => {
          const systemQty = parseFloat(item.system_quantity)
          const countedQty = parseFloat(item.counted_quantity)
          const diff = countedQty - systemQty
          const diffPct = systemQty !== 0 ? (diff / systemQty) * 100 : 0
          return c.env.DB.prepare(`
            UPDATE inventory_count_items
            SET counted_quantity = ?, difference = ?, difference_pct = ?, notes = ?
            WHERE id = ? AND count_id = ?
          `).bind(countedQty, diff, diffPct, item.notes || '', item.id, countId)
        })
      )
    }

    return c.json({ success: true })
  } catch (error) {
    console.error('src/routes/inventoryCount.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// PATCH /:id/submit — 제출 (SUBMITTED)
inventoryCountRouter.patch('/:id/submit', async (c) => {
  try {
    const countId = parseInt(c.req.param('id'))
    const userId = c.req.header('X-User-Id') || 'system'

    const result = await c.env.DB.prepare(`
      UPDATE inventory_counts
      SET status = 'SUBMITTED', submitted_by = ?, submitted_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'DRAFT'
    `).bind(userId, countId).run()

    if ((result.meta.changes || 0) === 0) {
      return c.json({ success: false, error: 'Count not found or already submitted' }, 400)
    }

    return c.json({ success: true })
  } catch (error) {
    console.error('src/routes/inventoryCount.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// PATCH /:id/approve — 승인 (APPROVED) + inventory 보정
inventoryCountRouter.patch('/:id/approve', async (c) => {
  try {
    const countId = parseInt(c.req.param('id'))
    const userId = c.req.header('X-User-Id') || 'system'

    // 먼저 count 조회
    const count = await c.env.DB.prepare(`
      SELECT * FROM inventory_counts WHERE id = ?
    `).bind(countId).first() as any

    if (!count || count.status !== 'SUBMITTED') {
      return c.json({ success: false, error: 'Count not found or not submitted' }, 400)
    }

    // count_items 조회
    const { results: countItems } = await c.env.DB.prepare(`
      SELECT * FROM inventory_count_items WHERE count_id = ?
    `).bind(countId).all()

    // 각 항목별로 inventory 보정 + inventory_transactions 기록 (batch)
    if (countItems && countItems.length > 0) {
      const entityId = getEntityId(c) || 1
      await c.env.DB.batch(
        (countItems as any[]).flatMap((item: any) => [
          c.env.DB.prepare(`
            UPDATE inventory SET quantity = ?, updated_at = CURRENT_TIMESTAMP
            WHERE item_id = ?
          `).bind(item.counted_quantity, item.item_id),
          c.env.DB.prepare(`
            INSERT INTO inventory_transactions (item_id, transaction_type, quantity_before, quantity_after, quantity_change, reason, notes, created_by, created_at, entity_id)
            VALUES (?, 'ADJUST', ?, ?, ?, 'STOCK_COUNT', ?, ?, CURRENT_TIMESTAMP, ?)
          `).bind(
            item.item_id,
            item.system_quantity,
            item.counted_quantity,
            item.counted_quantity - item.system_quantity,
            `Inventory Count ID: ${countId}`,
            userId,
            entityId
          )
        ])
      )
    }

    // count 상태를 APPROVED로 변경
    await c.env.DB.prepare(`
      UPDATE inventory_counts
      SET status = 'APPROVED', approved_by = ?, approved_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(userId, countId).run()

    return c.json({ success: true })
  } catch (error) {
    console.error('src/routes/inventoryCount.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

export default inventoryCountRouter
