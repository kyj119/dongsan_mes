import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { getEntityId, entityFilter, isZoneOwnedByEntity, getWriteEntityId, ENTITY_ALL_MODE_WRITE_ERROR } from '../utils/entityFilter'
import { getItemDefaultZones } from '../utils/inventoryZone'
import { resolveStockUnit } from '../utils/rollConsumption'
import { kstStamp14, kstYmd } from '../utils/kstDate'

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
    let query = `SELECT ic.id, ic.count_number, ic.count_date, ic.count_type, ic.status, ic.submitted_at, ic.approved_at, ic.notes, ic.storage_zone_id, sz.zone_name AS storage_zone_name,
      (SELECT COUNT(*) FROM inventory_count_items ci WHERE ci.count_id = ic.id) AS item_count
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

    query += ' ORDER BY ic.count_date DESC, ic.id DESC LIMIT ? OFFSET ?'  // 정렬 규약: 고유키 tie-break
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
    const countNumber = 'IC-' + kstStamp14()
    const countDate = kstYmd()

    // 실사 유형: 구역(ZONE) > 부분(PERIODIC, category) > 전체(FULL)
    const actualType = zoneId ? 'ZONE' : (category ? 'PERIODIC' : count_type)
    const countNotes = category ? `[${category}] ${notes}` : notes

    // 전체모드(0) 쓰기 차단 + 구역 법인 소유 검증 (2026-07-06 감사 #3·#5)
    const countEntityId = getWriteEntityId(c)
    if (countEntityId == null) {
      return c.json({ success: false, error: ENTITY_ALL_MODE_WRITE_ERROR }, 400)
    }
    if (zoneId != null && !(await isZoneOwnedByEntity(c, zoneId))) {
      return c.json({ success: false, error: '유효하지 않은 창고입니다' }, 400)
    }

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
    let items: Array<{ id: number; item_code: string; item_name: string; unit: string; base_unit?: string | null; category: string; storage_zone_id: number | null; quantity: number | null }> = []
    if (zoneId) {
      // 구역 실사: 해당 구역·법인 재고가 있는 품목만 (INNER JOIN). 라인 창고 = 그 구역(inv.storage_zone_id=zoneId)
      const { results } = await c.env.DB.prepare(`
        SELECT i.id, i.item_code, i.item_name, i.unit, i.base_unit, i.category, inv.storage_zone_id, inv.quantity
        FROM items i
        JOIN inventory inv ON i.id = inv.item_id AND inv.entity_id = ? AND inv.storage_zone_id = ?
        WHERE i.is_active = 1 AND i.is_purchase_item = 1
        ORDER BY i.category, i.item_name, i.id
      `).bind(countEntityId, zoneId).all<typeof items[number]>()
      items = results || []
    } else {
      // 0396 다중행: 라인 창고 = 법인 인식 기본창고(getItemDefaultZones) — raw items.storage_zone_id는
      //   타법인 zone 배정 품목의 실사 승인 시 entity≠zone소유 어긋난 행을 만듦 (2026-07-06 감사 #3)
      let itemQuery = `
        SELECT i.id, i.item_code, i.item_name, i.unit, i.category
        FROM items i
        WHERE i.is_active = 1 AND i.is_purchase_item = 1
      `
      const params: any[] = []
      if (category) {
        itemQuery += ' AND i.category = ?'
        params.push(category)
      }
      itemQuery += ' ORDER BY i.category, i.item_name'
      const { results: baseItems } = await c.env.DB.prepare(itemQuery).bind(...params).all<{ id: number; item_code: string; item_name: string; unit: string; base_unit?: string | null; category: string }>()
      const ids = (baseItems || []).map(r => Number(r.id))
      const zoneMap = await getItemDefaultZones(c.env.DB, ids, countEntityId)
      // 실사 UX 라④: 전수 실사는 (item, zone) 재고 행별로 라인 전개 — 기본창고 1행만 스냅샷하면
      //   타 창고 재고가 실사 범위 밖(총량 입력 시 이중계상)이었음. 재고 행 없는 품목=기본창고 1행(qty 0).
      const invByItem = new Map<number, Array<{ zone: number | null; qty: number }>>()
      for (let i = 0; i < ids.length; i += 80) {
        const chunk = ids.slice(i, i + 80)
        const ph = chunk.map(() => '?').join(',')
        const { results: invRows } = await c.env.DB.prepare(
          `SELECT item_id, storage_zone_id, quantity FROM inventory WHERE entity_id = ? AND item_id IN (${ph})`
        ).bind(countEntityId, ...chunk).all<{ item_id: number; storage_zone_id: number | null; quantity: number }>()
        for (const r of (invRows || [])) {
          const list = invByItem.get(Number(r.item_id)) || []
          list.push({ zone: (r.storage_zone_id as number | null) ?? null, qty: Number(r.quantity) || 0 })
          invByItem.set(Number(r.item_id), list)
        }
      }
      items = (baseItems || []).flatMap(r => {
        const rows = invByItem.get(Number(r.id))
        if (rows && rows.length > 0) {
          return rows.map(v => ({ ...r, storage_zone_id: v.zone, quantity: v.qty }))
        }
        const z = zoneMap.get(Number(r.id)) ?? null
        return [{ ...r, storage_zone_id: z, quantity: 0 }]
      })
    }

    if (items && items.length > 0) {
      await c.env.DB.batch(
        items.map((item) =>
          c.env.DB.prepare(`
            INSERT INTO inventory_count_items (count_id, item_id, system_quantity, unit, storage_zone_id)
            VALUES (?, ?, ?, ?, ?)
          // 실사 단위 = **재고 단위**(base_unit) — items.unit 은 입고·발주 단위('롤')라
          // 수량(base·미터)과 짝이 맞지 않는다. 150m 를 '150 롤'로 보여주면 오입력을 부른다.
          `).bind(countId, item.id, item.quantity || 0, resolveStockUnit(item), item.storage_zone_id ?? null)
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

    // 라⑤: current_quantity = 지금 재고 — system_quantity 스냅샷과 다르면 실사 중 입출고 발생(승인 전 경고용)
    const countEntityId = (count as any).entity_id || getEntityId(c) || 1
    const { results: items } = await c.env.DB.prepare(`
      SELECT ci.id, ci.count_id, ci.item_id, ci.system_quantity, ci.counted_quantity, ci.difference, ci.difference_pct, ci.unit, ci.notes,
             ci.storage_zone_id, sz.zone_name AS storage_zone_name,
             i.item_code, i.item_name, i.base_unit, i.pack_size, i.stock_mode,
             (SELECT inv.quantity FROM inventory inv
               WHERE inv.item_id = ci.item_id AND inv.entity_id = ?
                 AND IFNULL(inv.storage_zone_id, 0) = IFNULL(ci.storage_zone_id, 0)) AS current_quantity
      FROM inventory_count_items ci
      JOIN items i ON ci.item_id = i.id
      LEFT JOIN storage_zones sz ON ci.storage_zone_id = sz.id
      WHERE ci.count_id = ?
      ORDER BY i.item_code
    `).bind(countEntityId, id).all()

    // P3: ZONE 실사 + DRAFT일 때만 미배정 품목(구역 없는 재고) 제시 — 첫 실사가 구역 배정을 겸함
    let unassignedItems: any[] = []
    if (count.count_type === 'ZONE' && count.status === 'DRAFT') {
      const entityId = count.entity_id || getEntityId(c) || 1
      const { results: unassigned } = await c.env.DB.prepare(`
        SELECT i.id AS item_id, i.item_code, i.item_name, i.unit, i.base_unit, i.pack_size, i.stock_mode, inv.quantity
        FROM inventory inv
        JOIN items i ON i.id = inv.item_id
        WHERE inv.storage_zone_id IS NULL AND inv.entity_id = ?
          AND i.is_active = 1 AND i.is_purchase_item = 1
          AND i.id NOT IN (SELECT item_id FROM inventory_count_items WHERE count_id = ?)
        ORDER BY i.category, i.item_name, inv.id
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

// PUT /:id/items — 실사 항목 일괄 업데이트 (APPROVED 잠금 — 승인 후 기록 변조 방지)
inventoryCountRouter.put('/:id/items', async (c) => {
  try {
    const countId = parseInt(c.req.param('id'))
    const body = await c.req.json<{ items?: { id: number; system_quantity: string; counted_quantity: string | null; notes?: string }[] }>()
    const { items = [] } = body

    // 타법인 실사 항목 수정 차단: 부모 count가 호출자 법인 소속인지 확인
    const efItems = entityFilter(c)
    const ownCount = await c.env.DB.prepare(
      `SELECT id, status FROM inventory_counts WHERE id = ?${efItems.clause}`
    ).bind(countId, ...efItems.params).first<{ status: string }>()
    if (!ownCount) {
      return c.json({ success: false, error: 'Count not found' }, 404)
    }
    if (ownCount.status === 'APPROVED') {
      return c.json({ success: false, error: '승인된 실사는 수정할 수 없습니다' }, 400)
    }

    // 일괄 업데이트 (batch). counted_quantity null/빈값 = 미입력(NULL) 되돌림 → 승인 시 보정 제외
    if (items.length > 0) {
      await c.env.DB.batch(
        items.map((item: any) => {
          if (item.counted_quantity === null || item.counted_quantity === undefined || item.counted_quantity === '') {
            return c.env.DB.prepare(`
              UPDATE inventory_count_items
              SET counted_quantity = NULL, difference = NULL, difference_pct = NULL, notes = ?
              WHERE id = ? AND count_id = ?
            `).bind(item.notes || '', item.id, countId)
          }
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
      `SELECT id, status, storage_zone_id, entity_id FROM inventory_counts WHERE id = ?${ef.clause}`
    ).bind(countId, ...ef.params).first<{ id: number; status: string; storage_zone_id: number | null; entity_id: number }>()
    if (!count) {
      return c.json({ success: false, error: 'Count not found' }, 404)
    }
    // 품목 편입(+구역 배정=재고 이동)은 작성중 실사에만 — 제출/승인 후 추가는 스냅샷 정합 붕괴
    if (count.status !== 'DRAFT') {
      return c.json({ success: false, error: '작성중 실사에만 품목을 추가할 수 있습니다' }, 400)
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

    // 각 품목의 미배정(NULL zone) 재고·단위 조회 (system_quantity 산정) — 미배정 품목 편입이므로 NULL행 기준. IN 청크 80개
    const invMap = new Map<number, { quantity: number; unit: string }>()
    for (let i = 0; i < toAdd.length; i += 80) {
      const chunk = toAdd.slice(i, i + 80)
      const placeholders = chunk.map(() => '?').join(',')
      const { results } = await c.env.DB.prepare(`
        SELECT i.id AS item_id, COALESCE(inv.quantity, 0) AS quantity, i.unit
        FROM items i
        LEFT JOIN inventory inv ON inv.item_id = i.id AND inv.entity_id = ? AND inv.storage_zone_id IS NULL
        WHERE i.id IN (${placeholders})
      `).bind(entityId, ...chunk).all<{ item_id: number; quantity: number; unit: string | null }>()
      for (const r of (results || [])) invMap.set(r.item_id, { quantity: r.quantity || 0, unit: r.unit || 'YD' })
    }

    // batch: INSERT count_item(storage_zone_id=구역) (+ assign_zone면 미배정 NULL행을 구역으로 이동)
    const stmts = []
    for (const itemId of toAdd) {
      const inv = invMap.get(itemId) || { quantity: 0, unit: 'YD' }
      stmts.push(
        c.env.DB.prepare(`
          INSERT INTO inventory_count_items (count_id, item_id, system_quantity, unit, storage_zone_id)
          VALUES (?, ?, ?, ?, ?)
        `).bind(countId, itemId, inv.quantity, inv.unit, zoneId)
      )
      if (assignZone && zoneId) {
        // 0396: 미배정(NULL zone) 행을 대상 창고로 이동. 대상 행이 이미 있으면 수량 합산 후 NULL행 삭제.
        stmts.push(
          // 대상 창고 행 보장 (없으면 0으로 생성)
          c.env.DB.prepare(
            `INSERT OR IGNORE INTO inventory (item_id, entity_id, storage_zone_id, quantity) VALUES (?, ?, ?, 0)`
          ).bind(itemId, entityId, zoneId),
          // NULL행 수량을 대상 창고 행에 합산
          c.env.DB.prepare(
            `UPDATE inventory SET quantity = quantity + COALESCE(
               (SELECT quantity FROM inventory n WHERE n.item_id = ? AND n.entity_id = ? AND n.storage_zone_id IS NULL), 0),
               last_updated = CURRENT_TIMESTAMP
             WHERE item_id = ? AND entity_id = ? AND IFNULL(storage_zone_id,0) = IFNULL(?,0)`
          ).bind(itemId, entityId, itemId, entityId, zoneId),
          // NULL행 삭제 (이동 완료)
          c.env.DB.prepare(
            `DELETE FROM inventory WHERE item_id = ? AND entity_id = ? AND storage_zone_id IS NULL`
          ).bind(itemId, entityId)
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

// PATCH /:id/reject — 반려 (SUBMITTED → DRAFT, 실사 UX 라⑥)
inventoryCountRouter.patch('/:id/reject', async (c) => {
  try {
    const countId = parseInt(c.req.param('id'))
    const ef = entityFilter(c)
    const result = await c.env.DB.prepare(`
      UPDATE inventory_counts
      SET status = 'DRAFT', submitted_by = NULL, submitted_at = NULL
      WHERE id = ? AND status = 'SUBMITTED'${ef.clause}
    `).bind(countId, ...ef.params).run()
    if ((result.meta.changes || 0) === 0) {
      return c.json({ success: false, error: '제출됨 상태의 실사만 반려할 수 있습니다' }, 400)
    }
    return c.json({ success: true })
  } catch (error) {
    console.error('src/routes/inventoryCount.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// DELETE /:id — 작성중(DRAFT) 실사 삭제 (실사 UX 라⑥ — 잘못 만든 실사 정리)
inventoryCountRouter.delete('/:id', async (c) => {
  try {
    const countId = parseInt(c.req.param('id'))
    const ef = entityFilter(c)
    const count = await c.env.DB.prepare(
      `SELECT id, status FROM inventory_counts WHERE id = ?${ef.clause}`
    ).bind(countId, ...ef.params).first<{ status: string }>()
    if (!count) {
      return c.json({ success: false, error: 'Count not found' }, 404)
    }
    if (count.status !== 'DRAFT') {
      return c.json({ success: false, error: '작성중 실사만 삭제할 수 있습니다' }, 400)
    }
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM inventory_count_items WHERE count_id = ?').bind(countId),
      c.env.DB.prepare(`DELETE FROM inventory_counts WHERE id = ? AND status = 'DRAFT'`).bind(countId),
    ])
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

    // count_items 조회 (0396: storage_zone_id 포함 — 그 창고 행을 보정)
    const { results: countItems } = await c.env.DB.prepare(`
      SELECT id, count_id, item_id, system_quantity, counted_quantity, difference, difference_pct, unit, notes, storage_zone_id FROM inventory_count_items WHERE count_id = ?
    `).bind(countId).all<{ item_id: number; system_quantity: number; counted_quantity: number | null; storage_zone_id: number | null }>()

    // 미입력(counted_quantity NULL) 항목은 보정 제외 — NULL 바인드 시 inventory.quantity=NULL 재고 소실
    const adjustable = (countItems || []).filter(
      (item): item is typeof item & { counted_quantity: number } => item.counted_quantity != null
    )
    const skippedCount = (countItems || []).length - adjustable.length

    // #152: 재고 보정 + 상태 변경을 단일 batch로 원자화 (이중 조정 방지)
    // #356: 호출자 entity가 아닌 실사 행의 entity로 보정 (타법인 재고 오조정 방지)
    const entityId = count.entity_id || getEntityId(c) || 1
    const batchStmts = adjustable.flatMap((item) => {
      const zoneId = item.storage_zone_id ?? null
      return [
        // 0396: 대상 창고 행이 없으면 생성 (이후 UPDATE가 counted로 보정). 키 = (item, entity, zone)
        c.env.DB.prepare(
          `INSERT OR IGNORE INTO inventory (item_id, entity_id, storage_zone_id, quantity) VALUES (?, ?, ?, 0)`
        ).bind(item.item_id, entityId, zoneId),
        c.env.DB.prepare(`
          UPDATE inventory SET quantity = ?, last_updated = CURRENT_TIMESTAMP
          WHERE item_id = ? AND entity_id = ? AND IFNULL(storage_zone_id,0) = IFNULL(?,0)
        `).bind(item.counted_quantity, item.item_id, entityId, zoneId),
        // #394: inventory_transactions 실제 스키마로 재작성 (inventory.ts:505 패턴).
        // 기존 컬럼셋(quantity_before/after/change/created_by)은 inventory_adjustments 것 — 혼동 버그.
        c.env.DB.prepare(`
          INSERT INTO inventory_transactions (item_id, transaction_type, quantity, balance_after, reference_type, reference_id, reason, notes, handled_by, transaction_date, entity_id, storage_zone_id)
          VALUES (?, 'ADJUST', ?, ?, 'STOCK_COUNT', ?, 'STOCK_COUNT', ?, ?, datetime('now'), ?, ?)
        `).bind(
          item.item_id,
          item.counted_quantity - item.system_quantity, // quantity: 조정 변화량(부호 유지)
          item.counted_quantity,                         // balance_after: 보정 후 잔량
          countId,                                       // reference_id
          `Inventory Count ID: ${countId}`,              // notes
          c.get('user')?.id || null,                     // #394: handled_by는 users(id) FK — 'system' 문자열은 FK 위반(prod FK 강제). JWT user.id 또는 NULL(inventory.ts:505 패턴)
          entityId,
          zoneId                                         // 0396: 창고별 거래 추적
        )
      ]
    })
    // 상태 변경을 batch 마지막에 포함 — 보정+상태가 동시에 반영
    batchStmts.push(
      c.env.DB.prepare(`UPDATE inventory_counts SET status = 'APPROVED', approved_by = ?, approved_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'SUBMITTED'`).bind(userId, countId)
    )
    await c.env.DB.batch(batchStmts)

    return c.json({ success: true, adjusted: adjustable.length, skipped: skippedCount })
  } catch (error) {
    console.error('src/routes/inventoryCount.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

export default inventoryCountRouter
