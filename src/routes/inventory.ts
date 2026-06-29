import { Hono } from 'hono'
import { authMiddleware, requireRole } from '../middleware/auth'
import type { HonoEnv } from '../types/env'
import { getEntityId, entityFilter } from '../utils/entityFilter'
import { getNextEntitySeqNumber } from '../utils/sequenceGenerator'
import { triggerLowStockAlert } from '../utils/inventoryAlert'
import { getItemDefaultZone, getItemDefaultZones } from '../utils/inventoryZone'

const inventoryRouter = new Hono<HonoEnv>()

// Apply authentication middleware to all routes
inventoryRouter.use('/*', authMiddleware)

/** entity_id에 맞는 inventory JOIN 조건 반환 */
function invJoin(entityId: number): { join: string; params: number[] } {
  if (entityId === 0) return { join: 'LEFT JOIN inventory inv ON i.id = inv.item_id', params: [] }
  return { join: 'LEFT JOIN inventory inv ON i.id = inv.item_id AND inv.entity_id = ?', params: [entityId] }
}

// 품목 기본창고(items.storage_zone_id) 해석은 utils/inventoryZone(getItemDefaultZone/getItemDefaultZones) 사용.

// Get inventory items list with filters
inventoryRouter.get('/', async (c) => {
  try {
    const { page = '1', limit = '50', category, search, low_stock } = c.req.query()
    const offset = (Number(page) - 1) * Number(limit)
    const entityId = getEntityId(c)
    const inv = invJoin(entityId)

    // 다중행(창고별) 재고 → 품목당 1행으로 집계: current_stock=SUM(전 창고), 설정값=MAX(기본창고에 저장됨)
    let query = `
      SELECT
        i.id, i.item_name, i.category, i.sub_category, i.unit,
        i.base_unit, i.pack_size, i.stock_mode,
        i.base_price as unit_price,
        COALESCE(SUM(inv.quantity), 0) as current_stock,
        COALESCE(MAX(inv.safe_stock), 0) as safety_stock,
        COALESCE(MAX(inv.reorder_point), 0) as reorder_point,
        COALESCE(MAX(inv.auto_pr_enabled), 0) as auto_pr_enabled,
        i.description, i.is_active, i.created_at, i.updated_at
      FROM items i
      ${inv.join}
      WHERE i.is_purchase_item = 1 AND i.is_active = 1
    `
    const params: any[] = [...inv.params]

    if (search) {
      query += ` AND (i.item_name LIKE ? OR i.category LIKE ?)`
      const searchTerm = `%${search}%`
      params.push(searchTerm, searchTerm)
    }

    if (category) {
      query += ` AND i.category = ?`
      params.push(category)
    }

    query += ` GROUP BY i.id`
    if (low_stock === 'true') {
      query += ` HAVING COALESCE(SUM(inv.quantity), 0) <= COALESCE(MAX(inv.safe_stock), 0) AND COALESCE(MAX(inv.safe_stock), 0) > 0`
    }

    query += ` ORDER BY i.category, i.item_name LIMIT ? OFFSET ?`
    params.push(Number(limit), offset)

    const { results } = await c.env.DB.prepare(query).bind(...params).all()

    // Count total (집계/HAVING 후 품목 수 → 서브쿼리로 그룹 개수 카운트)
    let countInner = `
      SELECT i.id FROM items i
      ${inv.join}
      WHERE i.is_purchase_item = 1 AND i.is_active = 1
    `
    const countParams: any[] = [...inv.params]

    if (search) {
      countInner += ` AND (i.item_name LIKE ? OR i.category LIKE ?)`
      countParams.push(`%${search}%`, `%${search}%`)
    }
    if (category) {
      countInner += ` AND i.category = ?`
      countParams.push(category)
    }
    countInner += ` GROUP BY i.id`
    if (low_stock === 'true') {
      countInner += ` HAVING COALESCE(SUM(inv.quantity), 0) <= COALESCE(MAX(inv.safe_stock), 0) AND COALESCE(MAX(inv.safe_stock), 0) > 0`
    }
    const countQuery = `SELECT COUNT(*) as total FROM (${countInner})`

    const countRow = await c.env.DB.prepare(countQuery).bind(...countParams).first<{ total: number }>()
    const total = countRow?.total || 0

    return c.json({
      success: true,
      data: {
        items: results,
        pagination: { page: Number(page), limit: Number(limit), total, total_pages: Math.ceil(total / Number(limit)) }
      }
    })
  } catch (error: any) {
    console.error('Failed to get inventory items:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다' }, 500)
  }
})

// Get inventory item by ID
inventoryRouter.get('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const entityId = getEntityId(c)
    const inv = invJoin(entityId)

    // 품목 총재고(전 창고 SUM) + 설정값(MAX=기본창고)
    const result = await c.env.DB.prepare(`
      SELECT
        i.id, i.item_name, i.category, i.sub_category, i.unit,
        i.base_unit, i.pack_size, i.stock_mode,
        i.base_price as unit_price,
        COALESCE(SUM(inv.quantity), 0) as current_stock,
        COALESCE(MAX(inv.safe_stock), 0) as safety_stock,
        COALESCE(MAX(inv.reorder_point), 0) as reorder_point,
        COALESCE(MAX(inv.auto_pr_enabled), 0) as auto_pr_enabled,
        i.description, i.is_active
      FROM items i
      ${inv.join}
      WHERE i.id = ? AND i.is_purchase_item = 1
      GROUP BY i.id
    `).bind(...inv.params, id).first()

    if (!result) {
      return c.json({ success: false, error: 'Item not found' }, 404)
    }

    // 창고별 분해 (NULL zone = 미배정). entity 격리 유지.
    const zonesParams: any[] = [id]
    let zonesSql = `
      SELECT inv.storage_zone_id,
             COALESCE(sz.zone_name, '미배정') as zone_name,
             inv.quantity,
             COALESCE(inv.safe_stock, 0) as safe_stock
      FROM inventory inv
      LEFT JOIN storage_zones sz ON inv.storage_zone_id = sz.id
      WHERE inv.item_id = ?
    `
    if (entityId > 0) {
      zonesSql += ` AND inv.entity_id = ?`
      zonesParams.push(entityId)
    }
    zonesSql += ` ORDER BY inv.storage_zone_id IS NULL, sz.sort_order, sz.zone_name`
    const { results: zones } = await c.env.DB.prepare(zonesSql).bind(...zonesParams).all()

    return c.json({ success: true, data: { ...result, zones } })
  } catch (error: any) {
    console.error('Failed to get inventory item:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다' }, 500)
  }
})

// Get inventory transactions for an item
inventoryRouter.get('/:id/transactions', async (c) => {
  try {
    const id = c.req.param('id')
    const { limit = '50' } = c.req.query()
    const ef = entityFilter(c, 't')

    const { results } = await c.env.DB.prepare(`
      SELECT t.*, u.name as handled_by_name
      FROM inventory_transactions t
      LEFT JOIN users u ON t.handled_by = u.id
      WHERE t.item_id = ?${ef.clause}
      ORDER BY t.transaction_date DESC, t.id DESC
      LIMIT ?
    `).bind(id, ...ef.params, Number(limit)).all()

    return c.json({ success: true, data: { transactions: results } })
  } catch (error: any) {
    console.error('Failed to get transactions:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다' }, 500)
  }
})

// Get inventory categories (from items table)
inventoryRouter.get('/meta/categories', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT DISTINCT i.category, COUNT(*) as item_count
      FROM items i
      WHERE i.is_purchase_item = 1 AND i.is_active = 1
      GROUP BY i.category ORDER BY i.category
    `).all()
    return c.json({ success: true, data: { categories: results } })
  } catch (error: any) {
    console.error('Failed to get categories:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다' }, 500)
  }
})

// Get low stock items
inventoryRouter.get('/alerts/low-stock', async (c) => {
  try {
    const entityId = getEntityId(c)
    const inv = invJoin(entityId)

    // 다중행 → 품목 총재고(SUM) vs 안전재고(MAX=기본창고) 집계 (창고 중복 카운트 방지)
    const { results } = await c.env.DB.prepare(`
      SELECT
        i.id, i.item_name, i.category, i.unit,
        COALESCE(SUM(inv.quantity), 0) as current_stock,
        COALESCE(MAX(inv.safe_stock), 0) as safety_stock,
        COALESCE(MAX(inv.reorder_point), 0) as reorder_point,
        (COALESCE(MAX(inv.safe_stock), 0) - COALESCE(SUM(inv.quantity), 0)) as shortage
      FROM items i
      ${inv.join}
      WHERE i.is_purchase_item = 1 AND i.is_active = 1
      GROUP BY i.id
      HAVING COALESCE(SUM(inv.quantity), 0) <= COALESCE(MAX(inv.safe_stock), 0)
        AND COALESCE(MAX(inv.safe_stock), 0) > 0
      ORDER BY shortage DESC
    `).bind(...inv.params).all()

    return c.json({ success: true, data: { items: results, count: results.length } })
  } catch (error: any) {
    console.error('Failed to get low stock items:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다' }, 500)
  }
})

// Update inventory settings (safety stock, reorder point)
inventoryRouter.put('/:id/settings', async (c) => {
  try {
    const user = c.get('user')
    if (!user || !['ADMIN', 'MANAGER'].includes(user.role)) {
      return c.json({ success: false, error: '권한이 없습니다' }, 403)
    }

    const id = c.req.param('id')
    const { safe_stock, reorder_point, auto_pr_enabled } = await c.req.json()
    const entityId = getEntityId(c) || 1

    const item = await c.env.DB.prepare(
      `SELECT id, storage_zone_id FROM items WHERE id = ? AND is_purchase_item = 1`
    ).bind(id).first<{ id: number; storage_zone_id: number | null }>()

    if (!item) {
      return c.json({ success: false, error: 'Item not found' }, 404)
    }

    const safeStock = Number(safe_stock) || 0
    const rop = Number(reorder_point) || 0
    const autoPr = auto_pr_enabled ? 1 : 0

    // 설정은 품목 기본창고 행에 저장 (NULL=미배정). zone 키 미포함 시 다중 창고 행 동시 변경 = 버그.
    const zoneId = item.storage_zone_id

    const existing = await c.env.DB.prepare(
      `SELECT id FROM inventory WHERE item_id = ? AND entity_id = ? AND IFNULL(storage_zone_id, 0) = IFNULL(?, 0)`
    ).bind(id, entityId, zoneId).first()

    if (existing) {
      await c.env.DB.prepare(`
        UPDATE inventory
        SET safe_stock = ?, reorder_point = ?, auto_pr_enabled = ?, last_updated = CURRENT_TIMESTAMP
        WHERE item_id = ? AND entity_id = ? AND IFNULL(storage_zone_id, 0) = IFNULL(?, 0)
      `).bind(safeStock, rop, autoPr, id, entityId, zoneId).run()
    } else {
      await c.env.DB.prepare(`
        INSERT INTO inventory (item_id, quantity, safe_stock, reorder_point, auto_pr_enabled, entity_id, storage_zone_id, last_updated)
        VALUES (?, 0, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).bind(id, safeStock, rop, autoPr, entityId, zoneId).run()
    }

    return c.json({
      success: true,
      message: '설정이 저장되었습니다',
      data: { safe_stock: safeStock, reorder_point: rop, auto_pr_enabled: autoPr }
    })
  } catch (error: any) {
    console.error('Failed to update inventory settings:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다' }, 500)
  }
})

// Create inventory receipt (입고)
inventoryRouter.post('/receipts', async (c) => {
  try {
    const user = c.get('user')
    const data = await c.req.json()
    const { supplier, receipt_date, items, notes } = data

    if (!supplier || !receipt_date || !items || items.length === 0) {
      return c.json({ success: false, message: 'Supplier, receipt_date, and items are required' }, 400)
    }

    for (const item of items) {
      if (!item.item_id || !item.quantity || item.quantity <= 0) {
        return c.json({ success: false, message: 'item_id와 양수 quantity 필수' }, 400)
      }
      if (item.unit_price === undefined || item.unit_price === null || item.unit_price < 0) {
        return c.json({ success: false, message: `품목 ${item.item_id}: unit_price는 0 이상이어야 합니다` }, 400)
      }
    }

    const entityId = getEntityId(c) || 1

    // Generate receipt number (#329: 법인코드 E{eid} 내장 + MAX 기반 — 글로벌 COUNT 멀티법인 충돌 방지)
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '')
    const receiptNumber = await getNextEntitySeqNumber(c.env.DB, 'inventory_receipts', 'receipt_number', entityId, today, { base: 'RCV-' })

    const totalAmount = items.reduce((sum: number, item: any) => sum + (item.quantity * item.unit_price), 0)

    // Insert receipt header (with entity_id)
    const receiptResult = await c.env.DB.prepare(`
      INSERT INTO inventory_receipts
      (receipt_number, receipt_date, supplier, total_amount, status, received_by, notes, entity_id)
      VALUES (?, ?, ?, ?, 'COMPLETED', ?, ?, ?)
    `).bind(receiptNumber, receipt_date, supplier, totalAmount, user?.id || 1, notes || null, entityId).run()
    const receiptId = receiptResult.meta.last_row_id

    // Insert receipt items + upsert inventory (batch) — 품목 기본창고 행에 누적
    // 표현식 UNIQUE(item, entity, IFNULL(zone,0))라 ON CONFLICT(item, entity)는 무효 →
    //   INSERT OR IGNORE(기본창고 0행 보장) + zone 키 UPDATE 누적. (배치 내 동일품목 중복라인도 안전)
    const itemIds = items.map((item: any) => item.item_id)
    const zoneMap = await getItemDefaultZones(c.env.DB, itemIds)

    const receiptStmts: any[] = []
    for (const item of items) {
      const { item_id, quantity, unit_price, location } = item
      const amount = quantity * unit_price
      const zoneId = zoneMap.get(item_id) ?? null

      receiptStmts.push(
        c.env.DB.prepare(`
          INSERT INTO inventory_receipt_items (receipt_id, item_id, quantity, unit_price, amount, location)
          VALUES (?, ?, ?, ?, ?, ?)
        `).bind(receiptId, item_id, quantity, unit_price, amount, location || null),
        c.env.DB.prepare(`
          INSERT OR IGNORE INTO inventory (item_id, quantity, entity_id, storage_zone_id, last_updated)
          VALUES (?, 0, ?, ?, CURRENT_TIMESTAMP)
        `).bind(item_id, entityId, zoneId),
        c.env.DB.prepare(`
          UPDATE inventory SET quantity = quantity + ?, last_updated = CURRENT_TIMESTAMP
          WHERE item_id = ? AND entity_id = ? AND IFNULL(storage_zone_id, 0) = IFNULL(?, 0)
        `).bind(quantity, item_id, entityId, zoneId)
      )
    }
    await c.env.DB.batch(receiptStmts)

    // Get updated balances (창고별) + insert transactions (storage_zone_id 기록)
    const ph = itemIds.map(() => '?').join(',')
    const { results: balances } = await c.env.DB.prepare(
      `SELECT item_id, storage_zone_id, quantity FROM inventory WHERE item_id IN (${ph}) AND entity_id = ?`
    ).bind(...itemIds, entityId).all()
    const balanceMap: Record<string, number> = {}
    for (const b of balances) balanceMap[`${b.item_id}:${(b.storage_zone_id as number | null) ?? 0}`] = b.quantity as number

    await c.env.DB.batch(
      items.map((item: any) => {
        const amount = item.quantity * item.unit_price
        const zoneId = zoneMap.get(item.item_id) ?? null
        return c.env.DB.prepare(`
          INSERT INTO inventory_transactions
          (item_id, transaction_type, transaction_date, quantity, unit_price, total_amount,
           reference_type, reference_id, balance_after, reason, handled_by, entity_id, storage_zone_id)
          VALUES (?, 'IN', ?, ?, ?, ?, 'PURCHASE', ?, ?, '입고', ?, ?, ?)
        `).bind(
          item.item_id, receipt_date, item.quantity, item.unit_price, amount,
          receiptId, balanceMap[`${item.item_id}:${zoneId ?? 0}`] || 0, user?.id || 1, entityId, zoneId
        )
      })
    )

    return c.json({
      success: true,
      data: { receipt_number: receiptNumber, receipt_id: receiptId },
      message: 'Receipt created successfully'
    })
  } catch (error: any) {
    console.error('Failed to create receipt:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다' }, 500)
  }
})

// GET /receipts/inspection-counts
inventoryRouter.get('/receipts/inspection-counts', async (c) => {
  try {
    const [pr, overdue] = await Promise.all([
      c.env.DB.prepare(
        `SELECT COUNT(*) AS n FROM inventory_receipts WHERE inspection_status = 'PENDING_REVIEW'`
      ).first<{ n: number }>(),
      c.env.DB.prepare(
        `SELECT COUNT(*) AS n FROM inventory_receipts
         WHERE inspection_status IS NULL AND status != 'CANCELLED'
           AND created_at <= datetime('now', '-24 hours')`
      ).first<{ n: number }>(),
    ])
    const prCount = Number(pr?.n || 0)
    const overdueCount = Number(overdue?.n || 0)
    return c.json({
      success: true,
      data: { pending_review: prCount, overdue_uninspected: overdueCount, total: prCount + overdueCount }
    })
  } catch (err: any) {
    console.error('inspection-counts error:', err)
    return c.json({ success: false, error: '카운트 조회 실패' }, 500)
  }
})

// GET /receipts/pending-review
inventoryRouter.get('/receipts/pending-review', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      `SELECT r.id, r.receipt_number, r.receipt_date, r.supplier, r.total_amount, r.notes,
              r.inspection_status, r.status,
              (SELECT COUNT(*) FROM inventory_receipt_items WHERE receipt_id = r.id) AS line_count,
              (SELECT COALESCE(SUM(rejected_quantity), 0) FROM inventory_receipt_items WHERE receipt_id = r.id) AS total_rejected,
              (SELECT u.name FROM users u WHERE u.id = r.received_by) AS receiver_name
       FROM inventory_receipts r
       WHERE r.inspection_status = 'PENDING_REVIEW'
       ORDER BY r.created_at DESC LIMIT 100`
    ).all()
    return c.json({ success: true, data: results })
  } catch (err: any) {
    console.error('pending-review error:', err)
    return c.json({ success: false, error: '조회 실패' }, 500)
  }
})

// PATCH /receipts/:id/inspection-decision
inventoryRouter.patch('/receipts/:id/inspection-decision',
  requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json<{ decision: string; notes?: string }>()
    const decision = String(body.decision || '')
    const notes = body.notes || null
    const valid = ['PARTIAL_ACCEPT', 'WAITING_RESHIP', 'CANCELLED']
    if (!valid.includes(decision)) {
      return c.json({ success: false, error: 'decision은 PARTIAL_ACCEPT/WAITING_RESHIP/CANCELLED 중 하나' }, 400)
    }

    const inspStatus = decision === 'PARTIAL_ACCEPT' ? 'NORMAL'
                     : decision === 'WAITING_RESHIP' ? 'WAITING_RESHIP'
                     : 'CANCELLED'
    const receiptStatus = decision === 'CANCELLED' ? 'CANCELLED' : null
    const decisionLog = '[' + new Date().toISOString().slice(0,16).replace('T',' ') + ' 결정] ' + decision + (notes ? ': ' + notes : '')

    const cancelEntityId = getEntityId(c) || 1
    // #373: CANCELLED 분기에서 PO 롤백 결과를 응답에 노출하기 위해 호이스팅
    let poRollback: {
      items: Array<{ poItemId: number; recv: number; acc: number; rej: number }>
      newStatus: string
      prevStatus: string
    } | null = null

    if (receiptStatus === 'CANCELLED') {
      // #369 멱등 가드: 이미 취소된 receipt면 재차감 없이 멱등 반환 (재시도/중복제출 이중차감 방지)
      const curReceipt = await c.env.DB.prepare(
        `SELECT inspection_status, status, po_id FROM inventory_receipts WHERE id = ?`
      ).bind(id).first<{ inspection_status: string | null; status: string | null; po_id: number | null }>()
      if (!curReceipt) return c.json({ success: false, error: '입고 정보를 찾을 수 없습니다.' }, 404)
      if (curReceipt.status === 'CANCELLED') {
        return c.json({ success: true, data: { id: Number(id), inspection_status: 'CANCELLED', receipt_status: 'CANCELLED', idempotent: true } })
      }

      const { results: receiptItems } = await c.env.DB.prepare(
        `SELECT item_id, received_quantity, accepted_quantity, rejected_quantity, po_item_id
           FROM inventory_receipt_items WHERE receipt_id = ?`
      ).bind(id).all()

      // 재고 역분개는 '합격분(accepted_quantity)'만 차감 — 정방향(po-receive)이 합격분만 입고했기 때문.
      //   received_quantity로 빼면 거부분까지 과차감되어 정상재고가 훼손됨(#373 동반수정).
      const invItems = (receiptItems || []).filter((ri) => ri.item_id && (ri.accepted_quantity as number) > 0)

      // 역분개 대상 창고 = 품목 기본창고(정방향 입고가 거기 누적했으므로). NULL=미배정.
      const cancelZoneMap = await getItemDefaultZones(c.env.DB, invItems.map((ri) => ri.item_id as number))
      // 차감 전 현재 잔량 1회 조회 → balance_after를 메모리에서 산출(= max(0, 현재−합격분)) → 차감 후 read 제거
      const cancelBalMap: Record<string, number> = {}
      if (invItems.length > 0) {
        const cancelItemIds = invItems.map((ri) => ri.item_id)
        const cancelPh = cancelItemIds.map(() => '?').join(',')
        const { results: cancelBalances } = await c.env.DB.prepare(
          `SELECT item_id, storage_zone_id, quantity FROM inventory WHERE item_id IN (${cancelPh}) AND entity_id = ?`
        ).bind(...cancelItemIds, cancelEntityId).all()
        for (const b of cancelBalances) cancelBalMap[`${b.item_id}:${(b.storage_zone_id as number | null) ?? 0}`] = b.quantity as number
      }

      // ── #373: PO 측 상태 롤백 사전계산 (po_id 있는 입고만; standalone 입고는 PO 없음) ──
      // '전량 취소' 시맨틱 → 이 receipt가 PO에 누적시킨 received/accepted/rejected를 그대로 역산하고
      //   line_status·purchase_orders.status를 재산정. (미롤백 시 PO가 RECEIVED에 잔류 → 재입고 400 차단)
      const poId = curReceipt.po_id
      if (poId) {
        // receipt 라인 → po_item별 누적분 집계 (동일 po_item 다중라인 방어)
        const aggByPoItem: Record<number, { recv: number; acc: number; rej: number }> = {}
        for (const ri of (receiptItems || [])) {
          const pid = ri.po_item_id as number | null
          if (!pid) continue
          const a = aggByPoItem[pid] || (aggByPoItem[pid] = { recv: 0, acc: 0, rej: 0 })
          a.recv += Number(ri.received_quantity || 0)
          a.acc += Number(ri.accepted_quantity || 0)
          a.rej += Number(ri.rejected_quantity || 0)
        }
        const rollbackItems = Object.entries(aggByPoItem).map(([pid, v]) => ({
          poItemId: Number(pid), recv: v.recv, acc: v.acc, rej: v.rej,
        }))

        if (rollbackItems.length > 0) {
          const po = await c.env.DB.prepare(`SELECT status FROM purchase_orders WHERE id = ?`)
            .bind(poId).first<{ status: string }>()
          const { results: allPoItems } = await c.env.DB.prepare(
            `SELECT id, quantity, received_quantity FROM purchase_order_items WHERE po_id = ?`
          ).bind(poId).all()

          const rbMap: Record<number, number> = {}
          for (const r of rollbackItems) rbMap[r.poItemId] = r.recv

          // 롤백 후 received_quantity 기준 PO status 재산정 (정방향 willAllReceived 대칭)
          let allReceived = (allPoItems || []).length > 0
          let anyReceived = false
          for (const pi of (allPoItems || [])) {
            const qty = Number(pi.quantity || 0)
            const newRecv = Math.max(0, Number(pi.received_quantity || 0) - (rbMap[pi.id as number] || 0))
            if (!(qty > 0 && newRecv >= qty)) allReceived = false
            if (newRecv > 0) anyReceived = true
          }
          const newPoStatus = allReceived ? 'RECEIVED' : anyReceived ? 'PARTIAL_RECEIVED' : 'CONFIRMED'
          poRollback = { items: rollbackItems, newStatus: newPoStatus, prevStatus: po?.status || '' }
        }
      }

      // 차감 + 역분개 + (PO 롤백) + receipt 상태변경을 단일 batch(트랜잭션)로 원자 실행
      // → "차감됨 ⇔ CANCELLED 표기됨 ⇔ PO 롤백됨" 보장 → 부분실패 후 재시도가 위 멱등 가드와 결합해 안전
      const ops: D1PreparedStatement[] = []
      for (const ri of invItems) {
        const acc = ri.accepted_quantity as number
        const zoneId = cancelZoneMap.get(ri.item_id as number) ?? null
        const before = cancelBalMap[`${ri.item_id}:${zoneId ?? 0}`] || 0
        const after = Math.max(0, before - acc)
        ops.push(
          c.env.DB.prepare(`UPDATE inventory SET quantity = MAX(0, quantity - ?), last_updated = CURRENT_TIMESTAMP WHERE item_id = ? AND entity_id = ? AND IFNULL(storage_zone_id, 0) = IFNULL(?, 0)`)
            .bind(acc, ri.item_id, cancelEntityId, zoneId)
        )
        ops.push(
          c.env.DB.prepare(
            `INSERT INTO inventory_transactions (item_id, transaction_type, quantity, balance_after, reference_type, reference_id, notes, handled_by, transaction_date, entity_id, storage_zone_id)
             VALUES (?, 'OUT', ?, ?, 'RECEIPT_CANCEL', ?, ?, ?, datetime('now'), ?, ?)`
          ).bind(
            ri.item_id, acc, after,
            Number(id), '입고 취소 역분개(합격분)', c.get('user')?.id || null, cancelEntityId, zoneId
          )
        )
      }

      // #373: PO 라인 received/accepted/rejected 역산 + line_status 재계산
      if (poRollback) {
        for (const r of poRollback.items) {
          ops.push(
            c.env.DB.prepare(
              `UPDATE purchase_order_items
                  SET received_quantity = MAX(0, received_quantity - ?),
                      accepted_quantity = MAX(0, accepted_quantity - ?),
                      rejected_quantity = MAX(0, rejected_quantity - ?),
                      line_status = CASE
                        WHEN MAX(0, received_quantity - ?) >= quantity AND quantity > 0 THEN 'RECEIVED'
                        WHEN MAX(0, received_quantity - ?) > 0 THEN 'PARTIAL'
                        ELSE 'PENDING' END,
                      updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND po_id = ?`
            ).bind(r.recv, r.acc, r.rej, r.recv, r.recv, r.poItemId, poId)
          )
        }
        // PO 헤더 status 재산정 (사전계산값)
        ops.push(
          c.env.DB.prepare(`UPDATE purchase_orders SET status = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
            .bind(poRollback.newStatus, c.get('user')?.id || 1, poId)
        )
        if (poRollback.newStatus !== poRollback.prevStatus && poRollback.prevStatus) {
          ops.push(
            c.env.DB.prepare(
              `INSERT INTO po_status_history (po_id, from_status, to_status, changed_by, change_reason)
               VALUES (?, ?, ?, ?, '입고 검수 전량취소 롤백')`
            ).bind(poId, poRollback.prevStatus, poRollback.newStatus, c.get('user')?.id || 1)
          )
        }
      }

      // receipt 상태변경 — WHERE에 선행상태 가드(동시성 추가 방어)
      ops.push(
        c.env.DB.prepare(
          `UPDATE inventory_receipts SET inspection_status = ?, status = ?, notes = COALESCE(notes || char(10), '') || ? WHERE id = ? AND COALESCE(status, '') <> 'CANCELLED'`
        ).bind(inspStatus, receiptStatus, decisionLog, id)
      )
      await c.env.DB.batch(ops)
    } else if (receiptStatus) {
      await c.env.DB.prepare(
        `UPDATE inventory_receipts SET inspection_status = ?, status = ?, notes = COALESCE(notes || char(10), '') || ? WHERE id = ?`
      ).bind(inspStatus, receiptStatus, decisionLog, id).run()
    } else {
      await c.env.DB.prepare(
        `UPDATE inventory_receipts SET inspection_status = ?, notes = COALESCE(notes || char(10), '') || ? WHERE id = ?`
      ).bind(inspStatus, decisionLog, id).run()
    }
    return c.json({ success: true, data: {
      id: Number(id), inspection_status: inspStatus, receipt_status: receiptStatus,
      po_status: poRollback ? poRollback.newStatus : undefined
    } })
  } catch (err: any) {
    console.error('inspection-decision error:', err)
    return c.json({ success: false, error: '결정 처리 실패', detail: '서버 오류가 발생했습니다' }, 500)
  }
})

// GET /receipts/:id
inventoryRouter.get('/receipts/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const receipt = await c.env.DB.prepare(`
      SELECT ir.id, ir.receipt_number, ir.receipt_date, ir.supplier,
             ir.total_amount, ir.status, ir.inspection_status, ir.notes, ir.po_id
      FROM inventory_receipts ir WHERE ir.id = ?
    `).bind(id).first<{
      id: number; receipt_number: string; receipt_date: string; supplier: string;
      total_amount: number; status: string; inspection_status: string | null; notes: string | null; po_id: number | null
    }>()

    if (!receipt) return c.json({ success: false, error: '입고 정보를 찾을 수 없습니다.' }, 404)

    const { results: items } = await c.env.DB.prepare(`
      SELECT iri.id, iri.item_id, iri.quantity, iri.received_quantity,
             iri.accepted_quantity, iri.rejected_quantity, iri.quality_status,
             iri.reject_memo, iri.po_item_id, m.item_name
      FROM inventory_receipt_items iri
      LEFT JOIN items m ON iri.item_id = m.id
      WHERE iri.receipt_id = ? ORDER BY iri.id
    `).bind(id).all()

    return c.json({ success: true, data: { ...receipt, items: items || [] } })
  } catch (error) {
    console.error('GET /receipts/:id error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// Create inventory release (출고)
inventoryRouter.post('/releases', async (c) => {
  try {
    const user = c.get('user')
    const data = await c.req.json()
    const { reference_type, reference_id, release_date, items, notes } = data

    if (!reference_type || !release_date || !items || items.length === 0) {
      return c.json({ success: false, message: 'Reference type, release_date, and items are required' }, 400)
    }

    const entityId = getEntityId(c) || 1

    const today = new Date().toISOString().split('T')[0].replace(/-/g, '')
    const countRow = await c.env.DB.prepare(
      `SELECT COUNT(*) as count FROM inventory_releases WHERE release_number LIKE ?`
    ).bind(`REL-${today}%`).first<{ count: number }>()
    const sequence = ((countRow?.count || 0) + 1).toString().padStart(3, '0')
    const releaseNumber = `REL-${today}-${sequence}`

    // Insert release header (with entity_id)
    const releaseResult = await c.env.DB.prepare(`
      INSERT INTO inventory_releases
      (release_number, release_date, reference_type, reference_id, status, released_by, notes, entity_id)
      VALUES (?, ?, ?, ?, 'COMPLETED', ?, ?, ?)
    `).bind(releaseNumber, release_date, reference_type, reference_id || null, user?.id || 1, notes || null, entityId).run()
    const releaseId = releaseResult.meta.last_row_id

    // 출고 차감 대상 창고 = 품목 기본창고 (UP1). NULL=미배정 행에서 차감.
    const releaseItemIds = items.map((item: any) => item.item_id)
    const relZoneMap = await getItemDefaultZones(c.env.DB, releaseItemIds)
    const relPh = releaseItemIds.map(() => '?').join(',')
    const { results: stockRows } = await c.env.DB.prepare(
      `SELECT item_id, storage_zone_id, quantity FROM inventory WHERE item_id IN (${relPh}) AND entity_id = ?`
    ).bind(...releaseItemIds, entityId).all()
    const stockMap: Record<string, number> = {}
    for (const s of stockRows) stockMap[`${s.item_id}:${(s.storage_zone_id as number | null) ?? 0}`] = s.quantity as number
    // 품목 기본창고 행 재고
    const zoneStock = (itemId: number) => stockMap[`${itemId}:${relZoneMap.get(itemId) ?? 0}`] || 0

    // 재고 부족 사전 검증 (기본창고 기준)
    for (const item of items) {
      const currentStock = zoneStock(item.item_id)
      if (currentStock < item.quantity) {
        return c.json({
          success: false,
          message: `재고 부족 (품목 ${item.item_id}). 현재고: ${currentStock}, 요청: ${item.quantity}`
        }, 400)
      }
    }

    // Insert release items + update inventory (zone 조건)
    const releaseStmts = items.flatMap((item: any) => {
      const zoneId = relZoneMap.get(item.item_id) ?? null
      const newStock = zoneStock(item.item_id) - item.quantity
      return [
        c.env.DB.prepare(
          `INSERT INTO inventory_release_items (release_id, item_id, quantity) VALUES (?, ?, ?)`
        ).bind(releaseId, item.item_id, item.quantity),
        c.env.DB.prepare(
          `UPDATE inventory SET quantity = ?, last_updated = CURRENT_TIMESTAMP WHERE item_id = ? AND entity_id = ? AND IFNULL(storage_zone_id, 0) = IFNULL(?, 0)`
        ).bind(newStock, item.item_id, entityId, zoneId),
        c.env.DB.prepare(`
          INSERT INTO inventory_transactions
          (item_id, transaction_type, transaction_date, quantity, reference_type,
           reference_id, balance_after, reason, handled_by, entity_id, storage_zone_id)
          VALUES (?, 'OUT', ?, ?, ?, ?, ?, '출고', ?, ?, ?)
        `).bind(item.item_id, release_date, -item.quantity, reference_type, reference_id || null, newStock, user?.id || 1, entityId, zoneId)
      ]
    })
    await c.env.DB.batch(releaseStmts)

    // Phase 6: 출고 후 안전재고 이하 품목 알림
    try {
      const lowItems = items.filter((item: any) => {
        const newQty = zoneStock(item.item_id) - item.quantity
        const safeStock = Number(item.safe_stock) || 0
        return safeStock > 0 && newQty <= safeStock
      })
      if (lowItems.length > 0) {
        // 안전재고 정보 조회 — 품목 총재고(SUM) vs 안전재고(MAX=기본창고) 집계
        const lowItemIds = lowItems.map((i: any) => i.item_id)
        const lowPh = lowItemIds.map(() => '?').join(',')
        const { results: lowDetails } = await c.env.DB.prepare(`
          SELECT i.id as item_id, i.item_name, i.unit,
                 COALESCE(SUM(inv.quantity), 0) as current_stock,
                 COALESCE(MAX(inv.safe_stock), 0) as safe_stock
          FROM items i LEFT JOIN inventory inv ON i.id = inv.item_id AND inv.entity_id = ?
          WHERE i.id IN (${lowPh})
          GROUP BY i.id
        `).bind(entityId, ...lowItemIds).all()
        await triggerLowStockAlert(c.env.DB, (lowDetails || []).map((d: any) => ({
          item_id: d.item_id, item_name: d.item_name, current_stock: d.current_stock,
          safe_stock: d.safe_stock, unit: d.unit || 'EA',
        })), entityId)
      }
    } catch (_alertErr) { /* 알림 실패가 출고를 방해하면 안 됨 */ }

    return c.json({
      success: true,
      data: { release_number: releaseNumber, release_id: releaseId },
      message: 'Release created successfully'
    })
  } catch (error: any) {
    console.error('Failed to create release:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다' }, 500)
  }
})

// Inventory adjustment (재고 조정)
inventoryRouter.post('/adjustments', async (c) => {
  try {
    const user = c.get('user')
    const data = await c.req.json()
    const { item_id, adjustment_date, adjustment_quantity, reason, notes } = data

    if (!item_id || !adjustment_date || adjustment_quantity === undefined || !reason) {
      return c.json({ success: false, message: 'Item ID, adjustment date, quantity, and reason are required' }, 400)
    }

    const entityId = getEntityId(c) || 1
    const adjQty = Number(adjustment_quantity)
    // 조정 대상 창고 = 품목 기본창고 (NULL=미배정)
    const zoneId = await getItemDefaultZone(c.env.DB, item_id)

    const invRow = await c.env.DB.prepare(
      `SELECT quantity FROM inventory WHERE item_id = ? AND entity_id = ? AND IFNULL(storage_zone_id, 0) = IFNULL(?, 0)`
    ).bind(item_id, entityId, zoneId).first<{ quantity: number }>()

    const quantityBefore = invRow?.quantity || 0

    if (invRow) {
      const updateResult = await c.env.DB.prepare(`
        UPDATE inventory SET quantity = quantity + ?, last_updated = CURRENT_TIMESTAMP
        WHERE item_id = ? AND entity_id = ? AND IFNULL(storage_zone_id, 0) = IFNULL(?, 0) AND (quantity + ?) >= 0
      `).bind(adjQty, item_id, entityId, zoneId, adjQty).run()

      if (adjQty < 0 && updateResult.meta.changes === 0) {
        return c.json({ success: false, message: '재고 부족으로 조정할 수 없습니다' }, 400)
      }
    } else {
      if (adjQty < 0) {
        return c.json({ success: false, message: '재고 부족으로 조정할 수 없습니다' }, 400)
      }
      await c.env.DB.prepare(`
        INSERT INTO inventory (item_id, quantity, entity_id, storage_zone_id, last_updated)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).bind(item_id, adjQty, entityId, zoneId).run()
    }

    const newStock = await c.env.DB.prepare(
      `SELECT quantity FROM inventory WHERE item_id = ? AND entity_id = ? AND IFNULL(storage_zone_id, 0) = IFNULL(?, 0)`
    ).bind(item_id, entityId, zoneId).first<{ quantity: number }>()
    const quantityAfter = newStock?.quantity ?? 0
    // #167: quantityBefore를 실제 변경량 기반으로 계산 (race condition 방지)
    const actualBefore = quantityAfter - adjQty

    const transactionType = adjQty > 0 ? 'IN' : 'OUT'
    await c.env.DB.batch([
      c.env.DB.prepare(`
        INSERT INTO inventory_adjustments
        (item_id, adjustment_date, quantity_before, quantity_after,
         adjustment_quantity, reason, adjusted_by, notes, entity_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(item_id, adjustment_date, actualBefore, quantityAfter,
        adjustment_quantity, reason, user?.id || 1, notes || null, entityId),
      c.env.DB.prepare(`
        INSERT INTO inventory_transactions
        (item_id, transaction_type, transaction_date, quantity,
         reference_type, balance_after, reason, handled_by, notes, entity_id, storage_zone_id)
        VALUES (?, ?, ?, ?, 'ADJUSTMENT', ?, ?, ?, ?, ?, ?)
      `).bind(item_id, transactionType, adjustment_date, adjustment_quantity,
        quantityAfter, reason, user?.id || 1, notes || null, entityId, zoneId),
    ])

    return c.json({
      success: true,
      data: { quantity_before: quantityBefore, quantity_after: quantityAfter },
      message: 'Adjustment completed successfully'
    })
  } catch (error: any) {
    console.error('Failed to create adjustment:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다' }, 500)
  }
})

// Get inventory summary statistics
inventoryRouter.get('/stats/summary', async (c) => {
  try {
    const entityId = getEntityId(c)
    const inv = invJoin(entityId)

    const totalRow = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM items WHERE is_purchase_item = 1 AND is_active = 1`
    ).first<{ total: number }>()

    // 다중행 → 품목 총재고(SUM) vs 안전재고(MAX) 기준 품목 수 (창고 중복 카운트 방지)
    const lowStockRow = await c.env.DB.prepare(`
      SELECT COUNT(*) as count FROM (
        SELECT i.id FROM items i
        JOIN inventory inv ON i.id = inv.item_id ${entityId > 0 ? 'AND inv.entity_id = ?' : ''}
        WHERE i.is_purchase_item = 1 AND i.is_active = 1
        GROUP BY i.id
        HAVING SUM(inv.quantity) <= MAX(inv.safe_stock) AND MAX(inv.safe_stock) > 0
      )
    `).bind(...(entityId > 0 ? [entityId] : [])).first<{ count: number }>()

    const valueRow = await c.env.DB.prepare(`
      SELECT SUM(COALESCE(inv.quantity, 0) * COALESCE(i.base_price, 0)) as total_value
      FROM items i ${inv.join}
      WHERE i.is_purchase_item = 1 AND i.is_active = 1
    `).bind(...inv.params).first<{ total_value: number | null }>()

    const { results: categoryResults } = await c.env.DB.prepare(`
      SELECT i.category, COUNT(*) as item_count,
        SUM(COALESCE(inv.quantity, 0) * COALESCE(i.base_price, 0)) as category_value
      FROM items i ${inv.join}
      WHERE i.is_purchase_item = 1 AND i.is_active = 1
      GROUP BY i.category
    `).bind(...inv.params).all()

    return c.json({
      success: true,
      data: {
        total_items: totalRow?.total || 0,
        low_stock_items: lowStockRow?.count || 0,
        total_value: valueRow?.total_value || 0,
        categories: categoryResults
      }
    })
  } catch (error: any) {
    console.error('Failed to get inventory summary:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다' }, 500)
  }
})

// ── 창고별 재고 대시보드 API ──
inventoryRouter.get('/dashboard/zones', async (c) => {
  try {
    const entityId = getEntityId(c)
    const zoneFilter = c.req.query('zone_id')
    const params: any[] = []

    // 1. 창고 목록 (법인 필터)
    let zoneSql = `
      SELECT sz.id, sz.zone_name, sz.zone_code, sz.is_default, sz.entity_id,
        e.short_name as entity_name
      FROM storage_zones sz
      LEFT JOIN entities e ON sz.entity_id = e.id
      WHERE sz.is_active = 1
    `
    const zoneParams: any[] = []
    if (entityId > 0) {
      zoneSql += ' AND sz.entity_id = ?'
      zoneParams.push(entityId)
    }
    zoneSql += ' ORDER BY sz.entity_id, sz.sort_order, sz.zone_name'
    const { results: zones } = await c.env.DB.prepare(zoneSql).bind(...zoneParams).all()

    // 2. 창고별 품목 재고 현황 (0396 다중행: 실제 재고 창고 inv.storage_zone_id 기준 — 품목 기본창고 아님)
    let itemSql = `
      SELECT
        i.id as item_id, i.item_code, i.item_name, i.category, i.sub_category,
        i.unit, i.base_price,
        inv.storage_zone_id as storage_zone_id,
        sz.zone_name, sz.entity_id as zone_entity_id,
        COALESCE(inv.quantity, 0) as current_stock,
        COALESCE(inv.safe_stock, 0) as safe_stock,
        COALESCE(inv.reorder_point, 0) as reorder_point,
        CASE
          WHEN COALESCE(inv.safe_stock, 0) > 0 AND COALESCE(inv.quantity, 0) <= 0 THEN 'CRITICAL'
          WHEN COALESCE(inv.safe_stock, 0) > 0 AND COALESCE(inv.quantity, 0) <= COALESCE(inv.safe_stock, 0) THEN 'LOW'
          ELSE 'OK'
        END as stock_status
      FROM items i
    `

    // entity_id 조건부 JOIN (다중행: 품목의 모든 창고 재고 행 → 각 행이 실제 창고에 그룹핑)
    if (entityId > 0) {
      itemSql += ` LEFT JOIN inventory inv ON i.id = inv.item_id AND inv.entity_id = ?`
      params.push(entityId)
    } else {
      itemSql += ` LEFT JOIN inventory inv ON i.id = inv.item_id`
    }
    itemSql += ` LEFT JOIN storage_zones sz ON inv.storage_zone_id = sz.id`

    itemSql += ` WHERE i.is_active = 1 AND i.is_purchase_item = 1`

    if (entityId > 0) {
      itemSql += ' AND (sz.entity_id = ? OR inv.storage_zone_id IS NULL)'
      params.push(entityId)
    }
    if (zoneFilter) {
      itemSql += ' AND inv.storage_zone_id = ?'
      params.push(Number(zoneFilter))
    }
    itemSql += ' ORDER BY sz.sort_order, sz.zone_name, i.category, i.item_name'

    const { results: items } = await c.env.DB.prepare(itemSql).bind(...params).all()

    // 3. 요약 통계
    const totalItems = items.length
    const criticalCount = items.filter((i: any) => i.stock_status === 'CRITICAL').length
    const lowCount = items.filter((i: any) => i.stock_status === 'LOW').length
    const totalValue = items.reduce((sum: number, i: any) =>
      sum + ((i.current_stock || 0) * (i.base_price || 0)), 0)

    // 4. 창고별 그룹핑
    const zoneGroups: Record<string, any> = {}
    for (const item of items as any[]) {
      const key = item.storage_zone_id || 'unassigned'
      if (!zoneGroups[key]) {
        zoneGroups[key] = {
          zone_id: item.storage_zone_id,
          zone_name: item.zone_name || '미배정',
          items: [],
          total: 0, critical: 0, low: 0
        }
      }
      zoneGroups[key].items.push(item)
      zoneGroups[key].total++
      if (item.stock_status === 'CRITICAL') zoneGroups[key].critical++
      if (item.stock_status === 'LOW') zoneGroups[key].low++
    }

    return c.json({
      success: true,
      data: {
        zones,
        zone_groups: Object.values(zoneGroups),
        summary: { total_items: totalItems, critical: criticalCount, low: lowCount, total_value: totalValue }
      }
    })
  } catch (error: any) {
    console.error('dashboard/zones error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다' }, 500)
  }
})

// POST /transfer — 창고 간 재고 이동 (0396 다중행: from 창고 차감 + to 창고 가산, 원자 batch)
// 입고=품목 기본창고 고정이므로 창고별 분배의 주 수단.
inventoryRouter.post('/transfer', async (c) => {
  try {
    const body = await c.req.json<{ item_id?: number; from_zone_id?: number | null; to_zone_id?: number | null; quantity?: number; notes?: string }>()
    const itemId = Number(body.item_id)
    const fromZone = body.from_zone_id != null && body.from_zone_id !== ('' as any) ? Number(body.from_zone_id) : null
    const toZone = body.to_zone_id != null && body.to_zone_id !== ('' as any) ? Number(body.to_zone_id) : null
    const qty = Number(body.quantity)
    const entityId = getEntityId(c) || 1
    const userId = c.get('user')?.id || null

    if (!itemId || !qty || qty <= 0) {
      return c.json({ success: false, error: '품목과 양수 수량이 필요합니다' }, 400)
    }
    if ((fromZone ?? 0) === (toZone ?? 0)) {
      return c.json({ success: false, error: '출발 창고와 도착 창고가 같습니다' }, 400)
    }

    // 출발 창고 재고 확인 (entity·zone 키)
    const src = await c.env.DB.prepare(
      `SELECT quantity FROM inventory WHERE item_id = ? AND entity_id = ? AND IFNULL(storage_zone_id,0) = IFNULL(?,0)`
    ).bind(itemId, entityId, fromZone).first<{ quantity: number }>()
    const srcQty = src?.quantity ?? 0
    if (srcQty < qty) {
      return c.json({ success: false, error: `출발 창고 재고 부족 (현재 ${srcQty})` }, 400)
    }

    const dst = await c.env.DB.prepare(
      `SELECT quantity FROM inventory WHERE item_id = ? AND entity_id = ? AND IFNULL(storage_zone_id,0) = IFNULL(?,0)`
    ).bind(itemId, entityId, toZone).first<{ quantity: number }>()
    const srcAfter = srcQty - qty
    const dstAfter = (dst?.quantity ?? 0) + qty

    await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE inventory SET quantity = quantity - ?, last_updated = CURRENT_TIMESTAMP WHERE item_id = ? AND entity_id = ? AND IFNULL(storage_zone_id,0) = IFNULL(?,0)`)
        .bind(qty, itemId, entityId, fromZone),
      c.env.DB.prepare(`INSERT OR IGNORE INTO inventory (item_id, entity_id, storage_zone_id, quantity) VALUES (?, ?, ?, 0)`)
        .bind(itemId, entityId, toZone),
      c.env.DB.prepare(`UPDATE inventory SET quantity = quantity + ?, last_updated = CURRENT_TIMESTAMP WHERE item_id = ? AND entity_id = ? AND IFNULL(storage_zone_id,0) = IFNULL(?,0)`)
        .bind(qty, itemId, entityId, toZone),
      c.env.DB.prepare(`INSERT INTO inventory_transactions (item_id, transaction_type, transaction_date, quantity, balance_after, reference_type, reason, notes, handled_by, entity_id, storage_zone_id) VALUES (?, 'TRANSFER_OUT', datetime('now'), ?, ?, 'TRANSFER', '창고이동', ?, ?, ?, ?)`)
        .bind(itemId, -qty, srcAfter, body.notes || null, userId, entityId, fromZone),
      c.env.DB.prepare(`INSERT INTO inventory_transactions (item_id, transaction_type, transaction_date, quantity, balance_after, reference_type, reason, notes, handled_by, entity_id, storage_zone_id) VALUES (?, 'TRANSFER_IN', datetime('now'), ?, ?, 'TRANSFER', '창고이동', ?, ?, ?, ?)`)
        .bind(itemId, qty, dstAfter, body.notes || null, userId, entityId, toZone),
    ])

    return c.json({ success: true, data: { item_id: itemId, from_zone_id: fromZone, to_zone_id: toZone, quantity: qty, from_balance: srcAfter, to_balance: dstAfter } })
  } catch (error) {
    console.error('inventory transfer error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다' }, 500)
  }
})

export default inventoryRouter
