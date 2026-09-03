import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { entityFilter, getEntityId } from '../utils/entityFilter'
import { recalculateOrderCosts } from '../utils/costCalculator'
import { computeOrderLineCosts } from '../utils/orderLineCost'

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
// POST /backfill — 기존 주문에 원가를 소급으로 채운다 (ADMIN)
//
// ★왜 필요한가 — `cost_standards` 가 prod 0건이라 `order_items.total_cost` 가 22,973줄 전량 0이었다.
//   BOM 기반 계산(2026-09-02)으로 바뀌었지만 **신규 저장부터** 적용되므로, 과거분은 여기서 채운다.
//
// ⚠️전량을 한 번에 돌리지 않는다 — Worker subrequest 한도(1000)가 있고 주문당 라인 수만큼 쿼리가 난다.
//   `order_id_gt` 를 커서로 넘겨 여러 번 호출한다. `dry_run` 이면 커버리지만 세고 쓰지 않는다.
costsRouter.post('/backfill', requireRole('ADMIN'), async (c) => {
  try {
    const body = await c.req.json().catch(() => ({})) as any
    const limit = Math.min(Math.max(parseInt(body?.limit) || 30, 1), 100)
    const after = parseInt(body?.order_id_gt) || 0
    const dryRun = body?.dry_run === true

    const ef = entityFilter(c, 'o')
    const { results: orders } = await c.env.DB.prepare(
      `SELECT o.id FROM orders o WHERE o.id > ?${ef.clause} ORDER BY o.id ASC LIMIT ?`
    ).bind(after, ...ef.params, limit).all<{ id: number }>()
    const list = orders || []
    if (list.length === 0) {
      return c.json({ success: true, data: { processed: 0, hasMore: false, lastOrderId: after, coverage: {} } })
    }

    const coverage: Record<string, number> = {}
    const errorOrderIds: number[] = []
    if (dryRun) {
      // 쓰지 않고 커버리지만 — 「원가 0」과 「원가 미상」을 갈라 보기 위한 것이다.
      const ids = list.map((o) => o.id)
      const ph = ids.map(() => '?').join(',')
      const { results: lines } = await c.env.DB.prepare(
        `SELECT oi.id, oi.item_id, oi.width, oi.height, oi.quantity, i.category
         FROM order_items oi LEFT JOIN items i ON oi.item_id = i.id
         WHERE oi.order_id IN (${ph}) AND oi.parent_item_id IS NULL`
      ).bind(...ids).all<any>()
      // ★계산 경로는 저장 경로(`recalculateOrderCosts`)와 **같은 함수**다 — 종전엔 같은 3단
      //   레시피가 양쪽에 인라인돼 있어, 한쪽만 고치면 「백필이 보고하는 커버리지」와
      //   「실제로 저장되는 원가」가 조용히 갈릴 수 있었다(2026-09-03 리뷰).
      const rows = lines || []
      const costs = await computeOrderLineCosts(c.env.DB, rows.map((r: any) => ({
        item_id: r.item_id, width: r.width, height: r.height,
        quantity: Number(r.quantity) || 1, category: r.category,
      })))
      for (const lc of costs) coverage[lc.coverage] = (coverage[lc.coverage] || 0) + 1
    } else {
      for (const o of list) {
        try {
          await recalculateOrderCosts(c.env.DB, o.id)
          coverage.OK = (coverage.OK || 0) + 1
        } catch (e) {
          console.error('[costs/backfill] order ' + o.id, e)
          coverage.ERROR = (coverage.ERROR || 0) + 1
          // ★실패한 주문 번호를 **돌려준다**(2026-09-03 리뷰).
          //   커서(lastOrderId)는 그대로 전진하므로, 알려 주지 않으면 실패분이 **영구히 건너뛰어진다** —
          //   `total_cost` 가 0 인 채로 남는데 「백필 완료」로 보인다. 호출부가 이 목록을
          //   `POST /costs/recalculate/:orderId` 로 재시도하면 된다.
          errorOrderIds.push(o.id)
        }
      }
    }

    const lastOrderId = list[list.length - 1].id
    return c.json({
      success: true,
      data: {
        processed: list.length, hasMore: list.length === limit, lastOrderId,
        dry_run: dryRun, coverage,
        // 빈 배열이면 전부 성공. 값이 있으면 그 주문들은 커서가 지나갔으니 **따로 재시도해야 한다.**
        error_order_ids: errorOrderIds,
      },
    })
  } catch (error) {
    console.error('src/routes/costs.ts backfill error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

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

    query += ' ORDER BY d.created_at DESC, d.id DESC LIMIT ? OFFSET ?'  // 정렬 규약: 고유키 tie-break
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
