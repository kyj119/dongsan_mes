import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'

const printSystemRouter = new Hono<HonoEnv>()

printSystemRouter.use('/*', authMiddleware)

// ============================================================================
// 코드 체계 매핑 — 출력방식별 코드 범위
// ============================================================================
const METHOD_RANGES: Record<string, { start: number; end: number }> = {
  'AQUEOUS': { start: 1001, end: 1999 },
  'SOLVENT': { start: 2001, end: 2999 },
  'UV':      { start: 3001, end: 3999 },
  'FLATBED': { start: 4001, end: 4999 },
}

/** 범위 기반 PM 코드 자동 채번 */
async function getNextPMCode(db: D1Database, rangeStart: number, rangeEnd: number): Promise<string> {
  const { results } = await db.prepare(`
    SELECT item_code FROM items
    WHERE item_code LIKE 'PM-%'
      AND CAST(SUBSTR(item_code, 4) AS INTEGER) BETWEEN ? AND ?
    ORDER BY CAST(SUBSTR(item_code, 4) AS INTEGER) DESC LIMIT 1
  `).bind(rangeStart, rangeEnd).all()

  let nextNum = rangeStart
  if (results.length > 0) {
    const lastCode = (results[0] as any).item_code as string
    const numPart = parseInt(lastCode.replace('PM-', ''))
    if (!isNaN(numPart)) nextNum = numPart + 1
  }
  if (nextNum > rangeEnd) throw new Error(`PM 코드 범위 초과: ${rangeStart}-${rangeEnd}`)
  return `PM-${String(nextNum).padStart(4, '0')}`
}

// ============================================================================
// Helper Functions
// ============================================================================

/** items.base_price 연쇄 업데이트 (method 또는 media 가격 변경 시) — items 직접 조회 */
async function updateLinkedItemPrices(db: D1Database, methodId?: number, mediaId?: number) {
  let updatedCount = 0

  if (methodId) {
    // method 단가 변경 → 해당 method의 모든 출력 품목 업데이트
    const method = await db.prepare('SELECT price_per_sqm FROM print_methods WHERE id = ?').bind(methodId).first() as any
    if (!method) return 0
    const { results: items } = await db.prepare(
      'SELECT i.id, i.print_media_id, pm.price_per_unit FROM items i JOIN print_media pm ON i.print_media_id = pm.id WHERE i.print_method_id = ? AND i.print_media_id IS NOT NULL AND i.is_active = 1'
    ).bind(methodId).all()
    for (const item of items as any[]) {
      const newPrice = (method.price_per_sqm || 0) + (item.price_per_unit || 0)
      await db.prepare('UPDATE items SET base_price = ?, updated_at = datetime(\'now\') WHERE id = ?').bind(newPrice, item.id).run()
      updatedCount++
    }
  }

  if (mediaId) {
    // media 단가 변경 → 해당 media의 모든 출력 품목 업데이트
    const media = await db.prepare('SELECT price_per_unit FROM print_media WHERE id = ?').bind(mediaId).first() as any
    if (!media) return 0
    const { results: items } = await db.prepare(
      'SELECT i.id, i.print_method_id, pm.price_per_sqm FROM items i JOIN print_methods pm ON i.print_method_id = pm.id WHERE i.print_media_id = ? AND i.print_method_id IS NOT NULL AND i.is_active = 1'
    ).bind(mediaId).all()
    for (const item of items as any[]) {
      const newPrice = (item.price_per_sqm || 0) + (media.price_per_unit || 0)
      await db.prepare('UPDATE items SET base_price = ?, updated_at = datetime(\'now\') WHERE id = ?').bind(newPrice, item.id).run()
      updatedCount++
    }
  }

  return updatedCount
}

/** 품목 자동 생성 — 출력방식 범위로 코드 생성 */
async function createLinkedItem(
  db: D1Database,
  methodId: number,
  mediaId: number,
  priceOverride?: number | null
) {
  const method = await db.prepare('SELECT * FROM print_methods WHERE id = ?').bind(methodId).first() as any
  const media = await db.prepare('SELECT * FROM print_media WHERE id = ?').bind(mediaId).first() as any

  if (!method || !media) return null

  const range = METHOD_RANGES[method.code] || { start: 8001, end: 8999 }
  const itemCode = await getNextPMCode(db, range.start, range.end)
  const itemName = `${method.name} ${media.name}`
  const basePrice = priceOverride ?? ((method.price_per_sqm || 0) + (media.price_per_unit || 0))

  // category_id: '기타' 카테고리를 폴백으로 사용
  const fallbackCat = await db.prepare(
    "SELECT id FROM item_categories WHERE category_name = '기타' LIMIT 1"
  ).first() as any
  const catId = fallbackCat?.id || 1

  const result = await db.prepare(`
    INSERT INTO items (
      item_name, item_code, code_prefix, item_type, category, category_id,
      base_price, pricing_method,
      is_sales_item, is_purchase_item, is_active,
      print_method_id, print_media_id,
      created_at, updated_at
    ) VALUES (?, ?, 'PM', 'PRODUCT', ?, ?, ?, 'AREA', 1, 0, 1, ?, ?, datetime('now'), datetime('now'))
  `).bind(
    itemName, itemCode, method.name, catId,
    basePrice,
    methodId, mediaId
  ).run()

  return { id: result.meta?.last_row_id, item_name: itemName, item_code: itemCode, base_price: basePrice }
}

// ============================================================================
// 1. GET /methods - 출력방식 목록
// ============================================================================
printSystemRouter.get('/methods', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      'SELECT * FROM print_methods WHERE is_active = 1 ORDER BY sort_order ASC, name ASC'
    ).all()

    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('printSystem /methods error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다' }, 500)
  }
})

// ============================================================================
// 2. PATCH /methods/:id - 출력방식 수정
// ============================================================================
printSystemRouter.patch('/methods/:id', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    const body = await c.req.json()
    const { name, price_per_sqm, sort_order, is_active } = body

    const sets: string[] = []
    const params: any[] = []

    if (name !== undefined) { sets.push('name = ?'); params.push(name) }
    if (price_per_sqm !== undefined) { sets.push('price_per_sqm = ?'); params.push(price_per_sqm) }
    if (sort_order !== undefined) { sets.push('sort_order = ?'); params.push(sort_order) }
    if (is_active !== undefined) { sets.push('is_active = ?'); params.push(is_active ? 1 : 0) }

    if (sets.length === 0) {
      return c.json({ success: false, error: '변경할 항목이 없습니다' }, 400)
    }

    // 단가 변경 이력 기록
    if (price_per_sqm !== undefined) {
      const oldMethod = await c.env.DB.prepare('SELECT price_per_sqm, name FROM print_methods WHERE id = ?').bind(id).first() as any
      if (oldMethod) {
        const userId = c.get('user')?.id || null
        await c.env.DB.prepare(
          "INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by) VALUES ('METHOD', ?, ?, ?, ?, ?)"
        ).bind(id, oldMethod.name, oldMethod.price_per_sqm, price_per_sqm, userId).run()
      }
    }

    sets.push("updated_at = datetime('now')")
    params.push(id)

    await c.env.DB.prepare(
      `UPDATE print_methods SET ${sets.join(', ')} WHERE id = ?`
    ).bind(...params).run()

    // price_per_sqm 변경 시 연쇄 업데이트
    let updatedItems = 0
    if (price_per_sqm !== undefined) {
      updatedItems = await updateLinkedItemPrices(c.env.DB, id)
    }

    return c.json({ success: true, data: { updated_items: updatedItems } })
  } catch (error) {
    console.error('printSystem PATCH /methods/:id error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다' }, 500)
  }
})

// ============================================================================
// 3. GET /media - 소재 목록
// ============================================================================
printSystemRouter.get('/media', async (c) => {
  try {
    const { group, type, search } = c.req.query()

    let query = `
      SELECT pm.*
      FROM print_media pm
      WHERE pm.is_active = 1
    `
    const params: any[] = []

    if (group) {
      query += ' AND pm.media_group = ?'
      params.push(group)
    }
    if (type) {
      query += ' AND pm.media_type = ?'
      params.push(type)
    }
    if (search) {
      query += ' AND pm.name LIKE ?'
      params.push(`%${search}%`)
    }

    query += ' ORDER BY pm.media_group ASC, pm.group_sort ASC, pm.sort_order ASC, pm.name ASC'

    const { results: mediaList } = await c.env.DB.prepare(query).bind(...params).all()

    // 각 소재에 연결된 출력방식 목록 조회 (items 테이블에서 직접)
    const mediaIds = (mediaList as any[]).map(m => m.id)
    let connectionMap: Record<number, any[]> = {}

    if (mediaIds.length > 0) {
      const placeholders = mediaIds.map(() => '?').join(',')
      const { results: connections } = await c.env.DB.prepare(`
        SELECT i.print_media_id, pm.id as method_id, pm.name as method_name
        FROM items i
        JOIN print_methods pm ON pm.id = i.print_method_id
        WHERE i.print_media_id IN (${placeholders})
          AND i.print_method_id IS NOT NULL
          AND i.is_active = 1
        GROUP BY i.print_media_id, pm.id
      `).bind(...mediaIds).all()

      for (const conn of connections as any[]) {
        if (!connectionMap[conn.print_media_id]) {
          connectionMap[conn.print_media_id] = []
        }
        connectionMap[conn.print_media_id].push({
          id: conn.method_id,
          name: conn.method_name,
          price_override: null
        })
      }
    }

    // 각 소재에 연결된 원자재(RM) 목록 조회 (IN 쿼리로 N+1 방지)
    let rmMap: Record<number, any[]> = {}

    if (mediaIds.length > 0) {
      const rmPlaceholders = mediaIds.map(() => '?').join(',')
      const { results: rmItems } = await c.env.DB.prepare(`
        SELECT i.id, i.item_code, i.item_name, i.width_mm, i.specification, i.parent_media_id,
               i.base_price, i.sales_price, i.is_sales_item
        FROM items i
        WHERE i.parent_media_id IN (${rmPlaceholders})
          AND i.is_active = 1
          AND i.item_type = 'MATERIAL'
        ORDER BY i.item_code
      `).bind(...mediaIds).all()

      for (const rm of rmItems as any[]) {
        if (!rmMap[rm.parent_media_id]) {
          rmMap[rm.parent_media_id] = []
        }
        rmMap[rm.parent_media_id].push({
          id: rm.id,
          item_code: rm.item_code,
          item_name: rm.item_name,
          width_mm: rm.width_mm,
          specification: rm.specification,
          base_price: rm.base_price || 0,
          sales_price: rm.sales_price || 0,
          is_sales_item: rm.is_sales_item || 0
        })
      }
    }

    // 그룹핑
    const groups: Record<string, any[]> = {}
    const ungrouped: any[] = []

    for (const media of mediaList as any[]) {
      const item = { ...media, methods: connectionMap[media.id] || [], raw_materials: rmMap[media.id] || [] }
      if (media.media_group) {
        if (!groups[media.media_group]) groups[media.media_group] = []
        groups[media.media_group].push(item)
      } else {
        ungrouped.push(item)
      }
    }

    return c.json({ success: true, data: { groups, ungrouped } })
  } catch (error) {
    console.error('printSystem GET /media error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다' }, 500)
  }
})

// ============================================================================
// 4. POST /media - 소재 추가
// ============================================================================
printSystemRouter.post('/media', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const body = await c.req.json()
    const {
      name, code, media_type, price_per_unit, unit,
      roll_width_cm, sheet_width_cm, sheet_height_cm,
      media_group, group_sort, method_ids
    } = body

    if (!name || !media_type) {
      return c.json({ success: false, error: '이름과 소재 타입은 필수입니다' }, 400)
    }

    // 중복 소재명 경고
    const dup = await c.env.DB.prepare(
      'SELECT id, name FROM print_media WHERE name = ? AND is_active = 1'
    ).bind(name).first() as any
    if (dup) {
      return c.json({ success: false, error: `동일 소재명이 이미 존재합니다: "${name}" (id=${dup.id})` }, 409)
    }

    // 소재 코드 자동 채번
    let mediaCode = code
    if (!mediaCode) {
      const pmLast = await c.env.DB.prepare(
        "SELECT code FROM print_media WHERE code LIKE 'PM-%' ORDER BY code DESC LIMIT 1"
      ).first() as any
      let pmNext = 1
      if (pmLast) {
        const n = parseInt(pmLast.code.replace('PM-', ''))
        if (!isNaN(n)) pmNext = n + 1
      }
      mediaCode = `PM-${String(pmNext).padStart(4, '0')}`
    }
    // entityId removed — items table has no entity_id column

    const result = await c.env.DB.prepare(`
      INSERT INTO print_media (
        name, code, media_type, price_per_unit, unit,
        roll_width_cm, sheet_width_cm, sheet_height_cm,
        media_group, group_sort, sort_order, is_active,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, datetime('now'), datetime('now'))
    `).bind(
      name, mediaCode, media_type, price_per_unit || 0, unit || 'EA',
      roll_width_cm || null, sheet_width_cm || null, sheet_height_cm || null,
      media_group || null, group_sort || null
    ).run()

    const mediaId = result.meta?.last_row_id as number

    // method_ids가 있으면 print_method_media 연결 + 품목 생성
    const createdItems: any[] = []
    if (method_ids && Array.isArray(method_ids)) {
      for (const methodId of method_ids) {
        // print_method_media 연결
        await c.env.DB.prepare(`
          INSERT OR IGNORE INTO print_method_media (print_method_id, print_media_id, created_at)
          VALUES (?, ?, datetime('now'))
        `).bind(methodId, mediaId).run()

        const item = await createLinkedItem(c.env.DB, methodId, mediaId, null)
        if (item) createdItems.push(item)
      }
    }

    return c.json({ success: true, data: { id: mediaId, created_items: createdItems } })
  } catch (error) {
    console.error('printSystem POST /media error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다' }, 500)
  }
})

// ============================================================================
// 5. POST /media/bulk - 소재 일괄 추가 (교차 생성 지원)
// ============================================================================
// body 형식 A (기존 호환): { base_name, media_type, variants: [{suffix, price_per_unit}], method_ids }
// body 형식 B (교차 생성): { base_name, media_type, axes: [{name, values}], prices, sheet_sizes, method_ids }
//   prices.type: 'by_first_axis' → { values: { '1T': 5000, ... } }
//   prices.type: 'matrix' → { values: { '1T_백색': 5000, '1T_검정': 5500, ... } }
printSystemRouter.post('/media/bulk', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const body = await c.req.json()
    const { base_name, media_type, method_ids, roll_width_cm } = body

    if (!base_name || !media_type) {
      return c.json({ success: false, error: '필수 항목이 누락되었습니다' }, 400)
    }

    // entityId removed — items table has no entity_id column
    const createdMedia: any[] = []
    const createdItems: any[] = []

    // sheet_sizes JSON (판재 복수 규격)
    const sheetSizes = body.sheet_sizes || null // [{w:90,h:180},{w:120,h:240}]
    const sheetSizesJson = sheetSizes ? JSON.stringify(sheetSizes) : null
    // 하위 호환: 첫 번째 규격을 sheet_width/height에도 저장
    const sheetW = sheetSizes?.[0]?.w || body.sheet_width_cm || null
    const sheetH = sheetSizes?.[0]?.h || body.sheet_height_cm || null

    // 교차 생성할 조합 목록 생성
    type MediaEntry = { suffix: string; price: number; sortKey: number }
    const entries: MediaEntry[] = []

    if (body.axes && Array.isArray(body.axes) && body.axes.length > 0) {
      // 형식 B: 교차 생성
      const axes: Array<{ name: string; values: string[] }> = body.axes
      const prices = body.prices || { type: 'by_first_axis', values: {} }

      // 교차곱 생성
      function crossProduct(arrays: string[][]): string[][] {
        if (arrays.length === 0) return [[]]
        const [first, ...rest] = arrays
        const subProduct = crossProduct(rest)
        const result: string[][] = []
        for (const val of first) {
          for (const sub of subProduct) {
            result.push([val, ...sub])
          }
        }
        return result
      }

      const axisValues = axes.map(a => a.values)
      const combos = crossProduct(axisValues)

      for (let i = 0; i < combos.length; i++) {
        const combo = combos[i]
        const suffix = combo.join(' ')

        let price = 0
        if (prices.type === 'matrix') {
          // 매트릭스: 정확한 조합키로 단가 조회
          const key = combo.join('_')
          price = prices.values?.[key] ?? 0
        } else {
          // by_first_axis: 첫 번째 축 값으로 단가 조회
          price = prices.values?.[combo[0]] ?? 0
        }

        entries.push({ suffix, price, sortKey: i + 1 })
      }
    } else if (body.variants && Array.isArray(body.variants)) {
      // 형식 A: 기존 호환 (단일 축)
      for (let i = 0; i < body.variants.length; i++) {
        const v = body.variants[i]
        entries.push({
          suffix: v.suffix,
          price: v.price_per_unit || 0,
          sortKey: v.group_sort || i + 1
        })
      }
    } else {
      // 축 없이 단일 소재 생성 (롤 원단 등)
      entries.push({ suffix: '', price: body.default_price || 0, sortKey: 1 })
    }

    // 소재 코드 시작 번호: 루프 전에 한번만 조회
    const pmLast = await c.env.DB.prepare(
      "SELECT code FROM print_media WHERE code LIKE 'PM-%' ORDER BY code DESC LIMIT 1"
    ).first() as any
    let pmNextNum = 1
    if (pmLast) {
      const n = parseInt(pmLast.code.replace('PM-', ''))
      if (!isNaN(n)) pmNextNum = n + 1
    }

    // ═══ Step 1: 모든 소재(print_media) 순서대로 생성 ═══
    for (let ei = 0; ei < entries.length; ei++) {
      const entry = entries[ei]
      const mediaName = entry.suffix ? `${base_name} ${entry.suffix}` : base_name
      const mediaCode = `PM-${String(pmNextNum + ei).padStart(4, '0')}`

      const result = await c.env.DB.prepare(`
        INSERT INTO print_media (
          name, code, media_type, price_per_unit, unit,
          sheet_width_cm, sheet_height_cm, sheet_sizes,
          roll_width_cm, media_group, group_sort, sort_order, is_active,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, '㎡', ?, ?, ?, ?, ?, ?, 0, 1, datetime('now'), datetime('now'))
      `).bind(
        mediaName, mediaCode, media_type, entry.price,
        sheetW, sheetH, sheetSizesJson,
        roll_width_cm || null,
        base_name, entry.sortKey
      ).run()

      const mediaId = result.meta?.last_row_id as number
      createdMedia.push({ id: mediaId, name: mediaName, price: entry.price })
    }

    // ═══ Step 2: 출력방식×소재 연결 + 품목 생성 ═══
    if (method_ids && Array.isArray(method_ids) && method_ids.length > 0) {
      for (const methodId of method_ids) {
        for (const mediaInfo of createdMedia) {
          // 2a. print_method_media 연결 생성 (가능한 조합)
          await c.env.DB.prepare(`
            INSERT OR IGNORE INTO print_method_media (print_method_id, print_media_id, created_at)
            VALUES (?, ?, datetime('now'))
          `).bind(methodId, mediaInfo.id).run()

          // 2b. 출력 품목 생성
          const item = await createLinkedItem(c.env.DB, methodId, mediaInfo.id, null)
          if (item) createdItems.push(item)
        }
      }
    }

    // RM 원자재 자동 생성
    const createdRM: any[] = []
    const rmSubCat = body.rm_sub_category || (media_type === 'ROLL' ? '원단류' : '판재류')
    const RM_SUB_MAP: Record<string, string> = {
      '원단류': 'F', '판재류': 'P', '시트류': 'S', '잉크': 'I',
      '전사자재': 'T', '간판자재': 'G', '부자재': 'B', '배너대': 'E',
    }
    let rmLetter = RM_SUB_MAP[rmSubCat] || 'X'
    // 폴백: rm_sub_category가 한글 인코딩 문제로 매핑 안 되면 media_type으로 결정
    if (rmLetter === 'X') {
      rmLetter = media_type === 'ROLL' ? 'F' : media_type === 'SHEET' ? 'P' : 'X'
    }

    // RM 시작 번호: 루프 전에 한번만 조회
    const rmPatternQ = `RM-${rmLetter}%`
    const rmLastQ = await c.env.DB.prepare(
      'SELECT item_code FROM items WHERE item_code LIKE ? ORDER BY item_code DESC LIMIT 1'
    ).bind(rmPatternQ).first() as any
    let rmStartNum = 1
    if (rmLastQ) {
      const n = parseInt(rmLastQ.item_code.replace(`RM-${rmLetter}`, ''))
      if (!isNaN(n)) rmStartNum = n + 1
    }
    const rmFallbackCat = await c.env.DB.prepare("SELECT id FROM item_categories WHERE category_name = '기타' LIMIT 1").first() as any
    const rmCatId = rmFallbackCat?.id || 1

    if (media_type === 'ROLL' && body.rm_widths && Array.isArray(body.rm_widths) && body.rm_widths.length > 0) {
      // 롤: 각 소재에 대해 폭별 RM 생성
      for (const mediaInfo of createdMedia) {
        for (let wi = 0; wi < body.rm_widths.length; wi++) {
          const width = body.rm_widths[wi]
          const rmName = mediaInfo.name
          const rmSeq = rmStartNum + createdRM.length
          const rmCode = `RM-${rmLetter}${String(rmSeq).padStart(4, '0')}`

          const catId = rmCatId

          const rmResult = await c.env.DB.prepare(`
            INSERT INTO items (
              item_name, item_code, code_prefix, item_type, category, sub_category, category_id,
              base_price, pricing_method, unit, width_mm,
              is_sales_item, is_purchase_item, is_active,
              parent_media_id, item_group,
              created_at, updated_at
            ) VALUES (?, ?, ?, 'MATERIAL', ?, ?, ?, 0, 'FIXED', 'EA', ?, 0, 1, 1, ?, ?, datetime('now'), datetime('now'))
          `).bind(
            rmName, rmCode, `RM-${rmLetter}`, rmSubCat, rmSubCat, catId,
            width * 10, // cm → mm
            mediaInfo.id, base_name // parent_media_id, item_group
          ).run()

          createdRM.push({ id: rmResult.meta?.last_row_id, item_code: rmCode, item_name: rmName })
        }
      }
    } else if (media_type === 'SHEET' && body.rm_auto && sheetSizes && sheetSizes.length > 0) {
      // 판재: 각 소재에 대해 판규격별 RM 생성
      for (const mediaInfo of createdMedia) {
        for (let si = 0; si < sheetSizes.length; si++) {
          const size = sheetSizes[si]
          const rmName = mediaInfo.name

          const rmSeqS = rmStartNum + createdRM.length
          const rmCode = `RM-${rmLetter}${String(rmSeqS).padStart(4, '0')}`
          const catId = rmCatId

          const rmResult = await c.env.DB.prepare(`
            INSERT INTO items (
              item_name, item_code, code_prefix, item_type, category, sub_category, category_id,
              base_price, pricing_method, unit,
              is_sales_item, is_purchase_item, is_active,
              parent_media_id, item_group,
              created_at, updated_at
            ) VALUES (?, ?, ?, 'MATERIAL', ?, ?, ?, 0, 'FIXED', 'EA', 0, 1, 1, ?, ?, datetime('now'), datetime('now'))
          `).bind(
            rmName, rmCode, `RM-${rmLetter}`, rmSubCat, rmSubCat, catId,
            mediaInfo.id, base_name
          ).run()

          createdRM.push({ id: rmResult.meta?.last_row_id, item_code: rmCode, item_name: rmName })
        }
      }
    }

    // ═══ Step 4: product_materials 자동 연결 (출력 품목 ↔ 원자재) ═══
    let pmLinked = 0
    if (createdItems.length > 0 && createdRM.length > 0) {
      for (const product of createdItems) {
        // product의 print_media_id와 같은 parent_media_id를 가진 원자재 연결
        const productItem = await c.env.DB.prepare(
          'SELECT print_media_id FROM items WHERE id = ?'
        ).bind(product.id).first() as any
        if (!productItem?.print_media_id) continue

        for (const rm of createdRM) {
          const rmItem = await c.env.DB.prepare(
            'SELECT parent_media_id FROM items WHERE id = ?'
          ).bind(rm.id).first() as any
          if (rmItem?.parent_media_id === productItem.print_media_id) {
            await c.env.DB.prepare(`
              INSERT OR IGNORE INTO product_materials (product_item_id, material_item_id, is_default)
              VALUES (?, ?, 0)
            `).bind(product.id, rm.id).run()
            pmLinked++
          }
        }
      }
    }

    return c.json({
      success: true,
      data: {
        created_media: createdMedia,
        created_items: createdItems,
        created_rm: createdRM,
        media_count: createdMedia.length,
        item_count: createdItems.length,
        rm_count: createdRM.length,
        pm_linked: pmLinked
      }
    })
  } catch (error) {
    console.error('printSystem POST /media/bulk error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다' }, 500)
  }
})

// ============================================================================
// 6. PUT /media/:id - 소재 수정
// ============================================================================
printSystemRouter.put('/media/:id', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    const body = await c.req.json()
    const {
      name, price_per_unit, media_type, unit,
      roll_width_cm, sheet_width_cm, sheet_height_cm, sheet_sizes,
      media_group, group_sort, sort_order, is_active
    } = body

    const sets: string[] = []
    const params: any[] = []

    if (name !== undefined) { sets.push('name = ?'); params.push(name) }
    if (price_per_unit !== undefined) { sets.push('price_per_unit = ?'); params.push(price_per_unit) }
    if (media_type !== undefined) { sets.push('media_type = ?'); params.push(media_type) }
    if (unit !== undefined) { sets.push('unit = ?'); params.push(unit) }
    if (roll_width_cm !== undefined) { sets.push('roll_width_cm = ?'); params.push(roll_width_cm) }
    if (sheet_width_cm !== undefined) { sets.push('sheet_width_cm = ?'); params.push(sheet_width_cm) }
    if (sheet_height_cm !== undefined) { sets.push('sheet_height_cm = ?'); params.push(sheet_height_cm) }
    if (sheet_sizes !== undefined) { sets.push('sheet_sizes = ?'); params.push(sheet_sizes ? JSON.stringify(sheet_sizes) : null) }
    if (media_group !== undefined) { sets.push('media_group = ?'); params.push(media_group) }
    if (group_sort !== undefined) { sets.push('group_sort = ?'); params.push(group_sort) }
    if (sort_order !== undefined) { sets.push('sort_order = ?'); params.push(sort_order) }
    if (is_active !== undefined) { sets.push('is_active = ?'); params.push(is_active ? 1 : 0) }
    if (body.subcategory_id !== undefined) { sets.push('subcategory_id = ?'); params.push(body.subcategory_id || null) }

    const hasMethodChange = body.method_ids && Array.isArray(body.method_ids)
    if (sets.length === 0 && !hasMethodChange) {
      return c.json({ success: false, error: '변경할 항목이 없습니다' }, 400)
    }

    // 단가 변경 이력 기록
    if (price_per_unit !== undefined) {
      const oldMedia = await c.env.DB.prepare('SELECT price_per_unit, name FROM print_media WHERE id = ?').bind(id).first() as any
      if (oldMedia) {
        const userId = c.get('user')?.id || null
        await c.env.DB.prepare(
          "INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by) VALUES ('MEDIA', ?, ?, ?, ?, ?)"
        ).bind(id, oldMedia.name, oldMedia.price_per_unit, price_per_unit, userId).run()
      }
    }

    // print_media 속성 업데이트 (변경 사항이 있을 때만)
    if (sets.length > 0) {
      sets.push("updated_at = datetime('now')")
      params.push(id)
      await c.env.DB.prepare(
        `UPDATE print_media SET ${sets.join(', ')} WHERE id = ?`
      ).bind(...params).run()
    }

    // price_per_unit 변경 시 연쇄 업데이트
    if (price_per_unit !== undefined) {
      await updateLinkedItemPrices(c.env.DB, undefined, id)
    }

    // method_ids 변경 시: 새 출력방식 추가, 해제된 방식 비활성화
    let createdCount = 0
    let deactivatedCount = 0
    const method_ids = body.method_ids
    if (method_ids && Array.isArray(method_ids)) {
      // 현재 연결된 출력방식 조회 (활성 items에서)
      const { results: currentItems } = await c.env.DB.prepare(
        'SELECT id, print_method_id FROM items WHERE print_media_id = ? AND print_method_id IS NOT NULL AND is_active = 1'
      ).bind(id).all()
      const currentMethodIds = new Set((currentItems as any[]).map((i: any) => i.print_method_id))

      // 원자재 목록 일괄 조회 (루프 밖에서 1회)
      const { results: matchedRM } = await c.env.DB.prepare(
        'SELECT id FROM items WHERE parent_media_id = ? AND item_type = ? AND is_active = 1'
      ).bind(id, 'MATERIAL').all()

      // print_method_media 연결 일괄 (batch)
      const methodMediaStmts = method_ids.map((methodId: number) =>
        c.env.DB.prepare(`
          INSERT OR IGNORE INTO print_method_media (print_method_id, print_media_id, created_at)
          VALUES (?, ?, datetime('now'))
        `).bind(methodId, id)
      )
      if (methodMediaStmts.length > 0) await c.env.DB.batch(methodMediaStmts)

      // 새로 추가할 방식 — 품목 생성 + product_materials 연결
      const productMaterialStmts: any[] = []
      for (const methodId of method_ids) {
        if (!currentMethodIds.has(methodId)) {
          const item = await createLinkedItem(c.env.DB, methodId, id, null)
          if (item) {
            createdCount++
            for (const rm of matchedRM as any[]) {
              productMaterialStmts.push(c.env.DB.prepare(`
                INSERT OR IGNORE INTO product_materials (product_item_id, material_item_id, is_default)
                VALUES (?, ?, 0)
              `).bind(item.id, rm.id))
            }
          }
        }
      }
      if (productMaterialStmts.length > 0) await c.env.DB.batch(productMaterialStmts)

      // 해제된 방식 → 주문 참조 확인 후 비활성화 (batch)
      const newMethodIds = new Set(method_ids)
      const removedItems = (currentItems as any[]).filter((ci: any) => !newMethodIds.has(ci.print_method_id))
      const inUseItems: string[] = []

      if (removedItems.length > 0) {
        // 주문 참조 일괄 확인
        const refPh = removedItems.map(() => '?').join(',')
        const { results: orderRefs } = await c.env.DB.prepare(
          `SELECT item_id, COUNT(*) as cnt FROM order_items WHERE item_id IN (${refPh}) GROUP BY item_id`
        ).bind(...removedItems.map((ci: any) => ci.id)).all()
        const refSet = new Set((orderRefs as any[]).filter((r: any) => r.cnt > 0).map((r: any) => r.item_id))
        for (const ci of removedItems) {
          if (refSet.has(ci.id)) inUseItems.push(ci.id)
        }

        // 비활성화 + print_method_media 정리 (batch)
        await c.env.DB.batch(
          removedItems.flatMap((ci: any) => [
            c.env.DB.prepare("UPDATE items SET is_active = 0, updated_at = datetime('now') WHERE id = ?").bind(ci.id),
            c.env.DB.prepare('DELETE FROM print_method_media WHERE print_method_id = ? AND print_media_id = ?').bind(ci.print_method_id, id)
          ])
        )
        deactivatedCount = removedItems.length
      }
    }

    return c.json({ success: true, data: { created_count: createdCount, deactivated_count: deactivatedCount } })
  } catch (error) {
    console.error('printSystem PUT /media/:id error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다' }, 500)
  }
})

// ============================================================================
// 7. DELETE /media/:id - 소재 삭제 (soft)
// ============================================================================
printSystemRouter.delete('/media/:id', requireRole('ADMIN'), async (c) => {
  try {
    const id = parseInt(c.req.param('id'))

    // 소재 비활성화
    await c.env.DB.prepare(
      "UPDATE print_media SET is_active = 0, updated_at = datetime('now') WHERE id = ?"
    ).bind(id).run()

    // 관련 items 비활성화
    await c.env.DB.prepare(
      "UPDATE items SET is_active = 0, updated_at = datetime('now') WHERE print_media_id = ?"
    ).bind(id).run()

    // print_method_media 정리
    await c.env.DB.prepare(
      'DELETE FROM print_method_media WHERE print_media_id = ?'
    ).bind(id).run()

    return c.json({ success: true })
  } catch (error) {
    console.error('printSystem DELETE /media/:id error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다' }, 500)
  }
})

// ============================================================================
// 8. PATCH /media/group/:groupName/price - 그룹 단가 일괄 조정
// ============================================================================
printSystemRouter.patch('/media/group/:groupName/price', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const groupName = decodeURIComponent(c.req.param('groupName'))
    const { adjust_type, value } = await c.req.json()

    if (!adjust_type || value === undefined) {
      return c.json({ success: false, error: '조정 방식과 값은 필수입니다' }, 400)
    }

    if (!['PERCENT', 'AMOUNT'].includes(adjust_type)) {
      return c.json({ success: false, error: '유효하지 않은 조정 방식입니다' }, 400)
    }

    // 그룹 소재 조회
    const { results: mediaList } = await c.env.DB.prepare(
      'SELECT id, name, price_per_unit FROM print_media WHERE media_group = ? AND is_active = 1'
    ).bind(groupName).all()

    const updatedItems: any[] = []
    const userId = c.get('user')?.id || null

    for (const media of mediaList as any[]) {
      const oldPrice = media.price_per_unit || 0
      let newPrice: number

      if (adjust_type === 'PERCENT') {
        newPrice = Math.round(oldPrice * (1 + value / 100))
      } else {
        newPrice = oldPrice + value
      }

      if (newPrice < 0) newPrice = 0

      // 단가 변경 이력 기록
      await c.env.DB.prepare(
        "INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by) VALUES ('MEDIA', ?, ?, ?, ?, ?)"
      ).bind(media.id, media.name, oldPrice, newPrice, userId).run()

      await c.env.DB.prepare(
        "UPDATE print_media SET price_per_unit = ?, updated_at = datetime('now') WHERE id = ?"
      ).bind(newPrice, media.id).run()

      // 연쇄 업데이트
      await updateLinkedItemPrices(c.env.DB, undefined, media.id)

      updatedItems.push({ name: media.name, old_price: oldPrice, new_price: newPrice })
    }

    return c.json({
      success: true,
      data: { updated_count: updatedItems.length, items: updatedItems }
    })
  } catch (error) {
    console.error('printSystem PATCH /media/group/:groupName/price error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다' }, 500)
  }
})

// ============================================================================
// 8-2. PATCH /media/group/:groupName/bulk - 그룹 내 소재 일괄 수정
// ============================================================================
printSystemRouter.patch('/media/group/:groupName/bulk', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const groupName = decodeURIComponent(c.req.param('groupName'))
    const { updates, bulk_sheet_sizes, bulk_method_ids } = await c.req.json()
    // updates: [{ id, name?, price_per_unit?, sheet_width_cm?, sheet_height_cm?, is_active? }]
    // bulk_sheet_sizes: { w, h } — 선택된 소재에 일괄 적용
    // bulk_method_ids: number[] — 선택된 소재에 출력방식 일괄 변경

    if (!Array.isArray(updates) || updates.length === 0) {
      return c.json({ success: false, error: '변경 항목이 없습니다' }, 400)
    }

    const userId = c.get('user')?.id || null
    let updatedCount = 0
    let methodChanged = 0

    for (const u of updates) {
      if (!u.id) continue
      const sets: string[] = []
      const params: any[] = []

      if (u.name !== undefined) { sets.push('name = ?'); params.push(u.name) }
      if (u.price_per_unit !== undefined) { sets.push('price_per_unit = ?'); params.push(u.price_per_unit) }
      if (u.sheet_width_cm !== undefined) { sets.push('sheet_width_cm = ?'); params.push(u.sheet_width_cm) }
      if (u.sheet_height_cm !== undefined) { sets.push('sheet_height_cm = ?'); params.push(u.sheet_height_cm) }
      if (u.roll_width_cm !== undefined) { sets.push('roll_width_cm = ?'); params.push(u.roll_width_cm) }
      if (u.is_active !== undefined) { sets.push('is_active = ?'); params.push(u.is_active ? 1 : 0) }

      // 일괄 판규격 적용
      if (bulk_sheet_sizes && u.apply_bulk_sizes) {
        sets.push('sheet_width_cm = ?'); params.push(bulk_sheet_sizes.w)
        sets.push('sheet_height_cm = ?'); params.push(bulk_sheet_sizes.h)
      }

      if (sets.length > 0) {
        // 단가 이력
        if (u.price_per_unit !== undefined) {
          const old = await c.env.DB.prepare('SELECT price_per_unit, name FROM print_media WHERE id = ?').bind(u.id).first() as any
          if (old && old.price_per_unit !== u.price_per_unit) {
            await c.env.DB.prepare(
              "INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by) VALUES ('MEDIA', ?, ?, ?, ?, ?)"
            ).bind(u.id, old.name, old.price_per_unit, u.price_per_unit, userId).run()
          }
        }

        sets.push("updated_at = datetime('now')")
        params.push(u.id)
        await c.env.DB.prepare(
          `UPDATE print_media SET ${sets.join(', ')} WHERE id = ?`
        ).bind(...params).run()

        // 연쇄 단가 업데이트
        if (u.price_per_unit !== undefined) {
          await updateLinkedItemPrices(c.env.DB, undefined, u.id)
        }

        // 소재명 변경 시 연결된 출력 품목명도 업데이트
        if (u.name !== undefined) {
          const { results: linkedItems } = await c.env.DB.prepare(
            'SELECT i.id, pm.name as method_name FROM items i JOIN print_methods pm ON pm.id = i.print_method_id WHERE i.print_media_id = ? AND i.is_active = 1'
          ).bind(u.id).all()
          for (const li of linkedItems as any[]) {
            const newItemName = `${li.method_name} ${u.name}`
            await c.env.DB.prepare("UPDATE items SET item_name = ?, updated_at = datetime('now') WHERE id = ?").bind(newItemName, li.id).run()
          }
        }

        updatedCount++
      }

      // 일괄 출력방식 변경
      if (bulk_method_ids && u.apply_bulk_methods) {
        // 기존 연결 비활성화
        const { results: currentItems } = await c.env.DB.prepare(
          'SELECT id, print_method_id FROM items WHERE print_media_id = ? AND print_method_id IS NOT NULL AND is_active = 1'
        ).bind(u.id).all()
        const currentMethodSet = new Set((currentItems as any[]).map((ci: any) => ci.print_method_id))
        const newMethodSet = new Set(bulk_method_ids)

        // 새 방식 추가
        for (const mid of bulk_method_ids) {
          await c.env.DB.prepare(`
            INSERT OR IGNORE INTO print_method_media (print_method_id, print_media_id, created_at)
            VALUES (?, ?, datetime('now'))
          `).bind(mid, u.id).run()

          if (!currentMethodSet.has(mid)) {
            const item = await createLinkedItem(c.env.DB, mid, u.id, null)
            if (item) {
              // product_materials 자동 연결
              const { results: matchedRM } = await c.env.DB.prepare(
                'SELECT id FROM items WHERE parent_media_id = ? AND item_type = ? AND is_active = 1'
              ).bind(u.id, 'MATERIAL').all()
              for (const rm of matchedRM as any[]) {
                await c.env.DB.prepare(`
                  INSERT OR IGNORE INTO product_materials (product_item_id, material_item_id, is_default)
                  VALUES (?, ?, 0)
                `).bind(item.id, rm.id).run()
              }
              methodChanged++
            }
          }
        }

        // 해제된 방식 비활성화
        for (const ci of currentItems as any[]) {
          if (!newMethodSet.has(ci.print_method_id)) {
            await c.env.DB.prepare("UPDATE items SET is_active = 0, updated_at = datetime('now') WHERE id = ?").bind(ci.id).run()
            methodChanged++
          }
        }
      }
    }

    return c.json({ success: true, data: { updated_count: updatedCount, method_changed: methodChanged } })
  } catch (error) {
    console.error('printSystem PATCH /media/group/bulk error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다' }, 500)
  }
})

// ============================================================================
// 9. GET /items-for-order - 주문서용 품목 목록
// ============================================================================
printSystemRouter.get('/items-for-order', async (c) => {
  try {
    const { method_id, method_code } = c.req.query()

    let query = `
      SELECT i.*, pm.name as method_name, pm.code as method_code, pmed.name as media_name,
             pmed.media_type, pmed.roll_width_cm, pmed.sheet_width_cm, pmed.sheet_height_cm
      FROM items i
      JOIN print_methods pm ON pm.id = i.print_method_id
      JOIN print_media pmed ON pmed.id = i.print_media_id
      WHERE i.is_active = 1 AND i.print_method_id IS NOT NULL
    `
    const params: any[] = []

    if (method_id) {
      query += ' AND i.print_method_id = ?'
      params.push(parseInt(method_id))
    } else if (method_code) {
      // method_code: 프론트엔드에서 전달하는 출력방식 코드 접두어 (AQ, SL, UV, FB 등)
      // print_methods.code는 AQUEOUS, SOLVENT 등 풀네임이므로 LIKE 매칭
      const CODE_MAP: Record<string, string> = {
        'AQ': 'AQUEOUS', 'SL': 'SOLVENT', 'UV': 'UV', 'FB': 'FLATBED'
      }
      const fullCode = CODE_MAP[method_code.toUpperCase()]
      if (fullCode) {
        query += ' AND pm.code = ?'
        params.push(fullCode)
      }
    }

    query += ' ORDER BY pm.sort_order ASC, pmed.media_group ASC, pmed.group_sort ASC, i.item_name ASC'

    const { results } = await c.env.DB.prepare(query).bind(...params).all()

    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('printSystem GET /items-for-order error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다' }, 500)
  }
})

// ============================================================================
// 10. GET /price-history - 단가 변경 이력 조회
// ============================================================================
printSystemRouter.get('/price-history', async (c) => {
  try {
    const { target_type, target_id, limit: limitStr } = c.req.query()
    const limit = parseInt(limitStr || '20') || 20

    let query = `
      SELECT pch.*, u.name as changed_by_name
      FROM price_change_history pch
      LEFT JOIN users u ON pch.changed_by = u.id
      WHERE 1=1
    `
    const params: any[] = []

    if (target_type) {
      query += ' AND pch.target_type = ?'
      params.push(target_type)
    }
    if (target_id) {
      query += ' AND pch.target_id = ?'
      params.push(parseInt(target_id))
    }

    query += ' ORDER BY pch.changed_at DESC LIMIT ?'
    params.push(limit)

    const { results } = await c.env.DB.prepare(query).bind(...params).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('printSystem GET /price-history error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다' }, 500)
  }
})

// ============================================================================
// 12. POST /repair-links - 기존 데이터 연결 복구 (1회성)
// ============================================================================
printSystemRouter.post('/repair-links', requireRole('ADMIN'), async (c) => {
  try {
    const db = c.env.DB
    let pmmCreated = 0, pmCreated = 0, groupFixed = 0

    // 1. print_method_media 복구: items에서 method+media 조합이 있는데 연결 테이블에 없는 경우
    const { results: missingPMM } = await db.prepare(`
      SELECT DISTINCT print_method_id, print_media_id
      FROM items
      WHERE print_method_id IS NOT NULL AND print_media_id IS NOT NULL AND is_active = 1
    `).all()
    for (const r of missingPMM as any[]) {
      const res = await db.prepare(`
        INSERT OR IGNORE INTO print_method_media (print_method_id, print_media_id, created_at)
        VALUES (?, ?, datetime('now'))
      `).bind(r.print_method_id, r.print_media_id).run()
      if (res.meta?.changes > 0) pmmCreated++
    }

    // 2. product_materials 복구: parent_media_id 매칭
    const { results: products } = await db.prepare(`
      SELECT id, print_media_id FROM items
      WHERE print_method_id IS NOT NULL AND print_media_id IS NOT NULL AND is_active = 1 AND item_type = 'PRODUCT'
    `).all()
    for (const p of products as any[]) {
      const { results: materials } = await db.prepare(`
        SELECT id FROM items
        WHERE parent_media_id = ? AND item_type = 'MATERIAL' AND is_active = 1
      `).bind(p.print_media_id).all()
      for (const m of materials as any[]) {
        const res = await db.prepare(`
          INSERT OR IGNORE INTO product_materials (product_item_id, material_item_id, is_default)
          VALUES (?, ?, 0)
        `).bind(p.id, m.id).run()
        if (res.meta?.changes > 0) pmCreated++
      }
    }

    // 3. item_group 복구: parent_media_id → print_media.media_group
    const { results: noGroup } = await db.prepare(`
      SELECT i.id, pm.media_group
      FROM items i
      JOIN print_media pm ON i.parent_media_id = pm.id
      WHERE i.item_group IS NULL AND i.parent_media_id IS NOT NULL AND i.is_active = 1
    `).all()
    for (const r of noGroup as any[]) {
      if (r.media_group) {
        await db.prepare("UPDATE items SET item_group = ?, updated_at = datetime('now') WHERE id = ?")
          .bind(r.media_group, r.id).run()
        groupFixed++
      }
    }

    return c.json({
      success: true,
      data: {
        print_method_media_created: pmmCreated,
        product_materials_created: pmCreated,
        item_group_fixed: groupFixed
      }
    })
  } catch (error) {
    console.error('printSystem POST /repair-links error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다' }, 500)
  }
})

// ============================================================================
// 10. 원자재 연결 (per-item, product_materials 기반)
// ============================================================================

// GET /rm-connections/:mediaGroup — 소재 그룹의 원자재 연결 상태 (그룹+개별 체크)
printSystemRouter.get('/rm-connections/:mediaGroup', async (c) => {
  try {
    const mediaGroup = c.req.param('mediaGroup')
    const db = c.env.DB

    // 1. 해당 소재 그룹의 출력품목 ID 목록
    const { results: products } = await db.prepare(`
      SELECT i.id FROM items i
      JOIN print_media pm ON i.print_media_id = pm.id
      WHERE pm.media_group = ? AND i.item_type = 'PRODUCT' AND i.is_active = 1
    `).bind(mediaGroup).all()
    const productIds = products.map((p: any) => p.id)

    // 2. 원자재 그룹별 아이템 + 연결 상태
    const { results: allRM } = await db.prepare(`
      SELECT id, item_name, item_code, item_group, width_mm, specification, sub_category
      FROM items
      WHERE item_type = 'MATERIAL' AND is_active = 1 AND item_group IS NOT NULL AND item_group != ''
      ORDER BY item_group ASC, width_mm ASC, item_name ASC
    `).all()

    // 3. 연결된 RM ID 목록 (product_materials + parent_media_id 둘 다 확인)
    let connectedIds = new Set<number>()

    // 3a. product_materials 기반
    if (productIds.length > 0) {
      const pPlaceholders = productIds.map(() => '?').join(',')
      const { results: pmRows } = await db.prepare(
        `SELECT DISTINCT material_item_id FROM product_materials WHERE product_item_id IN (${pPlaceholders})`
      ).bind(...productIds).all()
      pmRows.forEach((r: any) => connectedIds.add(r.material_item_id))
    }

    // 3b. parent_media_id 기반 (기존 연결 — 이 소재 그룹의 media ID를 참조하는 RM)
    const { results: mediaRows } = await db.prepare(
      'SELECT id FROM print_media WHERE media_group = ? AND is_active = 1'
    ).bind(mediaGroup).all()
    const mediaIds = mediaRows.map((r: any) => r.id)
    if (mediaIds.length > 0) {
      const mPlaceholders = mediaIds.map(() => '?').join(',')
      const { results: parentLinked } = await db.prepare(
        `SELECT id FROM items WHERE parent_media_id IN (${mPlaceholders}) AND item_type = 'MATERIAL' AND is_active = 1`
      ).bind(...mediaIds).all()
      parentLinked.forEach((r: any) => connectedIds.add(r.id))
    }

    // 4. 그룹별로 묶어서 반환
    const groups: Record<string, any> = {}
    for (const rm of allRM as any[]) {
      if (!groups[rm.item_group]) {
        groups[rm.item_group] = { name: rm.item_group, items: [], connectedCount: 0, totalCount: 0 }
      }
      const connected = connectedIds.has(rm.id)
      groups[rm.item_group].items.push({
        id: rm.id,
        item_name: rm.item_name,
        item_code: rm.item_code,
        width_mm: rm.width_mm,
        specification: rm.specification,
        sub_category: rm.sub_category,
        connected
      })
      groups[rm.item_group].totalCount++
      if (connected) groups[rm.item_group].connectedCount++
    }

    return c.json({ success: true, data: Object.values(groups) })
  } catch (error) {
    console.error('printSystem GET /rm-connections error:', error)
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// PUT /rm-connections/:mediaGroup — 원자재 연결 저장 (per-item)
printSystemRouter.put('/rm-connections/:mediaGroup', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const mediaGroup = c.req.param('mediaGroup')
    const { connected_item_ids } = await c.req.json<{ connected_item_ids: number[] }>()
    const db = c.env.DB
    const connectedSet = new Set(connected_item_ids)

    // 1. 출력품목 ID
    const { results: products } = await db.prepare(`
      SELECT i.id FROM items i
      JOIN print_media pm ON i.print_media_id = pm.id
      WHERE pm.media_group = ? AND i.item_type = 'PRODUCT' AND i.is_active = 1
    `).bind(mediaGroup).all()
    const productIds = products.map((p: any) => p.id)

    if (productIds.length === 0) {
      return c.json({ success: false, error: '출력품목이 없습니다' }, 404)
    }

    // 2. item_group이 있는 MATERIAL 아이템 전체 ID
    const { results: allRM } = await db.prepare(`
      SELECT id, item_group FROM items
      WHERE item_type = 'MATERIAL' AND is_active = 1 AND item_group IS NOT NULL AND item_group != ''
    `).all()
    const allRMIds = new Set(allRM.map((r: any) => r.id))

    // 3. 기존 연결 조회
    const pPlaceholders = productIds.map(() => '?').join(',')
    const { results: existingPM } = await db.prepare(
      `SELECT DISTINCT material_item_id FROM product_materials WHERE product_item_id IN (${pPlaceholders})`
    ).bind(...productIds).all()
    const existingSet = new Set(existingPM.map((r: any) => r.material_item_id))

    // 4. item_group 있는 RM만 대상으로 추가/삭제
    const toAdd = connected_item_ids.filter(id => allRMIds.has(id) && !existingSet.has(id))
    const toRemove = [...existingSet].filter(id => allRMIds.has(id) && !connectedSet.has(id))

    // 5. 삭제
    if (toRemove.length > 0) {
      const rPlaceholders = toRemove.map(() => '?').join(',')
      await db.prepare(
        `DELETE FROM product_materials WHERE product_item_id IN (${pPlaceholders}) AND material_item_id IN (${rPlaceholders})`
      ).bind(...productIds, ...toRemove).run()
    }

    // 6. 추가 (batch INSERT)
    if (toAdd.length > 0 && productIds.length > 0) {
      const pairs: [number, number][] = []
      for (const productId of productIds) {
        for (const rmId of toAdd) { pairs.push([productId, rmId]) }
      }
      // D1 batch: 최대 50개씩 INSERT
      for (let i = 0; i < pairs.length; i += 50) {
        const batch = pairs.slice(i, i + 50)
        const valPlaceholders = batch.map(() => '(?, ?)').join(', ')
        const vals = batch.flatMap(p => p)
        await db.prepare(
          `INSERT OR IGNORE INTO product_materials (product_item_id, material_item_id) VALUES ${valPlaceholders}`
        ).bind(...vals).run()
      }
    }

    // 7. media_material_groups 동기화 (그룹 레벨 메타)
    const { results: mediaRows } = await db.prepare(
      'SELECT id FROM print_media WHERE media_group = ? AND is_active = 1'
    ).bind(mediaGroup).all()
    const mediaIds = mediaRows.map((r: any) => r.id)

    // 연결된 item_group 목록 추출
    const connectedGroups = new Set<string>()
    for (const rm of allRM as any[]) {
      if (connectedSet.has(rm.id)) connectedGroups.add(rm.item_group)
    }

    // 기존 media_material_groups 정리 후 재생성
    if (mediaIds.length > 0) {
      const mPlaceholders = mediaIds.map(() => '?').join(',')
      await db.prepare(`DELETE FROM media_material_groups WHERE media_id IN (${mPlaceholders})`).bind(...mediaIds).run()
      for (const mediaId of mediaIds) {
        for (const group of connectedGroups) {
          await db.prepare('INSERT OR IGNORE INTO media_material_groups (media_id, item_group) VALUES (?, ?)').bind(mediaId, group).run()
        }
      }
    }

    return c.json({
      success: true,
      message: `${toAdd.length}건 연결, ${toRemove.length}건 해제`
    })
  } catch (error) {
    console.error('printSystem PUT /rm-connections error:', error)
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// GET /item-linked-media/:itemId — 특정 원자재가 연결된 소재 목록
printSystemRouter.get('/item-linked-media/:itemId', async (c) => {
  try {
    const itemId = parseInt(c.req.param('itemId'))
    if (isNaN(itemId)) return c.json({ success: true, data: {} })
    const db = c.env.DB

    // 1) parent_media_id 직접 연결
    const { results: directResults } = await db.prepare(`
      SELECT DISTINCT pm.media_group, pm.name as media_name
      FROM items i
      JOIN print_media pm ON i.parent_media_id = pm.id
      WHERE i.id = ? AND i.parent_media_id IS NOT NULL
    `).bind(itemId).all()

    // 2) product_materials 간접 연결
    const { results: indirectResults } = await db.prepare(`
      SELECT DISTINCT pm2.media_group, pm2.name as media_name
      FROM product_materials pmat
      JOIN items prod ON pmat.product_item_id = prod.id
      JOIN print_media pm2 ON prod.print_media_id = pm2.id
      WHERE pmat.material_item_id = ?
      ORDER BY pm2.media_group
    `).bind(itemId).all()

    // 그룹별로 묶기 (중복 제거)
    const groups: Record<string, string[]> = {}
    for (const r of [...(directResults as any[]), ...(indirectResults as any[])]) {
      const g = r.media_group || '기타'
      if (!groups[g]) groups[g] = []
      if (!groups[g].includes(r.media_name)) groups[g].push(r.media_name)
    }

    return c.json({ success: true, data: groups })
  } catch (error) {
    console.error('printSystem GET /item-linked-media error:', error)
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// POST /sync-product-materials/:mediaGroup — parent_media_id 기반 product_materials 자동 동기화
printSystemRouter.post('/sync-product-materials/:mediaGroup', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const mediaGroup = decodeURIComponent(c.req.param('mediaGroup'))
    const db = c.env.DB

    // 1. 이 소재 그룹의 모든 media ID
    const { results: mediaRows } = await db.prepare(
      'SELECT id FROM print_media WHERE media_group = ? AND is_active = 1'
    ).bind(mediaGroup).all()
    const mediaIds = mediaRows.map((r: any) => r.id)
    if (mediaIds.length === 0) return c.json({ success: true, message: 'no media' })

    // 2. 이 소재들의 출력품목(PRODUCT)
    const mPlaceholders = mediaIds.map(() => '?').join(',')
    const { results: products } = await db.prepare(
      `SELECT id FROM items WHERE print_media_id IN (${mPlaceholders}) AND item_type = 'PRODUCT' AND is_active = 1`
    ).bind(...mediaIds).all()
    const productIds = products.map((p: any) => p.id)
    if (productIds.length === 0) return c.json({ success: true, message: 'no products' })

    // 3. parent_media_id로 연결된 원자재
    const { results: materials } = await db.prepare(
      `SELECT id FROM items WHERE parent_media_id IN (${mPlaceholders}) AND item_type = 'MATERIAL' AND is_active = 1`
    ).bind(...mediaIds).all()
    const materialIds = materials.map((m: any) => m.id)

    // 4. 기존 product_materials 삭제 (이 출력품목들에 대해)
    const pPlaceholders = productIds.map(() => '?').join(',')
    await db.prepare(
      `DELETE FROM product_materials WHERE product_item_id IN (${pPlaceholders})`
    ).bind(...productIds).run()

    // 5. 새로 INSERT (모든 product × material 조합)
    let insertCount = 0
    if (materialIds.length > 0) {
      const pairs: [number, number][] = []
      for (const pid of productIds) {
        for (const mid of materialIds) {
          pairs.push([pid, mid])
        }
      }
      for (let i = 0; i < pairs.length; i += 50) {
        const batch = pairs.slice(i, i + 50)
        const valPlaceholders = batch.map(() => '(?, ?)').join(', ')
        const vals = batch.flatMap(p => p)
        await db.prepare(
          `INSERT OR IGNORE INTO product_materials (product_item_id, material_item_id) VALUES ${valPlaceholders}`
        ).bind(...vals).run()
      }
      insertCount = pairs.length
    }

    // 6. media_material_groups 동기화
    await db.prepare(`DELETE FROM media_material_groups WHERE media_id IN (${mPlaceholders})`).bind(...mediaIds).run()
    // 연결된 item_group 추출
    if (materialIds.length > 0) {
      const matPlaceholders = materialIds.map(() => '?').join(',')
      const { results: groups } = await db.prepare(
        `SELECT DISTINCT item_group FROM items WHERE id IN (${matPlaceholders}) AND item_group IS NOT NULL`
      ).bind(...materialIds).all()
      for (const mediaId of mediaIds) {
        for (const g of groups as any[]) {
          await db.prepare('INSERT OR IGNORE INTO media_material_groups (media_id, item_group) VALUES (?, ?)').bind(mediaId, g.item_group).run()
        }
      }
    }

    return c.json({ success: true, message: `${insertCount} connections synced` })
  } catch (error) {
    console.error('printSystem sync-product-materials error:', error)
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

export default printSystemRouter
