import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware } from '../middleware/auth'
import { requirePagePermission } from '../middleware/permissions'

const ppRouter = new Hono<HonoEnv>()
ppRouter.use('/*', authMiddleware, requirePagePermission('/post-processing'))

// 여백 검증: 0~15cm 허용
const MARGIN_MIN = 0
const MARGIN_MAX = 15
function validateMargins(body: Record<string, unknown>): string | null {
  const fields = ['margin_left', 'margin_right', 'margin_top', 'margin_bottom'] as const
  for (const f of fields) {
    if (f in body) {
      const v = Number(body[f])
      if (isNaN(v)) return `${f}: 숫자를 입력하세요`
      if (v < MARGIN_MIN) return `${f}: ${MARGIN_MIN}cm 이상이어야 합니다`
      if (v > MARGIN_MAX) return `${f}: ${MARGIN_MAX}cm 이하여야 합니다`
    }
  }
  return null
}

// ── 후가공 옵션 목록 (소분류 정보 포함) ──────────────────────────────────────
ppRouter.get('/', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      `SELECT p.*, GROUP_CONCAT(s.subcat_name) as subcategory_names
       FROM post_processing_options p
       LEFT JOIN pp_option_subcategories pos ON p.id = pos.pp_option_id
       LEFT JOIN pp_applicable_subcategories s ON pos.subcat_id = s.id
       GROUP BY p.id
       ORDER BY p.is_active DESC, p.id ASC`
    ).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('src/routes/postProcessing.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ── 소분류 마스터 목록 ────────────────────────────────────────────────────────
ppRouter.get('/subcategories', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      `SELECT * FROM pp_applicable_subcategories WHERE is_active = 1 ORDER BY sort_order ASC`
    ).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('src/routes/postProcessing.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ── 소분류별 후가공 옵션 목록 ─────────────────────────────────────────────────
ppRouter.get('/by-subcategory/:subcatName', async (c) => {
  try {
    const subcatName = c.req.param('subcatName')
    const { results } = await c.env.DB.prepare(
      `SELECT DISTINCT p.*
       FROM post_processing_options p
       JOIN pp_option_subcategories pos ON p.id = pos.pp_option_id
       JOIN pp_applicable_subcategories s ON pos.subcat_id = s.id
       WHERE s.subcat_name = ? AND p.is_active = 1
       ORDER BY p.id ASC`
    ).bind(subcatName).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('src/routes/postProcessing.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ── 후가공 옵션 등록 ──────────────────────────────────────────────────────────
ppRouter.post('/', async (c) => {
  try {
    const body = await c.req.json<{
      option_code: string
      option_name: string
      description?: string
      margin_left?: number
      margin_right?: number
      margin_top?: number
      margin_bottom?: number
      additional_cost?: number
      parameter_schema?: string
      pricing_type?: string
      unit_price?: number
      pp_category?: string
    }>()

    if (!body.option_code || !body.option_name) {
      return c.json({ success: false, error: 'option_code and option_name are required' }, 400)
    }
    const marginErr = validateMargins(body as Record<string, unknown>)
    if (marginErr) return c.json({ success: false, error: marginErr }, 400)

    const result = await c.env.DB.prepare(`
      INSERT INTO post_processing_options
        (option_code, option_name, description,
         margin_left, margin_right, margin_top, margin_bottom,
         additional_cost, parameter_schema, pricing_type, unit_price, is_active, pp_category)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
      RETURNING *
    `).bind(
      body.option_code,
      body.option_name,
      body.description ?? null,
      body.margin_left ?? 0,
      body.margin_right ?? 0,
      body.margin_top ?? 0,
      body.margin_bottom ?? 0,
      body.additional_cost ?? 0,
      body.parameter_schema ?? null,
      body.pricing_type ?? 'fixed',
      body.unit_price ?? 0,
      body.pp_category ?? 'finish'
    ).first()

    return c.json({ success: true, data: result }, 201)
  } catch (error) {
    console.error('src/routes/postProcessing.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ── 후가공 옵션 수정 ──────────────────────────────────────────────────────────
ppRouter.patch('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json<Record<string, unknown>>()

    const fields = ['option_name', 'description', 'margin_left', 'margin_right', 'margin_top', 'margin_bottom',
                    'additional_cost', 'parameter_schema', 'pricing_type', 'unit_price', 'is_active', 'pp_category', 'display_on_card']
    const updates: string[] = []
    const values: unknown[] = []

    for (const f of fields) {
      if (f in body) {
        updates.push(`${f} = ?`)
        values.push(body[f])
      }
    }

    if (updates.length === 0) {
      return c.json({ success: false, error: 'No fields to update' }, 400)
    }
    const marginErr = validateMargins(body)
    if (marginErr) return c.json({ success: false, error: marginErr }, 400)

    values.push(id)
    const result = await c.env.DB.prepare(
      `UPDATE post_processing_options SET ${updates.join(', ')} WHERE id = ? RETURNING *`
    ).bind(...values).first()

    if (!result) return c.json({ success: false, error: 'Not found' }, 404)
    return c.json({ success: true, data: result })
  } catch (error) {
    console.error('src/routes/postProcessing.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ── 후가공 옵션 비활성화 ──────────────────────────────────────────────────────
ppRouter.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    await c.env.DB.prepare(`UPDATE post_processing_options SET is_active = 0 WHERE id = ?`).bind(id).run()
    return c.json({ success: true })
  } catch (error) {
    console.error('src/routes/postProcessing.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ── 특정 PP 옵션의 연결 소분류 조회 ──────────────────────────────────────────
ppRouter.get('/:id/subcategories', async (c) => {
  try {
    const id = c.req.param('id')
    const { results } = await c.env.DB.prepare(
      `SELECT s.* FROM pp_applicable_subcategories s
       JOIN pp_option_subcategories pos ON s.id = pos.subcat_id
       WHERE pos.pp_option_id = ?
       ORDER BY s.sort_order ASC`
    ).bind(id).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('src/routes/postProcessing.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ── 특정 PP 옵션의 소분류 연결 저장 (replace all) ─────────────────────────────
ppRouter.put('/:id/subcategories', async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json<{ subcat_ids: number[] }>()
    const subcatIds = body.subcat_ids || []

    // 기존 연결 삭제 후 새로 삽입
    await c.env.DB.prepare(
      `DELETE FROM pp_option_subcategories WHERE pp_option_id = ?`
    ).bind(id).run()

    if (subcatIds.length > 0) {
      const placeholders = subcatIds.map(() => '(?, ?)').join(', ')
      const values = subcatIds.flatMap(sid => [parseInt(id), sid])
      await c.env.DB.prepare(
        `INSERT INTO pp_option_subcategories (pp_option_id, subcat_id) VALUES ${placeholders}`
      ).bind(...values).run()
    }

    return c.json({ success: true })
  } catch (error) {
    console.error('src/routes/postProcessing.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ── 품목별 후가공 기본값 조회 (레거시) ───────────────────────────────────────
ppRouter.get('/item/:itemId', async (c) => {
  try {
    const itemId = c.req.param('itemId')
    const { results } = await c.env.DB.prepare(`
      SELECT
        d.id, d.item_id, d.pp_option_id, d.default_params,
        d.is_enabled_by_default, d.sort_order,
        p.option_code, p.option_name, p.description,
        p.margin_left, p.margin_right, p.margin_top, p.margin_bottom,
        p.additional_cost, p.parameter_schema, p.pricing_type, p.unit_price
      FROM item_post_processing_defaults d
      JOIN post_processing_options p ON d.pp_option_id = p.id
      WHERE d.item_id = ?
      ORDER BY d.sort_order ASC, d.id ASC
    `).bind(itemId).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('src/routes/postProcessing.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ── 품목별 후가공 기본값 설정 (upsert) ───────────────────────────────────────
ppRouter.post('/item/:itemId', async (c) => {
  try {
    const itemId = c.req.param('itemId')
    const body = await c.req.json<{
      pp_option_id: number
      default_params?: string
      is_enabled_by_default?: number
      sort_order?: number
    }>()

    if (!body.pp_option_id) {
      return c.json({ success: false, error: 'pp_option_id is required' }, 400)
    }

    const result = await c.env.DB.prepare(`
      INSERT INTO item_post_processing_defaults
        (item_id, pp_option_id, default_params, is_enabled_by_default, sort_order)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(item_id, pp_option_id) DO UPDATE SET
        default_params = excluded.default_params,
        is_enabled_by_default = excluded.is_enabled_by_default,
        sort_order = excluded.sort_order
      RETURNING *
    `).bind(
      itemId,
      body.pp_option_id,
      body.default_params ?? null,
      body.is_enabled_by_default ?? 1,
      body.sort_order ?? 0
    ).first()

    return c.json({ success: true, data: result }, 201)
  } catch (error) {
    console.error('src/routes/postProcessing.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ── 후가공 통계 ──────────────────────────────────────────────────────────────
ppRouter.get('/stats', async (c) => {
  try {
    const months = parseInt(c.req.query('months') || '6')
    const sinceDate = new Date()
    sinceDate.setMonth(sinceDate.getMonth() - months)
    const sinceDateStr = sinceDate.toISOString().slice(0, 10)

    // 월별 후가공 사용 건수 (최근 N개월)
    const { results: monthlyStats } = await c.env.DB.prepare(`
      SELECT
        strftime('%Y-%m', o.order_date) as month,
        json_extract(j.value, '$.code') as pp_code,
        json_extract(j.value, '$.name') as pp_name,
        COUNT(*) as usage_count,
        SUM(oi.quantity) as total_qty,
        SUM(CAST(oi.width AS REAL) / 100 * CAST(oi.height AS REAL) / 100 * oi.quantity) as total_area_sqm
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      JOIN json_each(oi.post_processing) j
      WHERE oi.post_processing IS NOT NULL
        AND oi.post_processing != '[]'
        AND o.order_date >= ?
      GROUP BY month, pp_code
      ORDER BY month DESC, usage_count DESC
    `).bind(sinceDateStr).all()

    // 전체 PP별 누적 통계
    const { results: totalStats } = await c.env.DB.prepare(`
      SELECT
        json_extract(j.value, '$.code') as pp_code,
        json_extract(j.value, '$.name') as pp_name,
        COUNT(*) as usage_count,
        SUM(oi.quantity) as total_qty,
        SUM(CAST(oi.width AS REAL) / 100 * CAST(oi.height AS REAL) / 100 * oi.quantity) as total_area_sqm,
        COUNT(DISTINCT oi.order_id) as order_count,
        COUNT(DISTINCT o.client_id) as client_count
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      JOIN json_each(oi.post_processing) j
      WHERE oi.post_processing IS NOT NULL
        AND oi.post_processing != '[]'
      GROUP BY pp_code
      ORDER BY usage_count DESC
    `).all()

    // 소분류별 PP 사용 빈도 (최근 N개월)
    const { results: subcatStats } = await c.env.DB.prepare(`
      SELECT
        i.category_name as subcategory,
        json_extract(j.value, '$.code') as pp_code,
        json_extract(j.value, '$.name') as pp_name,
        COUNT(*) as usage_count
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      JOIN items i ON oi.item_id = i.id
      JOIN json_each(oi.post_processing) j
      WHERE oi.post_processing IS NOT NULL
        AND oi.post_processing != '[]'
        AND o.order_date >= ?
      GROUP BY subcategory, pp_code
      ORDER BY subcategory, usage_count DESC
    `).bind(sinceDateStr).all()

    return c.json({
      success: true,
      data: { monthlyStats, totalStats, subcatStats, months }
    })
  } catch (error) {
    console.error('src/routes/postProcessing.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ── 품목별 후가공 기본값 삭제 ─────────────────────────────────────────────────
ppRouter.delete('/item/:itemId/:ppId', async (c) => {
  try {
    const itemId = c.req.param('itemId')
    const ppId = c.req.param('ppId')
    await c.env.DB.prepare(
      `DELETE FROM item_post_processing_defaults WHERE item_id = ? AND pp_option_id = ?`
    ).bind(itemId, ppId).run()
    return c.json({ success: true })
  } catch (error) {
    console.error('src/routes/postProcessing.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

export default ppRouter
