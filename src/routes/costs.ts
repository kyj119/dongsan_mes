import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { entityFilter, getEntityId } from '../utils/entityFilter'
import { recalculateOrderCosts } from '../utils/costCalculator'

const costsRouter = new Hono<HonoEnv>()
costsRouter.use('/*', authMiddleware, requireRole('ADMIN', 'MANAGER'))

// GET / — 전체 원가 기준 목록 (로그인 사용자 모두)
costsRouter.get('/', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      'SELECT id, category_name, media_cost_per_sqm, ink_cost_per_sqm, description, updated_at FROM cost_standards ORDER BY category_name ASC'
    ).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('src/routes/costs.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// GET /categories — item_categories에서 카테고리 목록 조회 (원가 기준 등록용)
costsRouter.get('/categories', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      'SELECT DISTINCT category_name FROM item_categories WHERE is_active = 1 ORDER BY sort_order'
    ).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('src/routes/costs.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// PUT /:categoryName — 원가 기준 upsert (ADMIN/MANAGER)
costsRouter.put('/:categoryName', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const categoryName = decodeURIComponent(c.req.param('categoryName'))
    const body = await c.req.json()
    const { media_cost_per_sqm, ink_cost_per_sqm, description } = body

    if (media_cost_per_sqm === undefined || ink_cost_per_sqm === undefined) {
      return c.json({ success: false, error: 'media_cost_per_sqm, ink_cost_per_sqm 필드가 필요합니다.' }, 400)
    }

    const result = await c.env.DB.prepare(`
      INSERT INTO cost_standards (category_name, media_cost_per_sqm, ink_cost_per_sqm, description, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(category_name) DO UPDATE SET
        media_cost_per_sqm = excluded.media_cost_per_sqm,
        ink_cost_per_sqm = excluded.ink_cost_per_sqm,
        description = excluded.description,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `).bind(
      categoryName,
      parseFloat(media_cost_per_sqm) || 0,
      parseFloat(ink_cost_per_sqm) || 0,
      description || null
    ).first()

    return c.json({ success: true, data: result })
  } catch (error) {
    console.error('src/routes/costs.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// DELETE /:id — 원가 기준 삭제 (ADMIN)
costsRouter.delete('/:id', requireRole('ADMIN'), async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    if (isNaN(id)) {
      return c.json({ success: false, error: '유효하지 않은 ID입니다.' }, 400)
    }

    const existing = await c.env.DB.prepare(
      'SELECT id FROM cost_standards WHERE id = ?'
    ).bind(id).first()

    if (!existing) {
      return c.json({ success: false, error: '원가 기준을 찾을 수 없습니다.' }, 404)
    }

    await c.env.DB.prepare('DELETE FROM cost_standards WHERE id = ?').bind(id).run()

    return c.json({ success: true, data: { id } })
  } catch (error) {
    console.error('src/routes/costs.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// POST /recalculate/:orderId — 특정 주문의 원가 재계산 (ADMIN/MANAGER)
costsRouter.post('/recalculate/:orderId', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const orderId = parseInt(c.req.param('orderId'))
    if (isNaN(orderId)) {
      return c.json({ success: false, error: '유효하지 않은 주문 ID입니다.' }, 400)
    }

    const ef = entityFilter(c, 'orders')
    const order = await c.env.DB.prepare(
      `SELECT id FROM orders WHERE id = ?${ef.clause}`
    ).bind(orderId, ...ef.params).first()

    if (!order) {
      return c.json({ success: false, error: '주문을 찾을 수 없습니다.' }, 404)
    }

    await recalculateOrderCosts(c.env.DB, orderId)

    const { results: items } = await c.env.DB.prepare(
      `SELECT id, order_id, item_id, item_name, category_name,
              width, height, quantity, unit, unit_price, amount, vat_included,
              post_processing, content, sort_order, parent_item_id,
              scale_factor, finishing, ai_group_index
       FROM order_items WHERE order_id = ? ORDER BY id ASC`
    ).bind(orderId).all()

    return c.json({ success: true, data: items })
  } catch (error) {
    console.error('src/routes/costs.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// GET /analysis — 기간별 원가 분석 데이터
costsRouter.get('/analysis', async (c) => {
  try {
    const periodFrom = c.req.query('period_from')
    const periodTo = c.req.query('period_to')

    // cost_snapshots 조회
    const efSnap = entityFilter(c, '')
    let snapQuery = 'SELECT id, period, material_item_id, category_name, total_consumed_yd, total_consumed_sqm, total_produced_sqm, loss_rate, total_material_cost, avg_purchase_price_yd, material_cost_per_sqm, ink_total_cost, ink_cost_per_sqm, total_cost_per_sqm, created_at FROM cost_snapshots WHERE 1=1' + efSnap.clause
    const params: any[] = [...efSnap.params]

    if (periodFrom) {
      snapQuery += ' AND period >= ?'
      params.push(periodFrom)
    }
    if (periodTo) {
      snapQuery += ' AND period <= ?'
      params.push(periodTo)
    }

    snapQuery += ' ORDER BY period DESC, material_item_id ASC'

    const { results: snapshots } = await c.env.DB.prepare(snapQuery).bind(...params).all()

    // 집계 데이터
    const efAgg = entityFilter(c, '')
    let aggQuery = `
      SELECT
        AVG(total_cost_per_sqm) as avg_cost_per_sqm,
        AVG(loss_rate) as avg_loss_rate,
        SUM(total_consumed_sqm) as total_consumed_sqm,
        SUM(total_material_cost + ink_total_cost) as total_cost
      FROM cost_snapshots
      WHERE 1=1${efAgg.clause}
    `
    const aggParams: any[] = [...efAgg.params]

    if (periodFrom) {
      aggQuery += ' AND period >= ?'
      aggParams.push(periodFrom)
    }
    if (periodTo) {
      aggQuery += ' AND period <= ?'
      aggParams.push(periodTo)
    }

    const agg = await c.env.DB.prepare(aggQuery).bind(...aggParams).first()

    return c.json({
      success: true,
      data: {
        snapshots: snapshots || [],
        aggregate: agg || {}
      }
    })
  } catch (error) {
    console.error('src/routes/costs.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// POST /snapshot — 월별 원가 스냅샷 생성 (수동)
costsRouter.post('/snapshot', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const body = await c.req.json()
    const { period, material_item_id, category_name } = body

    if (!period) {
      return c.json({ success: false, error: 'period 필드가 필요합니다.' }, 400)
    }

    // 간단한 스냅샷 생성 (실제로는 소모량, 입고량, 기말재고 등에서 계산)
    const result = await c.env.DB.prepare(`
      INSERT INTO cost_snapshots (period, material_item_id, category_name, entity_id, created_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(period, material_item_id, category_name) DO UPDATE SET
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `).bind(period, material_item_id || null, category_name || null, getEntityId(c) || 1).first()

    return c.json({ success: true, data: result })
  } catch (error) {
    console.error('src/routes/costs.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// GET /deductions — 자동차감 이력 조회
costsRouter.get('/deductions', async (c) => {
  try {
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100)
    const offset = parseInt(c.req.query('offset') || '0')
    const materialItemId = c.req.query('material_item_id')
    const dateFrom = c.req.query('date_from')
    const dateTo = c.req.query('date_to')

    const ef = entityFilter(c, 'd')
    // #353: items JOIN으로 원단명 표시 (material_item_id 숫자 노출 해소)
    let query = 'SELECT d.id, d.print_event_id, d.material_item_id, d.deducted_length_mm, d.deducted_length_yd, d.output_width_mm, d.output_height_mm, d.copy_total, d.inventory_before, d.inventory_after, d.matched_width_mm, d.card_id, d.order_number, d.created_at, it.item_name, it.item_code FROM inventory_auto_deductions d LEFT JOIN items it ON d.material_item_id = it.id WHERE 1=1' + ef.clause
    const params: any[] = [...ef.params]

    if (materialItemId) {
      query += ' AND d.material_item_id = ?'
      params.push(parseInt(materialItemId))
    }
    if (dateFrom) {
      query += " AND DATE(d.created_at) >= ?"
      params.push(dateFrom)
    }
    if (dateTo) {
      query += " AND DATE(d.created_at) <= ?"
      params.push(dateTo)
    }

    query += ' ORDER BY d.created_at DESC LIMIT ? OFFSET ?'
    params.push(limit, offset)

    const { results } = await c.env.DB.prepare(query).bind(...params).all()

    // 전체 개수
    let countQuery = 'SELECT COUNT(*) as cnt FROM inventory_auto_deductions d WHERE 1=1' + ef.clause
    const countParams: any[] = [...ef.params]
    if (materialItemId) {
      countQuery += ' AND d.material_item_id = ?'
      countParams.push(parseInt(materialItemId))
    }
    if (dateFrom) {
      countQuery += " AND DATE(d.created_at) >= ?"
      countParams.push(dateFrom)
    }
    if (dateTo) {
      countQuery += " AND DATE(d.created_at) <= ?"
      countParams.push(dateTo)
    }

    const countRes = await c.env.DB.prepare(countQuery).bind(...countParams).first()

    return c.json({
      success: true,
      data: results || [],
      total: (countRes as any)?.cnt || 0,
      limit,
      offset
    })
  } catch (error) {
    console.error('src/routes/costs.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// GET /loss-rate — 로스율 데이터 (기간별, 원단별)
costsRouter.get('/loss-rate', async (c) => {
  try {
    const periodFrom = c.req.query('period_from')
    const periodTo = c.req.query('period_to')

    const efLoss = entityFilter(c, '')
    let query = 'SELECT period, material_item_id, loss_rate FROM cost_snapshots WHERE loss_rate > 0' + efLoss.clause
    const params: any[] = [...efLoss.params]

    if (periodFrom) {
      query += ' AND period >= ?'
      params.push(periodFrom)
    }
    if (periodTo) {
      query += ' AND period <= ?'
      params.push(periodTo)
    }

    query += ' ORDER BY period DESC, material_item_id ASC'

    const { results } = await c.env.DB.prepare(query).bind(...params).all()

    return c.json({
      success: true,
      data: results || []
    })
  } catch (error) {
    console.error('src/routes/costs.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

export default costsRouter
