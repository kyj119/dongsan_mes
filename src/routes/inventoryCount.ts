import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { getEntityId, entityFilter } from '../utils/entityFilter'

const inventoryCountRouter = new Hono<HonoEnv>()
inventoryCountRouter.use('/*', authMiddleware, requireRole('ADMIN', 'MANAGER'))

// GET / — 실사 목록 (페이징, 필터)
inventoryCountRouter.get('/', async (c) => {
  try {
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100)
    const offset = parseInt(c.req.query('offset') || '0')
    const status = c.req.query('status')
    const storageZoneId = c.req.query('storage_zone_id')

    const ef = entityFilter(c, 'ic')  // #279: 법인별 격리 (sz JOIN으로 entity_id 모호 → alias 필수)
    let query = `SELECT ic.id, ic.count_number, ic.count_date, ic.count_type, ic.status, ic.submitted_at, ic.approved_at, ic.notes, ic.storage_zone_id, sz.zone_name AS storage_zone_name
      FROM inventory_counts ic
      LEFT JOIN storage_zones sz ON ic.storage_zone_id = sz.id
      WHERE 1=1` + ef.clause
    const params: any[] = [...ef.params]

    if (status) {
      query += ' AND ic.status = ?'
      params.push(status)
    }
    if (storageZoneId) {
      query += ' AND ic.storage_zone_id = ?'
      params.push(Number(storageZoneId))
    }

    query += ' ORDER BY ic.count_date DESC LIMIT ? OFFSET ?'
    params.push(limit, offset)

    const { results } = await c.env.DB.prepare(query).bind(...params).all()

    // 전체 개수 (LIMIT/OFFSET 제외 → params.slice(0, -2))
    let countQuery = 'SELECT COUNT(*) as cnt FROM inventory_counts ic WHERE 1=1' + ef.clause
    if (status) {
      countQuery += ' AND ic.status = ?'
    }
    if (storageZoneId) {
      countQuery += ' AND ic.storage_zone_id = ?'
    }
    const countRes = await c.env.DB.prepare(countQuery).bind(...params.slice(0, -2)).first()

    return c.json({
      success: true,
      data: results || [],
      total: (countRes as { cnt: number } | null)?.cnt || 0,
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
    // P3: 구역 기반 실사 — storage_zone_id 있으면 count_type='ZONE', 품목을 그 구역으로 스코프
    const zoneId = (body.storage_zone_id != null && body.storage_zone_id !== '') ? Number(body.storage_zone_id) : null

    // count_number 생성: IC-YYYYMMDDHHMMSS (초까지 — 같은 분 다중 생성 UNIQUE 충돌 방지. P3 구역 실사로 연속 생성 빈번)
    const now = new Date()
    const countNumber = `IC-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`
    const countDate = now.toISOString().substring(0, 10)

    // 실사 유형: 구역(ZONE) > 부분(PERIODIC, category) > 전체(FULL)
    const actualType = zoneId ? 'ZONE' : (category ? 'PERIODIC' : count_type)
    const countNotes = category ? `[${category}] ${notes}` : notes

    const countEntityId = getEntityId(c) || 1

    // 구역 실사면 구역명 조회 (응답용)
    let zoneName: string | null = null
    if (zoneId) {
      const zoneRow = await c.env.DB.prepare(
        'SELECT zone_name FROM storage_zones WHERE id = ?'
      ).bind(zoneId).first<{ zone_name: string }>()
      zoneName = zoneRow?.zone_name || null
    }

    // inventory_counts 생성
    const result = await c.env.DB.prepare(`
      INSERT INTO inventory_counts (count_number, count_date, count_type, status, notes, entity_id, storage_zone_id)
      VALUES (?, ?, ?, 'DRAFT', ?, ?, ?)
    `).bind(countNumber, countDate, actualType, countNotes, countEntityId, zoneId).run()

    const countId = (result.meta.last_row_id as number)

    // 품목 로드: 구역(zone) 우선 > category 필터 > 전체
    let itemQuery: string
    const params: any[] = []
    if (zoneId) {
      // 구역 실사: 해당 구역·법인 재고가 있는 품목만 (INNER JOIN)
      itemQuery = `
        SELECT i.id, i.item_code, i.item_name, i.unit, i.category, inv.quantity
        FROM items i
        JOIN inventory inv ON i.id = inv.item_id AND inv.entity_id = ? AND inv.storage_zone_id = ?
        WHERE i.is_active = 1 AND i.is_purchase_item = 1
        ORDER BY i.category, i.item_name
      `
      params.push(countEntityId, zoneId)
    } else {
      itemQuery = `
        SELECT i.id, i.item_code, i.item_name, i.unit, i.category, inv.quantity
        FROM items i
        LEFT JOIN inventory inv ON i.id = inv.item_id AND inv.entity_id = ?
        WHERE i.is_active = 1 AND i.is_purchase_item = 1
      `
      params.push(countEntityId)
      if (category) {
        itemQuery += ' AND i.category = ?'
        params.push(category)
      }
      itemQuery += ' ORDER BY i.category, i.item_name'
    }

    const { results: items } = await c.env.DB.prepare(itemQuery).bind(...params).all<{ id: number; item_code: string; item_name: string; unit: string; category: string; quantity: number | null }>()

    if (items && items.length > 0) {
      await c.env.DB.batch(
        items.map((item) =>
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
        storage_zone_id: zoneId,
        storage_zone_name: zoneName,
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
    const ef = entityFilter(c, 'ic')  // sz JOIN으로 entity_id 모호 → alias 필수

    const count = await c.env.DB.prepare(`
      SELECT ic.id, ic.count_number, ic.count_date, ic.count_type, ic.status, ic.submitted_by, ic.submitted_at, ic.approved_by, ic.approved_at, ic.notes, ic.created_at, ic.entity_id, ic.storage_zone_id, sz.zone_name AS storage_zone_name
      FROM inventory_counts ic
      LEFT JOIN storage_zones sz ON ic.storage_zone_id = sz.id
      WHERE ic.id = ?${ef.clause}
    `).bind(id, ...ef.params).first<{ count_type: string; status: string; entity_id: number; storage_zone_id: number | null }>()

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

    // P3: ZONE 실사 + DRAFT일 때만 미배정 품목(구역 없는 재고) 제시 — 첫 실사가 구역 배정을 겸함
    let unassignedItems: any[] = []
    if (count.count_type === 'ZONE' && count.status === 'DRAFT') {
      const entityId = count.entity_id || getEntityId(c) || 1
      const { results: unassigned } = await c.env.DB.prepare(`
        SELECT i.id AS item_id, i.item_code, i.item_name, i.unit, inv.quantity
        FROM inventory inv
        JOIN items i ON i.id = inv.item_id
        WHERE inv.storage_zone_id IS NULL AND inv.entity_id = ?
          AND i.is_active = 1 AND i.is_purchase_item = 1
          AND i.id NOT IN (SELECT item_id FROM inventory_count_items WHERE count_id = ?)
        ORDER BY i.category, i.item_name
      `).bind(entityId, id).all()
      unassignedItems = unassigned || []
    }

    return c.json({
      success: true,
      data: {
        ...count,
        items: items || [],
        unassigned_items: unassignedItems
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
    const body = await c.req.json<{ items?: { id: number; system_quantity: string; counted_quantity: string; notes?: string }[] }>()
    const { items = [] } = body

    // 타법인 실사 항목 수정 차단: 부모 count가 호출자 법인 소속인지 확인
    const efItems = entityFilter(c)
    const ownCount = await c.env.DB.prepare(
      `SELECT id FROM inventory_counts WHERE id = ?${efItems.clause}`
    ).bind(countId, ...efItems.params).first()
    if (!ownCount) {
      return c.json({ success: false, error: 'Count not found' }, 404)
    }

    // 일괄 업데이트 (batch)
    if (items.length > 0) {
      await c.env.DB.batch(
        items.map((item: any) => {
          const systemQty = Number(item.system_quantity)
          const countedQty = Number(item.counted_quantity)
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

// POST /:id/add-items — 미배정 품목을 실사에 추가 (+선택적 구역 배정)
// P3: ZONE 실사 첫 단계에서 storage_zone_id IS NULL 품목을 실사에 편입하고, assign_zone=true면 그 구역으로 배정
inventoryCountRouter.post('/:id/add-items', async (c) => {
  try {
    const countId = parseInt(c.req.param('id'))
    const body = await c.req.json<{ item_ids?: number[]; assign_zone?: boolean }>()
    const itemIds = Array.from(new Set((body.item_ids || []).map(Number).filter((n) => Number.isFinite(n))))
    const assignZone = body.assign_zone === true

    // 타법인 차단: 부모 count가 호출자 법인 소속인지 확인 + count 정보 확보
    const ef = entityFilter(c)
    const count = await c.env.DB.prepare(
      `SELECT id, storage_zone_id, entity_id FROM inventory_counts WHERE id = ?${ef.clause}`
    ).bind(countId, ...ef.params).first<{ id: number; storage_zone_id: number | null; entity_id: number }>()
    if (!count) {
      return c.json({ success: false, error: 'Count not found' }, 404)
    }

    if (itemIds.length === 0) {
      return c.json({ success: true, added: 0 })
    }

    const entityId = count.entity_id || getEntityId(c) || 1
    const zoneId = count.storage_zone_id

    // 이미 이 실사에 든 품목 제외 (중복 방지) — IN 청크 80개 (D1 바인드 한도)
    const existing = new Set<number>()
    for (let i = 0; i < itemIds.length; i += 80) {
      const chunk = itemIds.slice(i, i + 80)
      const placeholders = chunk.map(() => '?').join(',')
      const { results } = await c.env.DB.prepare(
        `SELECT item_id FROM inventory_count_items WHERE count_id = ? AND item_id IN (${placeholders})`
      ).bind(countId, ...chunk).all<{ item_id: number }>()
      for (const r of (results || [])) existing.add(r.item_id)
    }
    const toAdd = itemIds.filter((id) => !existing.has(id))

    if (toAdd.length === 0) {
      return c.json({ success: true, added: 0 })
    }

    // 각 품목의 현재 재고·단위 조회 (system_quantity 산정) — IN 청크 80개
    const invMap = new Map<number, { quantity: number; unit: string }>()
    for (let i = 0; i < toAdd.length; i += 80) {
      const chunk = toAdd.slice(i, i + 80)
      const placeholders = chunk.map(() => '?').join(',')
      const { results } = await c.env.DB.prepare(`
        SELECT i.id AS item_id, COALESCE(inv.quantity, 0) AS quantity, i.unit
        FROM items i
        LEFT JOIN inventory inv ON inv.item_id = i.id AND inv.entity_id = ?
        WHERE i.id IN (${placeholders})
      `).bind(entityId, ...chunk).all<{ item_id: number; quantity: number; unit: string | null }>()
      for (const r of (results || [])) invMap.set(r.item_id, { quantity: r.quantity || 0, unit: r.unit || 'YD' })
    }

    // batch: INSERT count_item (+ assign_zone면 inventory.storage_zone_id UPDATE)
    const stmts = []
    for (const itemId of toAdd) {
      const inv = invMap.get(itemId) || { quantity: 0, unit: 'YD' }
      stmts.push(
        c.env.DB.prepare(`
          INSERT INTO inventory_count_items (count_id, item_id, system_quantity, unit)
          VALUES (?, ?, ?, ?)
        `).bind(countId, itemId, inv.quantity, inv.unit)
      )
      if (assignZone && zoneId) {
        stmts.push(
          c.env.DB.prepare(
            `UPDATE inventory SET storage_zone_id = ? WHERE item_id = ? AND entity_id = ?`
          ).bind(zoneId, itemId, entityId)
        )
      }
    }
    await c.env.DB.batch(stmts)

    return c.json({ success: true, added: toAdd.length })
  } catch (error) {
    console.error('src/routes/inventoryCount.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// PATCH /:id/submit — 제출 (SUBMITTED)
inventoryCountRouter.patch('/:id/submit', async (c) => {
  try {
    const countId = parseInt(c.req.param('id'))
    // #436: 미전송 X-User-Id 헤더(항상 undefined)→'system' 고정 버그. JWT 검증 유저로 실제 제출자 기록
    const userId = c.get('user')?.username || 'system'
    const ef = entityFilter(c)

    const result = await c.env.DB.prepare(`
      UPDATE inventory_counts
      SET status = 'SUBMITTED', submitted_by = ?, submitted_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'DRAFT'${ef.clause}
    `).bind(userId, countId, ...ef.params).run()

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
    // #436: 미전송 X-User-Id 헤더(항상 undefined)→'system' 고정 버그. JWT 검증 유저로 실제 승인자 기록
    const userId = c.get('user')?.username || 'system'

    // 먼저 count 조회 (타법인 실사 승인 차단)
    const ef = entityFilter(c)
    const count = await c.env.DB.prepare(`
      SELECT id, count_number, count_date, count_type, status, submitted_by, submitted_at, approved_by, approved_at, notes, created_at, entity_id FROM inventory_counts WHERE id = ?${ef.clause}
    `).bind(countId, ...ef.params).first<{ status: string; entity_id: number }>()

    if (!count || count.status !== 'SUBMITTED') {
      return c.json({ success: false, error: 'Count not found or not submitted' }, 400)
    }

    // count_items 조회
    const { results: countItems } = await c.env.DB.prepare(`
      SELECT id, count_id, item_id, system_quantity, counted_quantity, difference, difference_pct, unit, notes FROM inventory_count_items WHERE count_id = ?
    `).bind(countId).all<{ item_id: number; system_quantity: number; counted_quantity: number }>()

    // #152: 재고 보정 + 상태 변경을 단일 batch로 원자화 (이중 조정 방지)
    // #356: 호출자 entity가 아닌 실사 행의 entity로 보정 (타법인 재고 오조정 방지)
    const entityId = count.entity_id || getEntityId(c) || 1
    const batchStmts = (countItems || []).flatMap((item) => [
      c.env.DB.prepare(`
        UPDATE inventory SET quantity = ?, last_updated = CURRENT_TIMESTAMP
        WHERE item_id = ? AND entity_id = ?
      `).bind(item.counted_quantity, item.item_id, entityId),
      // #394: inventory_transactions 실제 스키마로 재작성 (inventory.ts:505 패턴).
      // 기존 컬럼셋(quantity_before/after/change/created_by)은 inventory_adjustments 것 — 혼동 버그.
      c.env.DB.prepare(`
        INSERT INTO inventory_transactions (item_id, transaction_type, quantity, balance_after, reference_type, reference_id, reason, notes, handled_by, transaction_date, entity_id)
        VALUES (?, 'ADJUST', ?, ?, 'STOCK_COUNT', ?, 'STOCK_COUNT', ?, ?, datetime('now'), ?)
      `).bind(
        item.item_id,
        item.counted_quantity - item.system_quantity, // quantity: 조정 변화량(부호 유지)
        item.counted_quantity,                         // balance_after: 보정 후 잔량
        countId,                                       // reference_id
        `Inventory Count ID: ${countId}`,              // notes
        c.get('user')?.id || null,                     // #394: handled_by는 users(id) FK — 'system' 문자열은 FK 위반(prod FK 강제). JWT user.id 또는 NULL(inventory.ts:505 패턴)
        entityId
      )
    ])
    // 상태 변경을 batch 마지막에 포함 — 보정+상태가 동시에 반영
    batchStmts.push(
      c.env.DB.prepare(`UPDATE inventory_counts SET status = 'APPROVED', approved_by = ?, approved_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'SUBMITTED'`).bind(userId, countId)
    )
    await c.env.DB.batch(batchStmts)

    return c.json({ success: true })
  } catch (error) {
    console.error('src/routes/inventoryCount.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

export default inventoryCountRouter
