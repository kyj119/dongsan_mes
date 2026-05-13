import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'

const priceListsRouter = new Hono<HonoEnv>()

priceListsRouter.use('/*', authMiddleware)

// GET / — 단가표 목록 (배정된 거래처 수 포함)
priceListsRouter.get('/', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT pl.*, COUNT(c.id) as client_count
      FROM price_lists pl
      LEFT JOIN clients c ON c.price_list_id = pl.id AND c.is_active = 1
      GROUP BY pl.id
      ORDER BY pl.is_default DESC, pl.name
    `).all()

    return c.json({ price_lists: results })
  } catch (error) {
    console.error('src/routes/priceLists.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// POST / — 단가표 생성 (ADMIN, MANAGER)
priceListsRouter.post('/', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const body = await c.req.json()
    const { name, adjustment_percent, description } = body

    if (!name) {
      return c.json({ success: false, error: 'name is required' }, 400)
    }
    if (adjustment_percent === undefined || adjustment_percent === null || typeof adjustment_percent !== 'number') {
      return c.json({ success: false, error: 'adjustment_percent must be a number' }, 400)
    }

    const result = await c.env.DB.prepare(`
      INSERT INTO price_lists (name, adjustment_percent, description)
      VALUES (?, ?, ?)
    `).bind(name, adjustment_percent, description ?? null).run()

    return c.json({
      success: true,
      data: { id: result.meta.last_row_id }
    })
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// PATCH /:id — 단가표 수정
priceListsRouter.patch('/:id', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()

    const existing = await c.env.DB.prepare(
      'SELECT id FROM price_lists WHERE id = ?'
    ).bind(id).first()

    if (!existing) {
      return c.json({ success: false, error: 'Price list not found' }, 404)
    }

    const updates: string[] = []
    const params: any[] = []

    if (body.name !== undefined) {
      updates.push('name = ?')
      params.push(body.name)
    }
    if (body.adjustment_percent !== undefined) {
      updates.push('adjustment_percent = ?')
      params.push(body.adjustment_percent)
    }
    if (body.description !== undefined) {
      updates.push('description = ?')
      params.push(body.description)
    }

    if (updates.length === 0) {
      return c.json({ success: false, error: 'No fields to update' }, 400)
    }

    updates.push('updated_at = CURRENT_TIMESTAMP')
    params.push(id)

    await c.env.DB.prepare(`
      UPDATE price_lists SET ${updates.join(', ')} WHERE id = ?
    `).bind(...params).run()

    return c.json({ success: true })
  } catch (error) {
    console.error('src/routes/priceLists.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// DELETE /:id — 단가표 삭제
priceListsRouter.delete('/:id', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')

    const existing = await c.env.DB.prepare(
      'SELECT id, is_default FROM price_lists WHERE id = ?'
    ).bind(id).first<{ id: number; is_default: number }>()

    if (!existing) {
      return c.json({ success: false, error: 'Price list not found' }, 404)
    }

    if (existing.is_default) {
      return c.json({ success: false, error: '기본 단가표는 삭제할 수 없습니다.' }, 400)
    }

    const row = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM clients WHERE price_list_id = ? AND is_active = 1'
    ).bind(id).first<{ count: number }>()
    const count = row?.count ?? 0

    if (count > 0) {
      return c.json({
        success: false,
        error: `${count}개의 거래처가 이 단가표를 사용 중입니다. 먼저 거래처를 다른 단가표로 이동하세요.`
      }, 400)
    }

    await c.env.DB.prepare(
      'DELETE FROM price_lists WHERE id = ?'
    ).bind(id).run()

    return c.json({ success: true })
  } catch (error) {
    console.error('src/routes/priceLists.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// POST /bulk-assign — 여러 거래처를 단가표에 일괄 배정
priceListsRouter.post('/bulk-assign', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const body = await c.req.json()
    const { client_ids, price_list_id } = body

    if (!Array.isArray(client_ids) || client_ids.length === 0) {
      return c.json({ success: false, error: 'client_ids array is required' }, 400)
    }
    if (!price_list_id) {
      return c.json({ success: false, error: 'price_list_id is required' }, 400)
    }

    const priceList = await c.env.DB.prepare(
      'SELECT id FROM price_lists WHERE id = ?'
    ).bind(price_list_id).first()

    if (!priceList) {
      return c.json({ success: false, error: 'Price list not found' }, 404)
    }

    let updated = 0
    for (const clientId of client_ids) {
      const result = await c.env.DB.prepare(
        'UPDATE clients SET price_list_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).bind(price_list_id, clientId).run()
      updated += result.meta.changes ?? 0
    }

    return c.json({ success: true, updated })
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// GET /:id/preview — 단가표 적용 가격 미리보기
priceListsRouter.get('/:id/preview', async (c) => {
  try {
    const id = c.req.param('id')

    const priceList = await c.env.DB.prepare(
      'SELECT id, name, adjustment_percent, description, is_default FROM price_lists WHERE id = ?'
    ).bind(id).first<{ id: number; name: string; adjustment_percent: number; description: string | null; is_default: number }>()

    if (!priceList) {
      return c.json({ success: false, error: 'Price list not found' }, 404)
    }

    const { results } = await c.env.DB.prepare(`
      SELECT id, item_code, item_name, unit, base_price
      FROM items
      WHERE is_active = 1 AND base_price > 0
      ORDER BY item_name
    `).all<{ id: number; item_code: string; item_name: string; unit: string; base_price: number }>()

    const adjustmentPercent: number = priceList.adjustment_percent ?? 0
    const items = results.map((item) => ({
      ...item,
      adjusted_price: Math.round(item.base_price * (1 + adjustmentPercent / 100))
    }))

    return c.json({
      price_list: priceList,
      items
    })
  } catch (error) {
    console.error('src/routes/priceLists.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

export default priceListsRouter