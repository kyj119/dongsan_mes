import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import type { Item, ItemCategory, ApiResponse, PaginatedResponse } from '../types/models'
import { authMiddleware, requireRole } from '../middleware/auth'

const itemsRouter = new Hono<HonoEnv>()

// Apply authentication middleware to all routes
itemsRouter.use('/*', authMiddleware)

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

    let query = `
      SELECT
        i.*,
        ic.category_name,
        isc.subcategory_name,
        i.category as category_direct,
        i.sub_category as sub_category_direct,
        i.width_mm,
        i.is_favorite,
        pm_sub.subcat_name as media_subcategory_name
      FROM items i
      LEFT JOIN item_categories ic ON i.category_id = ic.id
      LEFT JOIN item_subcategories isc ON i.subcategory_id = isc.id
      LEFT JOIN print_media pm ON i.print_media_id = pm.id
      LEFT JOIN pp_applicable_subcategories pm_sub ON pm.subcategory_id = pm_sub.id
      WHERE i.is_active = 1
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
    let countQuery = 'SELECT COUNT(*) as count FROM items i LEFT JOIN item_categories ic ON i.category_id = ic.id WHERE i.is_active = 1'
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
    const allowedFields = ['item_name', 'specification', 'width_mm', 'parent_media_id', 'sub_category', 'base_price', 'unit', 'sales_price', 'is_sales_item', 'item_group', 'is_purchase_item']
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
              `INSERT INTO price_change_history (target_type, target_id, field_name, old_value, new_value, changed_by) VALUES ('ITEM', ?, 'base_price', ?, ?, ?)`
            ).bind(parseInt(id), old.base_price || 0, updates.base_price || 0, user).run()
          }
          if (updates.sales_price !== undefined && updates.sales_price !== old.sales_price) {
            await c.env.DB.prepare(
              `INSERT INTO price_change_history (target_type, target_id, field_name, old_value, new_value, changed_by) VALUES ('ITEM', ?, 'sales_price', ?, ?, ?)`
            ).bind(parseInt(id), old.sales_price || 0, updates.sales_price || 0, user).run()
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

// Get item by ID
itemsRouter.get('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const item = await c.env.DB.prepare(`
      SELECT id, category_id, subcategory_id, item_code, item_name, description, unit, base_price, sales_price, is_active, item_type, category, sub_category, is_sales_item, is_purchase_item, pricing_method, item_group, group_sort, width_mm, storage_zone_id, is_favorite, print_method_id, print_media_id, parent_media_id, code_prefix, specification, created_at, updated_at FROM items WHERE id = ?
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
    const specVal = itemData.specification || (itemData.width_mm ? itemData.width_mm + 'mm' : '')
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

    // Insert new item
    const result = await c.env.DB.prepare(`
      INSERT INTO items (
        item_name, category, sub_category, unit,
        base_price, description, is_active,
        is_sales_item, is_purchase_item, pricing_method, width_mm,
        item_group, group_sort, item_type, category_id, item_code, storage_zone_id,
        code_prefix, parent_media_id, specification
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      itemData.parent_media_id || null,
      itemData.specification || null
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
          item_group, group_sort, item_type, category_id, item_code
        ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        itemCode
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
        parent_media_id = ?,
        specification = ?,
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
      itemData.parent_media_id ?? null,
      itemData.specification || null,
      id
    ).run()

    // 단가 변경 이력 기록
    const newPrice = itemData.base_price || 0
    if (existing.base_price !== undefined && newPrice !== existing.base_price) {
      try {
        await c.env.DB.prepare(
          `INSERT INTO price_change_history (target_type, target_id, field_name, old_value, new_value, changed_by)
           VALUES ('ITEM', ?, 'base_price', ?, ?, ?)`
        ).bind(parseInt(id), existing.base_price || 0, newPrice, (c.get('user'))?.username || 'system').run()
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

    // Get mapped materials with inventory info
    const { results } = await c.env.DB.prepare(`
      SELECT
        pm.id,
        pm.material_item_id,
        pm.is_default,
        m.item_name,
        m.width_mm,
        m.item_group,
        COALESCE(inv.quantity, 0) as current_stock
      FROM product_materials pm
      INNER JOIN items m ON pm.material_item_id = m.id
      LEFT JOIN inventory inv ON m.id = inv.item_id
      WHERE pm.product_item_id = ?
      ORDER BY pm.is_default DESC, m.item_group ASC, m.width_mm ASC
    `).bind(productId).all()

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
itemsRouter.post('/:id/materials/group', async (c) => {
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