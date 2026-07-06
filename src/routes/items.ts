import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import type { Item, ItemCategory, ApiResponse, PaginatedResponse } from '../types/models'
import { authMiddleware, requireRole } from '../middleware/auth'
import { getEntityId, entityFilter, isZoneOwnedByEntity } from '../utils/entityFilter'
import { validateUpload } from '../utils/uploadValidation'

const itemsRouter = new Hono<HonoEnv>()

// Apply authentication middleware to all routes
itemsRouter.use('/*', authMiddleware)

// 단가 변경 이력 (구 print-system /price-history에서 이전) — /:id 보다 먼저 등록
itemsRouter.get('/price-history', async (c) => {
  try {
    const { target_type, target_id, limit: limitStr } = c.req.query()
    const limit = parseInt(limitStr || '20') || 20
    const ef = entityFilter(c, 'pch')
    let query = `SELECT pch.*, u.name as changed_by_name FROM price_change_history pch LEFT JOIN users u ON pch.changed_by = u.id WHERE 1=1${ef.clause}`
    const params: any[] = [...ef.params]
    if (target_type) { query += ' AND pch.target_type = ?'; params.push(target_type) }
    if (target_id) { query += ' AND pch.target_id = ?'; params.push(parseInt(target_id)) }
    query += ' ORDER BY pch.changed_at DESC LIMIT ?'; params.push(limit)
    const { results } = await c.env.DB.prepare(query).bind(...params).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('items GET /price-history error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다' }, 500)
  }
})

// Get all item categories
itemsRouter.get('/categories', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      'SELECT id, category_name, category_code, sort_order, is_active, created_at FROM item_categories WHERE is_active = 1 ORDER BY sort_order ASC'
    ).all<ItemCategory>()

    const response: ApiResponse<ItemCategory[]> = {
      success: true,
      data: results
    }

    return c.json(response)
  } catch (error) {
    console.error('src/routes/items.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다'
    }, 500)
  }
})

// Get items by category
itemsRouter.get('/category/:categoryId', async (c) => {
  try {
    const categoryId = c.req.param('categoryId')
    
    const { results } = await c.env.DB.prepare(`
      SELECT 
        i.*,
        ic.category_name,
        isc.subcategory_name
      FROM items i
      LEFT JOIN item_categories ic ON i.category_id = ic.id
      LEFT JOIN item_subcategories isc ON i.subcategory_id = isc.id
      WHERE i.category_id = ? AND i.is_active = 1
      ORDER BY i.item_name ASC
    `).bind(categoryId).all<Item>()

    const response: ApiResponse<Item[]> = {
      success: true,
      data: results
    }

    return c.json(response)
  } catch (error) {
    console.error('src/routes/items.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다'
    }, 500)
  }
})

// Get all items
itemsRouter.get('/', async (c) => {
  try {
    const { page = '1', limit = '50', category = '', type = '', search = '', item_type = '' } = c.req.query()
    const safeLimit = Math.min(parseInt(limit) || 50, 200)
    const offset = (parseInt(page) - 1) * safeLimit
    // include_inactive: 변종 base 연결 등 staged(is_active=0) 품목까지 검색해야 할 때
    const activeClause = c.req.query('include_inactive') === '1' ? '1=1' : 'i.is_active = 1'

    let query = `
      SELECT
        i.*,
        ic.category_name,
        isc.subcategory_name,
        i.category as category_direct,
        i.sub_category as sub_category_direct,
        i.width_mm,
        i.is_favorite
      FROM items i
      LEFT JOIN item_categories ic ON i.category_id = ic.id
      LEFT JOIN item_subcategories isc ON i.subcategory_id = isc.id
      WHERE ${activeClause}
    `
    const params: any[] = []

    // item_type 필터 (PRODUCT/GOODS/MATERIAL)
    if (item_type && ['PRODUCT', 'GOODS', 'MATERIAL'].includes(item_type)) {
      query += ' AND i.item_type = ?'
      params.push(item_type)
    }

    if (type === 'sales') {
      query += ' AND i.is_sales_item = 1'
    } else if (type === 'purchase') {
      query += ' AND i.is_purchase_item = 1'
    }

    // C2: 사용자별 사용품목 분리 — for_user=1 이면 현재 사용자 허용 그룹(+그룹없는 품목)만.
    // 규칙 없는 사용자=제한 없음(전체). 그룹 90개 초과 배정=사실상 전체라 제한 생략(바인드 한도).
    if (c.req.query('for_user') === '1') {
      const authUser = c.get('user') as { id?: number } | undefined
      if (authUser?.id) {
        const acc = await c.env.DB.prepare(
          'SELECT item_group FROM user_item_access WHERE user_id = ?'
        ).bind(authUser.id).all<{ item_group: string }>()
        const allowed = (acc.results || []).map((r) => r.item_group)
        if (allowed.length > 0 && allowed.length <= 90) {
          const ph = allowed.map(() => '?').join(',')
          query += ` AND (i.item_group IN (${ph}) OR i.item_group IS NULL)`
          params.push(...allowed)
        }
      }
    }

    if (category) {
      query += ' AND ic.category_code = ?'
      params.push(category)
    }

    if (search) {
      // 이름 또는 코드로 검색 (숫자만 입력해도 코드 매칭)
      query += ' AND (i.item_name LIKE ? OR i.item_code LIKE ?)'
      params.push(`%${search}%`, `%${search}%`)
    }

    const item_group = c.req.query('item_group')
    if (item_group) {
      query += ' AND i.item_group = ?'
      params.push(item_group)
    }

    query += ' ORDER BY i.is_favorite DESC, ic.sort_order, i.item_name ASC LIMIT ? OFFSET ?'
    params.push(safeLimit, offset)

    const { results } = await c.env.DB.prepare(query).bind(...params).all()

    // Get total count
    let countQuery = `SELECT COUNT(*) as count FROM items i LEFT JOIN item_categories ic ON i.category_id = ic.id WHERE ${activeClause}`
    const countParams: any[] = []

    if (item_type && ['PRODUCT', 'GOODS', 'MATERIAL'].includes(item_type)) {
      countQuery += ' AND i.item_type = ?'
      countParams.push(item_type)
    }

    if (type === 'sales') {
      countQuery += ' AND i.is_sales_item = 1'
    } else if (type === 'purchase') {
      countQuery += ' AND i.is_purchase_item = 1'
    }

    if (category) {
      countQuery += ' AND ic.category_code = ?'
      countParams.push(category)
    }

    if (search) {
      countQuery += ' AND (i.item_name LIKE ? OR i.item_code LIKE ?)'
      countParams.push(`%${search}%`, `%${search}%`)
    }

    const countRow = await c.env.DB.prepare(countQuery).bind(...countParams).first<{ count: number }>()
    const count = countRow?.count ?? 0

    const response: PaginatedResponse<Item> = {
      success: true,
      data: results as unknown as Item[],
      pagination: {
        page: parseInt(page),
        limit: safeLimit,
        total: count,
        total_pages: Math.ceil(count / safeLimit)
      }
    }

    return c.json(response)
  } catch (error) {
    console.error('src/routes/items.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다'
    }, 500)
  }
})

// ── 품목 그룹 관련 API (정적 경로 — /:id 보다 먼저 등록 필수) ──────────────

// Get all item groups (그룹 목록 조회)
itemsRouter.get('/groups', async (c) => {
  try {
    const { type = '' } = c.req.query()

    let query = `
      SELECT
        item_group,
        COUNT(*) as variant_count,
        GROUP_CONCAT(id) as item_ids,
        GROUP_CONCAT(width_mm) as widths,
        MIN(base_price) as min_price,
        MAX(base_price) as max_price,
        MAX(category) as category,
        MAX(sub_category) as sub_category,
        MAX(unit) as unit,
        MAX(pricing_method) as pricing_method,
        MAX(is_sales_item) as is_sales_item,
        MAX(is_purchase_item) as is_purchase_item
      FROM items
      WHERE is_active = 1 AND item_group IS NOT NULL AND item_group != ''
    `
    const params: any[] = []

    if (type === 'sales') {
      query += ' AND is_sales_item = 1'
    } else if (type === 'purchase') {
      query += ' AND is_purchase_item = 1'
    }

    query += ' GROUP BY item_group ORDER BY item_group ASC'

    const { results } = await c.env.DB.prepare(query).bind(...params).all()

    return c.json({
      success: true,
      data: results
    })
  } catch (error) {
    console.error('src/routes/items.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다'
    }, 500)
  }
})

// Get items in a specific group (그룹 내 품목 조회)
itemsRouter.get('/groups/:groupName', async (c) => {
  try {
    const groupName = decodeURIComponent(c.req.param('groupName'))

    const { results } = await c.env.DB.prepare(`
      SELECT
        i.*,
        ic.category_name,
        isc.subcategory_name
      FROM items i
      LEFT JOIN item_categories ic ON i.category_id = ic.id
      LEFT JOIN item_subcategories isc ON i.subcategory_id = isc.id
      WHERE i.item_group = ? AND i.is_active = 1
      ORDER BY i.group_sort ASC, i.width_mm ASC, i.item_name ASC
    `).bind(groupName).all()

    return c.json({
      success: true,
      data: results
    })
  } catch (error) {
    console.error('src/routes/items.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다'
    }, 500)
  }
})

// Bulk update items in a group (그룹 일괄 수정)
itemsRouter.patch('/groups/:groupName', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const groupName = decodeURIComponent(c.req.param('groupName'))
    const updates = await c.req.json()

    // 허용된 일괄 수정 필드만
    const allowedFields = ['category', 'sub_category', 'unit', 'base_price', 'pricing_method', 'is_sales_item', 'is_purchase_item', 'item_group']
    const setClauses: string[] = []
    const params: any[] = []

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        setClauses.push(`${key} = ?`)
        params.push(value)
      }
    }

    if (setClauses.length === 0) {
      return c.json({
        success: false,
        error: 'No valid fields to update'
      }, 400)
    }

    setClauses.push('updated_at = CURRENT_TIMESTAMP')
    params.push(groupName)

    const result = await c.env.DB.prepare(`
      UPDATE items SET ${setClauses.join(', ')}
      WHERE item_group = ? AND is_active = 1
    `).bind(...params).run()

    return c.json({
      success: true,
      message: `${result.meta.changes} items updated`,
      data: { updated: result.meta.changes }
    })
  } catch (error) {
    console.error('src/routes/items.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다'
    }, 500)
  }
})

// ── 규격그룹 → 변종품목 (spec: 2026-06-20-spec-group-variant-item-plan.md) ──
// 정적/2-세그먼트 경로 — /:id 보다 먼저 등록 필수.

// 변종 base 템플릿 목록 (주문 2단 picker용: spec_group 지정 + spec_value NULL + 활성 변종 보유)
itemsRouter.get('/variant-bases', async (c) => {
  try {
    const { type = '' } = c.req.query()
    const search = c.req.query('search') || ''
    let q = `
      SELECT b.id, b.item_code, b.item_name, b.item_group, b.spec_group_id, b.pricing_method,
        sg.name AS spec_group_name, sg.unit AS spec_unit,
        (SELECT COUNT(*) FROM items v WHERE v.item_group = b.item_group AND v.spec_value IS NOT NULL AND v.is_active = 1) AS variant_count
      FROM items b
      LEFT JOIN spec_groups sg ON sg.id = b.spec_group_id
      WHERE b.spec_group_id IS NOT NULL AND b.spec_value IS NULL
    `
    const params: any[] = []
    if (type === 'sales') q += ' AND b.is_sales_item = 1'
    else if (type === 'purchase') q += ' AND b.is_purchase_item = 1'
    if (search) { q += ' AND b.item_name LIKE ?'; params.push(`%${search}%`) }
    q += ' ORDER BY b.item_name ASC'
    const { results } = await c.env.DB.prepare(q).bind(...params).all<{ variant_count: number }>()
    return c.json({ success: true, data: (results || []).filter(r => r.variant_count > 0) })
  } catch (error) {
    console.error('src/routes/items.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다' }, 500)
  }
})

// 변종품목 통계 (item_group 별 매출/주문 — 통계 탭용, opt-in)
itemsRouter.get('/group-stats', async (c) => {
  try {
    const { type = '' } = c.req.query()
    let q = `
      SELECT i.item_group,
        COUNT(DISTINCT i.id) AS variant_count,
        MAX(i.category) AS category,
        MAX(i.item_type) AS item_type,
        MIN(i.base_price) AS min_price,
        MAX(i.base_price) AS max_price,
        COUNT(oi.id) AS order_count,
        COALESCE(SUM(oi.quantity), 0) AS total_qty,
        COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS total_revenue
      FROM items i
      LEFT JOIN order_items oi ON oi.item_id = i.id
      WHERE i.is_active = 1 AND i.item_group IS NOT NULL AND i.item_group != ''
    `
    const params: any[] = []
    if (type === 'sales') q += ' AND i.is_sales_item = 1'
    else if (type === 'purchase') q += ' AND i.is_purchase_item = 1'
    q += ' GROUP BY i.item_group ORDER BY total_revenue DESC'
    const { results } = await c.env.DB.prepare(q).bind(...params).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('src/routes/items.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다' }, 500)
  }
})

// 변종 생성 (멱등·비파괴 — 안전 3규칙 §4). base 품목 + 그룹 활성값 조합 → 빠진 변종만 생성.
itemsRouter.post('/:id/generate-variants', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json().catch(() => ({}))
    const valueCodes: string[] | null = Array.isArray(body.value_codes) ? body.value_codes : null

    const base = await c.env.DB.prepare('SELECT * FROM items WHERE id = ?').bind(id).first<any>()
    if (!base) return c.json({ success: false, error: '품목을 찾을 수 없습니다' }, 404)
    if (!base.spec_group_id) {
      return c.json({ success: false, error: '규격그룹이 지정되지 않은 품목입니다. 먼저 규격그룹을 지정하세요.' }, 400)
    }

    const { results: allVals } = await c.env.DB.prepare(
      'SELECT value_code, label, sort_order FROM spec_group_values WHERE group_id = ? AND is_active = 1 ORDER BY sort_order ASC'
    ).bind(base.spec_group_id).all<{ value_code: string; label: string; sort_order: number }>()
    let vals = allVals || []
    if (valueCodes) vals = vals.filter(v => valueCodes.includes(v.value_code))
    if (!vals.length) return c.json({ success: false, error: '생성할 규격값이 없습니다' }, 400)

    // 축2 (다축 — 게양방식 등): base.spec_group_id2 + body.value_codes2 가 있으면 카테시안 2D
    const valueCodes2: string[] | null = Array.isArray(body.value_codes2) ? body.value_codes2 : null
    let vals2: ({ value_code: string; label: string; sort_order: number } | null)[] = [null]
    if (base.spec_group_id2 && valueCodes2) {
      const { results: all2 } = await c.env.DB.prepare(
        'SELECT value_code, label, sort_order FROM spec_group_values WHERE group_id = ? AND is_active = 1 ORDER BY sort_order ASC'
      ).bind(base.spec_group_id2).all<{ value_code: string; label: string; sort_order: number }>()
      const f2 = (all2 || []).filter(v => valueCodes2.includes(v.value_code))
      if (f2.length) vals2 = f2
    }

    const groupName = base.item_group || base.item_name
    const created: any[] = []
    const skipped: string[] = []

    for (const v of vals) {
      for (const v2 of vals2) {
        const variantCode = v2 ? `${base.item_code}-${v.value_code}-${v2.value_code}` : `${base.item_code}-${v.value_code}`
        const variantName = v2 ? `${base.item_name} ${v.label} ${v2.label}` : `${base.item_name} ${v.label}`
        const exists = await c.env.DB.prepare('SELECT id FROM items WHERE item_code = ?').bind(variantCode).first()
        if (exists) { skipped.push(variantCode); continue }
        const res = await c.env.DB.prepare(`
          INSERT INTO items (
            item_code, item_name, item_type, category, sub_category, category_id, unit,
            base_price, sales_price, description, pricing_method, pricing_profile, is_active,
            is_sales_item, is_purchase_item, production_required,
            item_group, group_sort, spec_group_id, spec_value, spec_group_id2, spec_value2, width_mm
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          variantCode, variantName, base.item_type, base.category, base.sub_category, base.category_id, base.unit || 'EA',
          base.base_price || 0, base.sales_price || 0, base.description || null, base.pricing_method || 'FIXED', base.pricing_profile || null, base.is_active ?? 0,
          base.is_sales_item || 0, base.is_purchase_item || 0, base.production_required ?? 1,
          groupName, v.sort_order || 0, base.spec_group_id, v.value_code, v2 ? base.spec_group_id2 : null, v2 ? v2.value_code : null, base.width_mm || null
        ).run()
        created.push({ id: res.meta.last_row_id, item_code: variantCode, item_name: variantName })
      }
    }

    // base에 item_group 보강 (묶음 가시화)
    if (!base.item_group) {
      await c.env.DB.prepare('UPDATE items SET item_group = ? WHERE id = ?').bind(groupName, base.id).run()
    }

    return c.json({
      success: true,
      data: { created, skipped, created_count: created.length, skipped_count: skipped.length },
      message: `변종 ${created.length}개 생성 (${skipped.length}개 기존 유지)`
    })
  } catch (error) {
    console.error('src/routes/items.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다' }, 500)
  }
})

// base 품목의 변종 목록 (규격값 라벨 JOIN — 품목 페이지 묶음표시 + 주문 picker 2단)
itemsRouter.get('/:id/variants', async (c) => {
  try {
    const id = c.req.param('id')
    const base = await c.env.DB.prepare(
      'SELECT id, item_code, item_name, item_group, spec_group_id, pricing_method FROM items WHERE id = ?'
    ).bind(id).first<{ item_group: string }>()
    if (!base) return c.json({ success: false, error: '품목을 찾을 수 없습니다' }, 404)
    const { results } = await c.env.DB.prepare(`
      SELECT i.id, i.item_code, i.item_name, i.spec_value, i.spec_value2, i.base_price, i.sales_price, i.unit,
        i.is_active, i.is_sales_item, i.is_purchase_item,
        sgv.label AS spec_label, sgv.sort_order AS spec_sort,
        sgv2.label AS spec_label2, sgv2.sort_order AS spec_sort2
      FROM items i
      LEFT JOIN spec_group_values sgv ON sgv.group_id = i.spec_group_id AND sgv.value_code = i.spec_value
      LEFT JOIN spec_group_values sgv2 ON sgv2.group_id = i.spec_group_id2 AND sgv2.value_code = i.spec_value2
      WHERE i.item_group = ? AND i.spec_value IS NOT NULL
      ORDER BY COALESCE(sgv.sort_order, i.group_sort) ASC, COALESCE(sgv2.sort_order, 0) ASC, i.item_name ASC
    `).bind(base.item_group).all()
    return c.json({ success: true, data: { base, variants: results } })
  } catch (error) {
    console.error('src/routes/items.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다' }, 500)
  }
})

// GET /group-settings/:groupName — 그룹 단가 연동 설정 조회
itemsRouter.get('/group-settings/:groupName', async (c) => {
  try {
    const groupName = decodeURIComponent(c.req.param('groupName'))
    const row = await c.env.DB.prepare(
      'SELECT * FROM item_group_settings WHERE group_name = ?'
    ).bind(groupName).first()
    return c.json({ success: true, settings: row || { group_name: groupName, price_linked: 0 } })
  } catch (error) {
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// PUT /group-settings/:groupName — 그룹 단가 연동 설정 저장
itemsRouter.put('/group-settings/:groupName', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const groupName = decodeURIComponent(c.req.param('groupName'))
    const { price_linked, notes } = await c.req.json<{ price_linked: number; notes?: string }>()
    await c.env.DB.prepare(`
      INSERT INTO item_group_settings (group_name, price_linked, notes)
      VALUES (?, ?, ?)
      ON CONFLICT(group_name) DO UPDATE SET price_linked = ?, notes = ?
    `).bind(groupName, price_linked ? 1 : 0, notes || null, price_linked ? 1 : 0, notes || null).run()
    return c.json({ success: true })
  } catch (error) {
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// Search materials for mapping (purchase items with width_mm)
itemsRouter.get('/materials/search', async (c) => {
  try {
    const { search = '' } = c.req.query()

    let query = `
      SELECT id, item_name, width_mm
      FROM items
      WHERE is_active = 1 AND (is_purchase_item = 1 OR item_type = 'MATERIAL') AND width_mm IS NOT NULL
    `
    const params: any[] = []

    if (search) {
      query += ' AND item_name LIKE ?'
      params.push(`%${search}%`)
    }

    query += ' ORDER BY item_name ASC LIMIT 50'

    const { results } = await c.env.DB.prepare(query).bind(...params).all()

    return c.json({
      success: true,
      data: results
    })
  } catch (error) {
    console.error('src/routes/items.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다'
    }, 500)
  }
})

// Search material groups for bulk mapping (원단 그룹 검색 — 그룹 단위 매핑용)
itemsRouter.get('/materials/groups', async (c) => {
  try {
    const { search = '' } = c.req.query()

    let query = `
      SELECT item_group,
        COUNT(*) as item_count,
        GROUP_CONCAT(id) as item_ids,
        GROUP_CONCAT(item_name, ', ') as item_names,
        GROUP_CONCAT(width_mm) as widths
      FROM items
      WHERE is_active = 1
        AND (is_purchase_item = 1 OR item_type = 'MATERIAL')
        AND width_mm IS NOT NULL
        AND item_group IS NOT NULL AND item_group != ''
    `
    const params: any[] = []

    if (search) {
      query += ' AND item_group LIKE ?'
      params.push(`%${search}%`)
    }

    query += ' GROUP BY item_group ORDER BY item_group ASC'

    const { results } = await c.env.DB.prepare(query).bind(...params).all()

    return c.json({
      success: true,
      data: results
    })
  } catch (error) {
    console.error('src/routes/items.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다'
    }, 500)
  }
})

// ── 동적 /:id 라우트 (정적 경로 아래에 배치) ──────────────────────────────────

// Toggle item favorite status
itemsRouter.patch('/:id/favorite', async (c) => {
  try {
    const id = c.req.param('id')
    const { is_favorite } = await c.req.json()
    await c.env.DB.prepare('UPDATE items SET is_favorite = ? WHERE id = ?').bind(is_favorite ? 1 : 0, parseInt(id)).run()
    return c.json({ success: true })
  } catch (error) {
    console.error('src/routes/items.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다'
    }, 500)
  }
})

// Partial update item (선택적 필드만 수정)
itemsRouter.patch('/:id', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')
    const updates = await c.req.json()
    const allowedFields = ['item_name', 'specification', 'width_mm', 'sub_category', 'base_price', 'unit', 'sales_price', 'is_sales_item', 'item_group', 'is_purchase_item', 'production_required', 'spec_group_id', 'spec_value', 'spec_group_id2', 'spec_value2', 'deduction_method', 'sheet_spec', 'waste_factor', 'base_unit', 'pack_size', 'stock_mode']

    // #435: 차감방식 값 검증 — 화이트리스트 외 값은 autoDeduct에서 조용한 오차감 유발
    //  (sheet_spec 미정 BOARD → 4x8 폴백, method 오타 → ROLL 폭매칭/스킵). DB 도달 전 차단.
    if (updates.deduction_method !== undefined && !['ROLL', 'BOARD', 'NONE'].includes(updates.deduction_method)) {
      return c.json({ success: false, error: 'deduction_method는 ROLL/BOARD/NONE만 허용됩니다' }, 400)
    }
    // MU1: 다단위 검증 — stock_mode 화이트리스트, pack_size 양수
    if (updates.stock_mode !== undefined && updates.stock_mode !== null && updates.stock_mode !== '' && !['PACK', 'CONTINUOUS'].includes(updates.stock_mode)) {
      return c.json({ success: false, error: 'stock_mode는 PACK/CONTINUOUS만 허용됩니다' }, 400)
    }
    if (updates.pack_size !== undefined && updates.pack_size !== null && updates.pack_size !== '') {
      const ps = Number(updates.pack_size)
      if (!Number.isFinite(ps) || ps <= 0) {
        return c.json({ success: false, error: 'pack_size는 0 초과 숫자여야 합니다' }, 400)
      }
      updates.pack_size = ps
    }
    if (updates.sheet_spec !== undefined && updates.sheet_spec !== null && updates.sheet_spec !== '' && !['4x8', '3x6'].includes(updates.sheet_spec)) {
      return c.json({ success: false, error: 'sheet_spec은 4x8/3x6만 허용됩니다' }, 400)
    }
    if (updates.waste_factor !== undefined && updates.waste_factor !== null && updates.waste_factor !== '') {
      const wf = Number(updates.waste_factor)
      if (!Number.isFinite(wf) || wf <= 0 || wf > 5) {
        return c.json({ success: false, error: 'waste_factor는 0 초과 5 이하의 숫자여야 합니다' }, 400)
      }
      updates.waste_factor = wf
    }

    const setClauses: string[] = []
    const params: any[] = []

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        setClauses.push(`${key} = ?`)
        params.push(value ?? null)
      }
    }

    if (setClauses.length === 0) {
      return c.json({ success: false, error: 'No valid fields to update' }, 400)
    }

    // 단가 변경 이력 (base_price 또는 sales_price 변경 시)
    if (updates.base_price !== undefined || updates.sales_price !== undefined) {
      try {
        const old = await c.env.DB.prepare('SELECT base_price, sales_price FROM items WHERE id = ?').bind(parseInt(id)).first<{ base_price: number; sales_price: number }>()
        if (old) {
          const user = (c.get('user'))?.username || 'system'
          if (updates.base_price !== undefined && updates.base_price !== old.base_price) {
            await c.env.DB.prepare(
              `INSERT INTO price_change_history (target_type, target_id, field_name, old_value, new_value, changed_by, entity_id) VALUES ('ITEM', ?, 'base_price', ?, ?, ?, ?)`
            ).bind(parseInt(id), old.base_price || 0, updates.base_price || 0, user, getEntityId(c)).run()
          }
          if (updates.sales_price !== undefined && updates.sales_price !== old.sales_price) {
            await c.env.DB.prepare(
              `INSERT INTO price_change_history (target_type, target_id, field_name, old_value, new_value, changed_by, entity_id) VALUES ('ITEM', ?, 'sales_price', ?, ?, ?, ?)`
            ).bind(parseInt(id), old.sales_price || 0, updates.sales_price || 0, user, getEntityId(c)).run()
          }
        }
      } catch (_) { /* 이력 실패해도 무시 */ }
    }

    setClauses.push('updated_at = CURRENT_TIMESTAMP')
    params.push(parseInt(id))

    await c.env.DB.prepare(
      `UPDATE items SET ${setClauses.join(', ')} WHERE id = ?`
    ).bind(...params).run()

    return c.json({ success: true })
  } catch (error) {
    console.error('src/routes/items.ts PATCH error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다' }, 500)
  }
})

// 현재고 + 제작필요 여부 (주문서 재고부족 경고용) — /:id 보다 먼저 등록
itemsRouter.get('/:id/stock', async (c) => {
  try {
    const id = Number(c.req.param('id'))
    const entityId = getEntityId(c) || 1
    const item = await c.env.DB.prepare('SELECT production_required FROM items WHERE id = ?').bind(id).first<{ production_required: number }>()
    if (!item) return c.json({ success: false, error: 'not found' }, 404)
    const inv = await c.env.DB.prepare('SELECT COALESCE(SUM(quantity), 0) as quantity FROM inventory WHERE item_id = ? AND entity_id = ?').bind(id, entityId).first<{ quantity: number }>()
    return c.json({ success: true, data: { production_required: item.production_required, stock: inv?.quantity ?? 0 } })
  } catch (error) {
    console.error('src/routes/items.ts stock error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다' }, 500)
  }
})

// Get item by ID
itemsRouter.get('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const item = await c.env.DB.prepare(`
      SELECT id, category_id, subcategory_id, item_code, item_name, description, unit, base_price, sales_price, is_active, item_type, category, sub_category, is_sales_item, is_purchase_item, pricing_method, item_group, group_sort, width_mm, storage_zone_id, is_favorite, code_prefix, specification, production_required, spec_group_id, spec_value, spec_group_id2, spec_value2, deduction_method, sheet_spec, waste_factor, base_unit, pack_size, stock_mode, ecount_code, image_key, created_at, updated_at FROM items WHERE id = ?
    `).bind(id).first()

    if (!item) {
      return c.json({
        success: false,
        error: 'Item not found'
      }, 404)
    }

    return c.json({
      success: true,
      data: item
    })
  } catch (error) {
    console.error('src/routes/items.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다'
    }, 500)
  }
})

// ── 품목 사진 (T2): R2 업로드/서빙/삭제 — 키 items/photos/{id}_{timestamp}.{ext} ──

// POST /api/items/:id/photo — 사진 업로드 (기존 사진은 교체 후 R2 정리)
itemsRouter.post('/:id/photo', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')
    const item = await c.env.DB.prepare('SELECT id, image_key FROM items WHERE id = ?')
      .bind(id).first<{ id: number; image_key: string | null }>()
    if (!item) return c.json({ success: false, error: '품목을 찾을 수 없습니다' }, 404)

    const formData = await c.req.formData()
    const file = formData.get('file') as File | null
    if (!file) return c.json({ success: false, error: '파일 필수' }, 400)

    // 이미지 전용, 5MB 상한
    const v = validateUpload(file, {
      maxBytes: 5 * 1024 * 1024,
      allowedMimePrefixes: ['image/'],
      allowedExts: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    })
    if (!v.ok) return c.json({ success: false, error: v.error }, 400)

    const key = `items/photos/${id}_${Date.now()}.${v.ext}`
    await c.env.R2_BUCKET.put(key, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type || 'image/jpeg' },
    })
    await c.env.DB.prepare('UPDATE items SET image_key = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(key, id).run()

    // 이전 사진 R2 정리 (facility 패턴 — 실패 무시)
    if (item.image_key && item.image_key !== key && item.image_key.startsWith('items/')) {
      try { await c.env.R2_BUCKET.delete(item.image_key) } catch { /* ignore */ }
    }

    return c.json({ success: true, data: { image_key: key }, message: '사진 업로드 완료' })
  } catch (error) {
    console.error('items POST /:id/photo error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다' }, 500)
  }
})

// GET /api/items/:id/photo — R2 사진 서빙 (인증=Bearer 헤더 전용 → 프론트는 axios blob 경유 필수)
itemsRouter.get('/:id/photo', async (c) => {
  try {
    const id = c.req.param('id')
    const item = await c.env.DB.prepare('SELECT image_key FROM items WHERE id = ?')
      .bind(id).first<{ image_key: string | null }>()
    if (!item || !item.image_key) return c.json({ success: false, error: '사진 없음' }, 404)
    const obj = await c.env.R2_BUCKET.get(item.image_key)
    if (!obj) return c.json({ success: false, error: '사진 없음' }, 404)
    const headers = new Headers()
    headers.set('Content-Type', obj.httpMetadata?.contentType || 'image/jpeg')
    headers.set('Cache-Control', 'private')
    return new Response(obj.body, { headers })
  } catch (error) {
    console.error('items GET /:id/photo error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다' }, 500)
  }
})

// DELETE /api/items/:id/photo — R2 삭제 + image_key NULL
itemsRouter.delete('/:id/photo', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')
    const item = await c.env.DB.prepare('SELECT id, image_key FROM items WHERE id = ?')
      .bind(id).first<{ id: number; image_key: string | null }>()
    if (!item) return c.json({ success: false, error: '품목을 찾을 수 없습니다' }, 404)
    if (item.image_key && item.image_key.startsWith('items/')) {
      try { await c.env.R2_BUCKET.delete(item.image_key) } catch { /* ignore */ }
    }
    await c.env.DB.prepare('UPDATE items SET image_key = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(id).run()
    return c.json({ success: true, message: '사진 삭제 완료' })
  } catch (error) {
    console.error('items DELETE /:id/photo error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다' }, 500)
  }
})

// Create new item (MANAGER+ only)
itemsRouter.post('/', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const itemData = await c.req.json()

    // Validate required fields
    if (!itemData.item_name || !itemData.category) {
      return c.json({
        success: false,
        error: 'item_name and category are required'
      }, 400)
    }

    // 중복 등록 검사 (같은 이름 + 타입 + 규격)
    const itemType = itemData.item_type || 'PRODUCT'
    const specVal = itemData.specification || (itemData.width_mm ? (Math.round(itemData.width_mm / 10)) + 'cm' : '')
    const dupCheck = await c.env.DB.prepare(
      `SELECT id, item_name FROM items WHERE item_name = ? AND item_type = ? AND is_active = 1
       AND COALESCE(specification, '') = ? LIMIT 1`
    ).bind(itemData.item_name, itemType, specVal).first<{ id: number; item_name: string }>()
    if (dupCheck) {
      return c.json({
        success: false,
        error: `동일한 품목이 이미 존재합니다: ${dupCheck.item_name} (ID: ${dupCheck.id})`
      }, 409)
    }

    // item_type에 따라 is_sales_item / is_purchase_item 자동 설정
    let isSalesItem = itemData.is_sales_item || 0
    let isPurchaseItem = itemData.is_purchase_item || 0
    if (itemType === 'PRODUCT') {
      isSalesItem = 1
    } else if (itemType === 'MATERIAL') {
      isPurchaseItem = 1
    } else if (itemType === 'GOODS') {
      isSalesItem = 1
      isPurchaseItem = 1
    }

    // category_id 조회 (name 또는 code 매칭). 실패 시 '기타' fallback (FK 위반 방지).
    let categoryId = 0
    if (itemData.category) {
      const catRow = await c.env.DB.prepare(
        'SELECT id FROM item_categories WHERE category_name = ? OR category_code = ? LIMIT 1'
      ).bind(itemData.category, itemData.category).first<{ id: number }>()
      if (catRow) categoryId = catRow.id
    }
    if (!categoryId) {
      const fallback = await c.env.DB.prepare(
        `SELECT id FROM item_categories WHERE category_name = '기타' LIMIT 1`
      ).first<{ id: number }>()
      if (fallback) categoryId = fallback.id
      else {
        // '기타'도 없으면 첫 카테고리로 fallback
        const firstCat = await c.env.DB.prepare('SELECT id FROM item_categories ORDER BY id LIMIT 1').first<{ id: number }>()
        if (firstCat) categoryId = firstCat.id
        else return c.json({ success: false, error: '등록된 카테고리가 없습니다. 카테고리를 먼저 생성하세요.' }, 400)
      }
    }

    // item_code 자동 생성 (PM 통일 / RM 원자재)
    let codePrefix = 'PM'

    if (itemType === 'MATERIAL') {
      // 원자재: RM-X0001 형식 (하위 분류별)
      const rmSubCats: Record<string, string> = {
        '원단류': 'F', '판재류': 'P', '시트류': 'S', '잉크': 'I',
        '전사자재': 'T', '간판자재': 'G', '부자재': 'B', '배너대': 'E',
      }
      const rmCat = itemData.rm_sub_category || itemData.sub_category || '부자재'
      const letter = rmSubCats[rmCat] || 'X'
      codePrefix = `RM-${letter}`
      // 원자재 등록 시 category/sub_category 자동 설정
      if (!itemData.category) itemData.category = '원자재'
      if (!itemData.sub_category) itemData.sub_category = rmCat
      if (!itemData.item_group && itemData.item_name) {
        // item_group: 품목명에서 규격 부분 제거하여 그룹명 추출 (예: "포맥스 3T 백색 3×6" → "포맥스")
        itemData.item_group = itemData.item_name.split(' ')[0]
      }
      const rmPattern = `${codePrefix}%`
      const rmLast = await c.env.DB.prepare(
        'SELECT item_code FROM items WHERE item_code LIKE ? ORDER BY item_code DESC LIMIT 1'
      ).bind(rmPattern).first<{ item_code: string }>()
      let rmNext = 1
      if (rmLast) {
        const n = parseInt(rmLast.item_code.replace(codePrefix, ''))
        if (!isNaN(n)) rmNext = n + 1
      }
      var itemCode = `${codePrefix}${String(rmNext).padStart(4, '0')}`
    } else {
      // 판매 품목: PM-XXXX (카테고리 기반 범위)
      codePrefix = 'PM'
      const CATEGORY_RANGES: Record<string, { start: number; end: number }> = {
        '전사': { start: 5001, end: 5999 },
        '깃발': { start: 5001, end: 5999 },
        '윈드배너': { start: 5001, end: 5999 },
        '가로등배너': { start: 5001, end: 5999 },
        '태극기': { start: 6001, end: 6999 },
        '새마을기': { start: 6001, end: 6999 },
        '민방위기': { start: 6001, end: 6999 },
        '간판': { start: 7001, end: 7999 },
      }
      const DEFAULT_RANGE = { start: 8001, end: 8999 }

      // 범위 결정
      let range = DEFAULT_RANGE
      const cat = (itemData.category || '').toLowerCase()
      for (const [key, r] of Object.entries(CATEGORY_RANGES)) {
        if (cat.includes(key.toLowerCase())) { range = r; break }
      }

      // 채번
      const { results: lastItems } = await c.env.DB.prepare(`
        SELECT item_code FROM items WHERE item_code LIKE 'PM-%'
          AND CAST(SUBSTR(item_code, 4) AS INTEGER) BETWEEN ? AND ?
        ORDER BY CAST(SUBSTR(item_code, 4) AS INTEGER) DESC LIMIT 1
      `).bind(range.start, range.end).all<{ item_code: string }>()

      let nextNum = range.start
      if (lastItems.length > 0) {
        const n = parseInt(lastItems[0].item_code.replace('PM-', ''))
        if (!isNaN(n)) nextNum = n + 1
      }
      var itemCode = `PM-${String(nextNum).padStart(4, '0')}`
    }

    // #461: storage_zone 법인 소유 검증 (타법인 zone 차단, #368 도메인 일관)
    if (itemData.storage_zone_id != null && !(await isZoneOwnedByEntity(c, itemData.storage_zone_id))) {
      return c.json({ success: false, error: '유효하지 않은 창고입니다' }, 400)
    }

    // Insert new item
    const result = await c.env.DB.prepare(`
      INSERT INTO items (
        item_name, category, sub_category, unit,
        base_price, description, is_active,
        is_sales_item, is_purchase_item, pricing_method, width_mm,
        item_group, group_sort, item_type, category_id, item_code, storage_zone_id,
        code_prefix, specification, production_required,
        base_unit, pack_size, stock_mode
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      itemData.item_name,
      itemData.category,
      itemData.sub_category || null,
      itemData.unit || 'EA',
      itemData.base_price || 0,
      itemData.description || null,
      itemData.is_active !== undefined ? itemData.is_active : 1,
      isSalesItem,
      isPurchaseItem,
      itemData.pricing_method || 'FIXED',
      itemData.width_mm || null,
      itemData.item_group || null,
      itemData.group_sort || 0,
      itemType,
      categoryId,
      itemCode,
      itemData.storage_zone_id ?? null,
      codePrefix || null,
      itemData.specification || null,
      // 기성품/유통: 제작 불필요 기본값 — GOODS/MATERIAL=0, 그 외=1 (UI에서 수동 조정)
      itemData.production_required !== undefined ? (itemData.production_required ? 1 : 0) : (['GOODS', 'MATERIAL'].includes(itemType) ? 0 : 1),
      // MU1: 다단위 (NULL=단일단위·현행)
      itemData.base_unit || null,
      (itemData.pack_size != null && itemData.pack_size !== '') ? Number(itemData.pack_size) : null,
      itemData.stock_mode || 'CONTINUOUS'
    ).run()

    return c.json({
      success: true,
      data: { id: result.meta.last_row_id },
      message: 'Item created successfully'
    })
  } catch (error) {
    console.error('src/routes/items.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다'
    }, 500)
  }
})

// Bulk create items (원자재 일괄 등록 등)
itemsRouter.post('/bulk', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const { base, widths } = await c.req.json()

    // base: 공통 필드 (item_name, category, unit, base_price, item_type, item_group 등)
    // widths: [914, 1270, 1524, ...] 원단 폭 배열
    if (!base?.item_name || !base?.category || !Array.isArray(widths) || widths.length === 0) {
      return c.json({
        success: false,
        error: 'base (item_name, category) and widths array are required'
      }, 400)
    }

    const itemType = base.item_type || 'MATERIAL'
    let isSalesItem = 0
    let isPurchaseItem = 0
    if (itemType === 'PRODUCT') isSalesItem = 1
    else if (itemType === 'MATERIAL') isPurchaseItem = 1

    // category_id 조회 (name 또는 code 매칭). 실패 시 '기타' fallback (FK 위반 방지).
    let categoryId = 0
    const catRow = await c.env.DB.prepare(
      'SELECT id FROM item_categories WHERE category_name = ? OR category_code = ? LIMIT 1'
    ).bind(base.category, base.category).first<{ id: number }>()
    if (catRow) categoryId = catRow.id
    if (!categoryId) {
      const fallback = await c.env.DB.prepare(
        `SELECT id FROM item_categories WHERE category_name = '기타' LIMIT 1`
      ).first<{ id: number }>()
      if (fallback) categoryId = fallback.id
      else {
        const firstCat = await c.env.DB.prepare('SELECT id FROM item_categories ORDER BY id LIMIT 1').first<{ id: number }>()
        if (firstCat) categoryId = firstCat.id
        else return c.json({ success: false, error: '등록된 카테고리가 없습니다. 카테고리를 먼저 생성하세요.' }, 400)
      }
    }

    const created: number[] = []
    const typePrefix = itemType === 'MATERIAL' ? 'MAT' : itemType === 'GOODS' ? 'GDS' : 'PRD'

    for (let i = 0; i < widths.length; i++) {
      const w = parseInt(widths[i])
      if (!w || w <= 0) continue

      const itemCode = `${typePrefix}-${Date.now().toString(36).toUpperCase()}${i}`
      const itemName = base.item_name

      const result = await c.env.DB.prepare(`
        INSERT INTO items (
          item_name, category, sub_category, unit,
          base_price, description, is_active,
          is_sales_item, is_purchase_item, pricing_method, width_mm,
          item_group, group_sort, item_type, category_id, item_code, production_required
        ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        itemName,
        base.category,
        base.sub_category || null,
        base.unit || 'YD',
        base.base_price || 0,
        base.description || null,
        isSalesItem,
        isPurchaseItem,
        base.pricing_method || 'FIXED',
        w,
        base.item_group || base.item_name,
        i + 1,
        itemType,
        categoryId,
        itemCode,
        ['GOODS', 'MATERIAL'].includes(itemType) ? 0 : 1
      ).run()

      created.push(result.meta.last_row_id as number)
    }

    return c.json({
      success: true,
      data: { ids: created, count: created.length },
      message: `${created.length}개 품목이 일괄 생성되었습니다`
    })
  } catch (error) {
    console.error('src/routes/items.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다'
    }, 500)
  }
})

// Update item (MANAGER+ only)
itemsRouter.put('/:id', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')
    const itemData = await c.req.json()

    // #435: 차감방식 값 검증 — 화이트리스트 외 값은 autoDeduct 조용한 오차감 유발(sheet_spec 미정 BOARD→4x8 폴백 등)
    if (itemData.deduction_method !== undefined && itemData.deduction_method !== null && !['ROLL', 'BOARD', 'NONE'].includes(itemData.deduction_method)) {
      return c.json({ success: false, error: 'deduction_method는 ROLL/BOARD/NONE만 허용됩니다' }, 400)
    }
    if (itemData.sheet_spec !== undefined && itemData.sheet_spec !== null && itemData.sheet_spec !== '' && !['4x8', '3x6'].includes(itemData.sheet_spec)) {
      return c.json({ success: false, error: 'sheet_spec은 4x8/3x6만 허용됩니다' }, 400)
    }
    if (itemData.waste_factor !== undefined && itemData.waste_factor !== null && itemData.waste_factor !== '') {
      const wf = Number(itemData.waste_factor)
      if (!Number.isFinite(wf) || wf <= 0 || wf > 5) {
        return c.json({ success: false, error: 'waste_factor는 0 초과 5 이하의 숫자여야 합니다' }, 400)
      }
    }

    // Check if item exists (기존 category_id + 단가 preserve 용으로 조회)
    const existing = await c.env.DB.prepare(
      'SELECT id, category_id, base_price, sales_price FROM items WHERE id = ?'
    ).bind(id).first<{ id: number; category_id: number; base_price: number; sales_price: number }>()

    if (!existing) {
      return c.json({
        success: false,
        error: 'Item not found'
      }, 404)
    }

    // item_type에 따라 is_sales_item / is_purchase_item 자동 설정
    const itemType = itemData.item_type || 'PRODUCT'
    let isSalesItem = itemData.is_sales_item !== undefined ? itemData.is_sales_item : 0
    let isPurchaseItem = itemData.is_purchase_item !== undefined ? itemData.is_purchase_item : 0
    if (itemType === 'PRODUCT') {
      isSalesItem = 1
    } else if (itemType === 'MATERIAL') {
      isPurchaseItem = 1
    } else if (itemType === 'GOODS') {
      isSalesItem = 1
      isPurchaseItem = 1
    }

    // category_id 조회. 프론트 레거시 호환 위해 category_name 또는 category_code 둘 다 시도.
    // 실패 시 기존 값 유지 (FK 위반 방지).
    let categoryId: number = existing.category_id
    if (itemData.category) {
      const catRow = await c.env.DB.prepare(
        'SELECT id FROM item_categories WHERE category_name = ? OR category_code = ? LIMIT 1'
      ).bind(itemData.category, itemData.category).first<{ id: number }>()
      if (catRow) categoryId = catRow.id
    }

    // 원자재인 경우 rm_sub_category → sub_category 매핑
    let subCategory = itemData.sub_category || null
    if (itemType === 'MATERIAL' && itemData.rm_sub_category) {
      subCategory = itemData.rm_sub_category
    }

    // width_mm: 전송되지 않으면(undefined) 기존값 보존 (자동차감 매칭에 필수)
    const widthMmClause = itemData.width_mm !== undefined
      ? 'width_mm = ?,' : ''
    const widthMmParams = itemData.width_mm !== undefined
      ? [itemData.width_mm || null] : []

    // production_required(제작 필요/기성품): 전송 시에만 갱신, 미전송 시 기존값 보존
    const prodReqClause = itemData.production_required !== undefined
      ? 'production_required = ?,' : ''
    const prodReqParams = itemData.production_required !== undefined
      ? [itemData.production_required ? 1 : 0] : []

    // #435: 차감방식(MATERIAL 자동차감 분류) — 전송 시에만 갱신, 미전송 시 기존값 보존
    const dedMethodClause = itemData.deduction_method !== undefined ? 'deduction_method = ?,' : ''
    const dedMethodParams = itemData.deduction_method !== undefined ? [itemData.deduction_method || 'ROLL'] : []
    const sheetSpecClause = itemData.sheet_spec !== undefined ? 'sheet_spec = ?,' : ''
    const sheetSpecParams = itemData.sheet_spec !== undefined ? [itemData.sheet_spec || null] : []
    const wasteFactorClause = itemData.waste_factor !== undefined ? 'waste_factor = ?,' : ''
    const wasteFactorParams = itemData.waste_factor !== undefined
      ? [(itemData.waste_factor != null && itemData.waste_factor !== '') ? Number(itemData.waste_factor) : 1.0] : []

    // MU1: 다단위 — 전송 시에만 갱신, 미전송 시 기존값 보존
    const baseUnitClause = itemData.base_unit !== undefined ? 'base_unit = ?,' : ''
    const baseUnitParams = itemData.base_unit !== undefined ? [itemData.base_unit || null] : []
    const packSizeClause = itemData.pack_size !== undefined ? 'pack_size = ?,' : ''
    const packSizeParams = itemData.pack_size !== undefined
      ? [(itemData.pack_size != null && itemData.pack_size !== '') ? Number(itemData.pack_size) : null] : []
    const stockModeClause = itemData.stock_mode !== undefined ? 'stock_mode = ?,' : ''
    const stockModeParams = itemData.stock_mode !== undefined ? [itemData.stock_mode || 'CONTINUOUS'] : []

    // #461: storage_zone 법인 소유 검증 (타법인 zone 차단, #368 도메인 일관)
    if (itemData.storage_zone_id != null && !(await isZoneOwnedByEntity(c, itemData.storage_zone_id))) {
      return c.json({ success: false, error: '유효하지 않은 창고입니다' }, 400)
    }

    // Update item
    await c.env.DB.prepare(`
      UPDATE items SET
        item_name = ?,
        category = ?,
        sub_category = ?,
        unit = ?,
        base_price = ?,
        description = ?,
        is_active = ?,
        is_sales_item = ?,
        is_purchase_item = ?,
        pricing_method = ?,
        ${widthMmClause}
        item_group = ?,
        group_sort = ?,
        item_type = ?,
        category_id = ?,
        storage_zone_id = ?,
        specification = ?,
        ${prodReqClause}
        ${dedMethodClause}
        ${sheetSpecClause}
        ${wasteFactorClause}
        ${baseUnitClause}
        ${packSizeClause}
        ${stockModeClause}
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      itemData.item_name,
      itemData.category,
      subCategory,
      itemData.unit || 'EA',
      itemData.base_price || 0,
      itemData.description || null,
      itemData.is_active !== undefined ? itemData.is_active : 1,
      isSalesItem,
      isPurchaseItem,
      itemData.pricing_method || 'FIXED',
      ...widthMmParams,
      itemData.item_group || null,
      itemData.group_sort || 0,
      itemType,
      categoryId,
      itemData.storage_zone_id ?? null,
      itemData.specification || null,
      ...prodReqParams,
      ...dedMethodParams,
      ...sheetSpecParams,
      ...wasteFactorParams,
      ...baseUnitParams,
      ...packSizeParams,
      ...stockModeParams,
      id
    ).run()

    // 단가 변경 이력 기록
    const newPrice = itemData.base_price || 0
    if (existing.base_price !== undefined && newPrice !== existing.base_price) {
      try {
        await c.env.DB.prepare(
          `INSERT INTO price_change_history (target_type, target_id, field_name, old_value, new_value, changed_by, entity_id)
           VALUES ('ITEM', ?, 'base_price', ?, ?, ?, ?)`
        ).bind(parseInt(id), existing.base_price || 0, newPrice, (c.get('user'))?.username || 'system', getEntityId(c)).run()
      } catch (_) { /* 이력 실패해도 메인 로직 영향 없음 */ }
    }

    return c.json({
      success: true,
      message: 'Item updated successfully'
    })
  } catch (error) {
    console.error('src/routes/items.ts PUT error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다'
    }, 500)
  }
})

// Delete item (ADMIN only)
itemsRouter.delete('/:id', requireRole('ADMIN'), async (c) => {
  try {
    const id = c.req.param('id')

    // Check if item exists
    const existing = await c.env.DB.prepare(
      'SELECT id FROM items WHERE id = ?'
    ).bind(id).first()

    if (!existing) {
      return c.json({
        success: false,
        error: 'Item not found'
      }, 404)
    }

    // Soft delete
    await c.env.DB.prepare(
      'UPDATE items SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(id).run()

    return c.json({
      success: true,
      message: 'Item deleted successfully'
    })
  } catch (error) {
    console.error('src/routes/items.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다'
    }, 500)
  }
})

// Get materials mapped to a product
itemsRouter.get('/:id/materials', async (c) => {
  try {
    const productId = c.req.param('id')

    // Check if product exists and is a sales item or PRODUCT type
    const product = await c.env.DB.prepare(
      'SELECT id, is_sales_item, item_type FROM items WHERE id = ?'
    ).bind(productId).first<{ id: number; is_sales_item: number; item_type: string }>()

    if (!product) {
      return c.json({
        success: false,
        error: 'Product not found'
      }, 404)
    }

    if (!product.is_sales_item && product.item_type !== 'PRODUCT') {
      return c.json({
        success: false,
        error: 'Item is not a sales item'
      }, 400)
    }

    // Get mapped materials with inventory info (entity별 재고 필터)
    const entityId = getEntityId(c)
    const invEntityClause = entityId > 0 ? ' AND inv.entity_id = ?' : ''
    const invEntityParams = entityId > 0 ? [entityId] : []
    const { results } = await c.env.DB.prepare(`
      SELECT
        pm.id,
        pm.material_item_id,
        pm.is_default,
        m.item_name,
        m.width_mm,
        m.item_group,
        COALESCE(SUM(inv.quantity), 0) as current_stock
      FROM product_materials pm
      INNER JOIN items m ON pm.material_item_id = m.id
      LEFT JOIN inventory inv ON m.id = inv.item_id${invEntityClause}
      WHERE pm.product_item_id = ?
      GROUP BY pm.id
      ORDER BY pm.is_default DESC, m.item_group ASC, m.width_mm ASC
    `).bind(...invEntityParams, productId).all()

    return c.json({
      success: true,
      data: results
    })
  } catch (error) {
    console.error('src/routes/items.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다'
    }, 500)
  }
})

// Add material mapping to product
itemsRouter.post('/:id/materials', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const productId = c.req.param('id')
    const { material_item_id, is_default } = await c.req.json()

    if (!material_item_id) {
      return c.json({
        success: false,
        error: 'material_item_id is required'
      }, 400)
    }

    // Check if product exists and is a sales item or PRODUCT type
    const product = await c.env.DB.prepare(
      'SELECT id, is_sales_item, item_type FROM items WHERE id = ?'
    ).bind(productId).first<{ id: number; is_sales_item: number; item_type: string }>()

    if (!product) {
      return c.json({
        success: false,
        error: 'Product not found'
      }, 404)
    }

    if (!product.is_sales_item && product.item_type !== 'PRODUCT') {
      return c.json({
        success: false,
        error: 'Item is not a sales item'
      }, 400)
    }

    // Check if material exists and is a purchase item or MATERIAL type
    const material = await c.env.DB.prepare(
      'SELECT id, is_purchase_item, item_type FROM items WHERE id = ?'
    ).bind(material_item_id).first<{ id: number; is_purchase_item: number; item_type: string }>()

    if (!material) {
      return c.json({
        success: false,
        error: 'Material not found'
      }, 404)
    }

    if (!material.is_purchase_item && material.item_type !== 'MATERIAL') {
      return c.json({
        success: false,
        error: 'Material item is not a purchase item'
      }, 400)
    }

    // Insert mapping
    try {
      const result = await c.env.DB.prepare(`
        INSERT INTO product_materials (
          product_item_id, material_item_id, is_default
        ) VALUES (?, ?, ?)
      `).bind(
        productId,
        material_item_id,
        is_default ? 1 : 0
      ).run()

      return c.json({
        success: true,
        data: { id: result.meta.last_row_id },
        message: 'Material mapped successfully'
      })
    } catch (dbError) {
      if (dbError instanceof Error && dbError.message?.includes('UNIQUE')) {
        return c.json({
          success: false,
          error: 'This material is already mapped to this product'
        }, 400)
      }
      throw dbError
    }
  } catch (error) {
    console.error('src/routes/items.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다'
    }, 500)
  }
})

// Remove material mapping
itemsRouter.delete('/:id/materials/:materialItemId', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const productId = c.req.param('id')
    const materialItemId = c.req.param('materialItemId')

    // Delete mapping
    const result = await c.env.DB.prepare(`
      DELETE FROM product_materials
      WHERE product_item_id = ? AND material_item_id = ?
    `).bind(productId, materialItemId).run()

    if (result.meta.changes === 0) {
      return c.json({
        success: false,
        error: 'Material mapping not found'
      }, 404)
    }

    return c.json({
      success: true,
      message: 'Material mapping deleted successfully'
    })
  } catch (error) {
    console.error('src/routes/items.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다'
    }, 500)
  }
})

// Add all materials in a group to a product (원단 그룹 일괄 매핑)
itemsRouter.post('/:id/materials/group', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const productId = parseInt(c.req.param('id'))
    const { item_group } = await c.req.json()

    if (!item_group) {
      return c.json({ success: false, error: 'item_group is required' }, 400)
    }

    // 그룹 내 모든 원단 조회
    const { results: materials } = await c.env.DB.prepare(`
      SELECT id FROM items
      WHERE is_active = 1
        AND (is_purchase_item = 1 OR item_type = 'MATERIAL')
        AND width_mm IS NOT NULL
        AND item_group = ?
    `).bind(item_group).all()

    if (!materials || materials.length === 0) {
      return c.json({ success: false, error: '해당 그룹에 원단이 없습니다' }, 404)
    }

    // 일괄 매핑 (이미 있는 건 무시)
    let added = 0
    for (const mat of materials) {
      try {
        await c.env.DB.prepare(`
          INSERT OR IGNORE INTO product_materials (product_item_id, material_item_id, is_default)
          VALUES (?, ?, 0)
        `).bind(productId, mat.id).run()
        added++
      } catch {}
    }

    return c.json({
      success: true,
      message: `${added}개 원단 매핑 완료`,
      data: { added, total: materials.length }
    })
  } catch (error) {
    console.error('src/routes/items.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다'
    }, 500)
  }
})

// Remove all materials in a group from a product (원단 그룹 일괄 제거)
// 프론트엔드 호출 패턴: DELETE /:id/materials/group/:groupName
itemsRouter.delete('/:id/materials/group/:groupName', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const productId = parseInt(c.req.param('id'))
    const item_group = decodeURIComponent(c.req.param('groupName'))

    if (!item_group) {
      return c.json({ success: false, error: 'item_group is required' }, 400)
    }

    // 그룹 내 모든 원단 매핑 삭제
    const result = await c.env.DB.prepare(`
      DELETE FROM product_materials
      WHERE product_item_id = ?
        AND material_item_id IN (
          SELECT id FROM items
          WHERE is_active = 1
            AND (is_purchase_item = 1 OR item_type = 'MATERIAL')
            AND width_mm IS NOT NULL
            AND item_group = ?
        )
    `).bind(productId, item_group).run()

    return c.json({
      success: true,
      message: `${result.meta.changes}개 원단 매핑 삭제 완료`,
      data: { deleted: result.meta.changes }
    })
  } catch (error) {
    console.error('src/routes/items.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다'
    }, 500)
  }
})

export default itemsRouter