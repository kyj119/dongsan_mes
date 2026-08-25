import { Hono } from 'hono'
import { authMiddleware, requireRole } from '../middleware/auth'
import type { HonoEnv } from '../types/env'
import { getEntityId, entityFilter, isZoneOwnedByEntity, getWriteEntityId, ENTITY_ALL_MODE_WRITE_ERROR } from '../utils/entityFilter'
import { getNextEntitySeqNumber } from '../utils/sequenceGenerator'
import { kstYmdCompact } from '../utils/kstDate'
import { triggerLowStockAlert } from '../utils/inventoryAlert'
import { getItemDefaultZone, getItemDefaultZones } from '../utils/inventoryZone'
import { resolveStockUnit } from '../utils/rollConsumption'

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
      query += ` AND (i.item_name LIKE ? OR i.category LIKE ? OR i.search_keywords LIKE ?)`
      const searchTerm = `%${search}%`
      params.push(searchTerm, searchTerm, searchTerm)
    }

    if (category) {
      query += ` AND i.category = ?`
      params.push(category)
    }

    query += ` GROUP BY i.id`
    if (low_stock === 'true') {
      query += ` HAVING COALESCE(SUM(inv.quantity), 0) <= COALESCE(MAX(inv.safe_stock), 0) AND COALESCE(MAX(inv.safe_stock), 0) > 0`
    }

    query += ` ORDER BY i.category, i.item_name, i.id LIMIT ? OFFSET ?`  // 정렬 규약: 고유키 tie-break
    params.push(Number(limit), offset)

    const { results } = await c.env.DB.prepare(query).bind(...params).all()

    // Count total (집계/HAVING 후 품목 수 → 서브쿼리로 그룹 개수 카운트)
    let countInner = `
      SELECT i.id,
        COALESCE(SUM(inv.quantity), 0) as qty,
        i.base_price as unit_price
      FROM items i
      ${inv.join}
      WHERE i.is_purchase_item = 1 AND i.is_active = 1
    `
    const countParams: any[] = [...inv.params]

    if (search) {
      countInner += ` AND (i.item_name LIKE ? OR i.category LIKE ? OR i.search_keywords LIKE ?)`
      countParams.push(`%${search}%`, `%${search}%`, `%${search}%`)
    }
    if (category) {
      countInner += ` AND i.category = ?`
      countParams.push(category)
    }
    countInner += ` GROUP BY i.id`
    if (low_stock === 'true') {
      countInner += ` HAVING COALESCE(SUM(inv.quantity), 0) <= COALESCE(MAX(inv.safe_stock), 0) AND COALESCE(MAX(inv.safe_stock), 0) > 0`
    }
    // 건수 + 합계(총수량·재고금액) — GROUP BY/HAVING 결과를 감싸서 집계한다.
    // ⚠️ 합계는 '조회조건 전체' 기준이며 현재 페이지 합이 아니다.
    const countQuery = `SELECT COUNT(*) as total,
        COALESCE(SUM(g.qty), 0) as sum_qty,
        COALESCE(SUM(g.qty * COALESCE(g.unit_price, 0)), 0) as sum_value
      FROM (${countInner}) g`

    const countRow = await c.env.DB.prepare(countQuery).bind(...countParams).first<{ total: number; sum_qty: number; sum_value: number }>()
    const total = countRow?.total || 0

    return c.json({
      success: true,
      data: {
        items: results,
        pagination: { page: Number(page), limit: Number(limit), total, total_pages: Math.ceil(total / Number(limit)) },
        summary: { count: total, quantity: Number(countRow?.sum_qty) || 0, value: Number(countRow?.sum_value) || 0 }
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
    // JOIN에 sz.entity_id = inv.entity_id 가드 — 어긋난 행(타법인 zone)은 창고명 대신 '(타법인 창고)' 표기 (2026-07-06 감사 #4)
    const zonesParams: any[] = [id]
    let zonesSql = `
      SELECT inv.storage_zone_id,
             COALESCE(sz.zone_name, CASE WHEN inv.storage_zone_id IS NULL THEN '미배정' ELSE '(타법인 창고)' END) as zone_name,
             inv.quantity,
             COALESCE(inv.safe_stock, 0) as safe_stock
      FROM inventory inv
      LEFT JOIN storage_zones sz ON inv.storage_zone_id = sz.id AND sz.entity_id = inv.entity_id
      WHERE inv.item_id = ?
    `
    if (entityId > 0) {
      zonesSql += ` AND inv.entity_id = ?`
      zonesParams.push(entityId)
    }
    zonesSql += ` ORDER BY inv.storage_zone_id IS NULL, sz.sort_order, sz.zone_name, inv.id`
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
    // 전체모드(0) 재고 쓰기 차단 — 조용한 동산(1) 귀속 방지 (2026-07-06 감사 #5)
    const entityId = getWriteEntityId(c)
    if (entityId == null) {
      return c.json({ success: false, error: ENTITY_ALL_MODE_WRITE_ERROR }, 400)
    }

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
    // 법인 인식 리맵 필수 — raw items.storage_zone_id는 타법인 zone 어긋난 행 생성 (2026-07-06 감사 #3)
    const zoneId = await getItemDefaultZone(c.env.DB, Number(id), entityId)

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

    // 전체모드(0) 재고 쓰기 차단 — 조용한 동산(1) 귀속 방지 (2026-07-06 감사 #5)
    const entityId = getWriteEntityId(c)
    if (entityId == null) {
      return c.json({ success: false, error: ENTITY_ALL_MODE_WRITE_ERROR }, 400)
    }

    // Generate receipt number (#329: 법인코드 E{eid} 내장 + MAX 기반 — 글로벌 COUNT 멀티법인 충돌 방지)
    const today = kstYmdCompact()
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
    const zoneMap = await getItemDefaultZones(c.env.DB, itemIds, entityId)
    // MU3: 다단위 — 입고 수량(관리단위) → base_unit 환산용 pack_size. 단일단위(NULL→1)=불변.
    // MU5: 입고 단위 스냅샷용 unit도 함께 조회.
    const packMap = new Map<number, number>()
    const unitMap = new Map<number, string>()
    {
      const { results: psRows } = await c.env.DB.prepare(
        `SELECT id, pack_size, unit FROM items WHERE id IN (${itemIds.map(() => '?').join(',')})`
      ).bind(...itemIds).all<{ id: number; pack_size: number | null; unit: string | null }>()
      for (const r of psRows || []) {
        packMap.set(Number(r.id), (r.pack_size && r.pack_size > 0) ? r.pack_size : 1)
        unitMap.set(Number(r.id), r.unit || 'EA')
      }
    }
    const ps = (id: number) => packMap.get(id) || 1

    const receiptStmts: any[] = []
    for (const item of items) {
      const { item_id, quantity, unit_price, location } = item
      const amount = quantity * unit_price
      const zoneId = zoneMap.get(item_id) ?? null

      receiptStmts.push(
        c.env.DB.prepare(`
          INSERT INTO inventory_receipt_items (receipt_id, item_id, quantity, unit_price, amount, location, unit,
                                               received_quantity, accepted_quantity, rejected_quantity)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        `).bind(receiptId, item_id, quantity, unit_price, amount, location || null, unitMap.get(item_id) || 'EA',  // MU5: 입고 단위 스냅샷(관리단위)
          quantity, quantity),  // 검수 없는 직접입고 = 전량 합격. 취소 역분개가 accepted_quantity 기준이라 필수
        c.env.DB.prepare(`
          INSERT OR IGNORE INTO inventory (item_id, quantity, entity_id, storage_zone_id, last_updated)
          VALUES (?, 0, ?, ?, CURRENT_TIMESTAMP)
        `).bind(item_id, entityId, zoneId),
        c.env.DB.prepare(`
          UPDATE inventory SET quantity = quantity + ?, last_updated = CURRENT_TIMESTAMP
          WHERE item_id = ? AND entity_id = ? AND IFNULL(storage_zone_id, 0) = IFNULL(?, 0)
        `).bind(quantity * ps(item_id), item_id, entityId, zoneId)  // MU3: base 환산 누적
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
          // MU3: 거래는 base 단위 — quantity=base(×pack), unit_price=base당(÷pack), total_amount=amount(불변·일관)
          item.item_id, receipt_date, item.quantity * ps(item.item_id), item.unit_price / ps(item.item_id), amount,
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
       ORDER BY r.created_at DESC, r.id DESC LIMIT 100`
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
    const decisionLog = '[' + new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' 결정] ' + decision + (notes ? ': ' + notes : '')

    // 전체모드(0) 재고 쓰기 차단 (2026-07-06 감사 #5)
    const cancelEntityId = getWriteEntityId(c)
    if (cancelEntityId == null) {
      return c.json({ success: false, error: ENTITY_ALL_MODE_WRITE_ERROR }, 400)
    }
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
        `SELECT item_id, quantity, received_quantity, accepted_quantity, rejected_quantity, po_item_id
           FROM inventory_receipt_items WHERE receipt_id = ?`
      ).bind(id).all()

      // 재고 역분개는 '합격분(accepted_quantity)'만 차감 — 정방향(po-receive)이 합격분만 입고했기 때문.
      //   received_quantity로 빼면 거부분까지 과차감되어 정상재고가 훼손됨(#373 동반수정).
      // ⚠️ 검수 없는 직접입고(POST /receipts)는 accepted_quantity 를 안 넣던 시절이 있어 NULL 이 남아 있다.
      //    그 상태로 필터하면 역분개 대상에서 통째로 빠져 **취소해도 재고가 그대로 남는다** → quantity 폴백.
      //    (신규 입고는 accepted_quantity=quantity 로 채워 넣는다)
      const accOf = (ri: any) => Number(ri.accepted_quantity ?? ri.quantity ?? 0)
      const invItems = (receiptItems || []).filter((ri) => ri.item_id && accOf(ri) > 0)

      // 역분개 대상 창고 = 품목 기본창고(정방향 입고가 거기 누적했으므로). NULL=미배정.
      const cancelZoneMap = await getItemDefaultZones(c.env.DB, invItems.map((ri) => ri.item_id as number), cancelEntityId)
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
      // MU3 대칭: 정방향 입고가 `관리단위 × pack_size` 로 base(미터) 를 쌓았으므로
      //   역분개도 같은 환산으로 빼야 한다. 환산 없이 관리단위를 그대로 빼면 롤당 길이만큼
      //   재고가 남는다(50m 롤 3개 입고=+150 → 취소 -3 → 147 잔존).
      //   pack_size 가 전부 NULL 이던 동안은 ×1 이라 드러나지 않던 비대칭이다.
      const cancelPackMap = new Map<number, number>()
      if (invItems.length > 0) {
        const cIds = invItems.map((ri) => ri.item_id as number)
        const { results: cpsRows } = await c.env.DB.prepare(
          `SELECT id, pack_size FROM items WHERE id IN (${cIds.map(() => '?').join(',')})`
        ).bind(...cIds).all<{ id: number; pack_size: number | null }>()
        for (const r of cpsRows || []) {
          cancelPackMap.set(Number(r.id), (r.pack_size && r.pack_size > 0) ? r.pack_size : 1)
        }
      }
      const cps = (id: number) => cancelPackMap.get(id) || 1

      const ops: D1PreparedStatement[] = []
      for (const ri of invItems) {
        const accBase = accOf(ri) * cps(ri.item_id as number)
        const zoneId = cancelZoneMap.get(ri.item_id as number) ?? null
        const before = cancelBalMap[`${ri.item_id}:${zoneId ?? 0}`] || 0
        const after = Math.max(0, before - accBase)
        ops.push(
          c.env.DB.prepare(`UPDATE inventory SET quantity = MAX(0, quantity - ?), last_updated = CURRENT_TIMESTAMP WHERE item_id = ? AND entity_id = ? AND IFNULL(storage_zone_id, 0) = IFNULL(?, 0)`)
            .bind(accBase, ri.item_id, cancelEntityId, zoneId)
        )
        ops.push(
          c.env.DB.prepare(
            `INSERT INTO inventory_transactions (item_id, transaction_type, quantity, balance_after, reference_type, reference_id, notes, handled_by, transaction_date, entity_id, storage_zone_id)
             VALUES (?, 'OUT', ?, ?, 'RECEIPT_CANCEL', ?, ?, ?, datetime('now'), ?, ?)`
          ).bind(
            ri.item_id, accBase, after,
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

    // 전체모드(0) 재고 쓰기 차단 — 조용한 동산(1) 귀속 방지 (2026-07-06 감사 #5)
    const entityId = getWriteEntityId(c)
    if (entityId == null) {
      return c.json({ success: false, error: ENTITY_ALL_MODE_WRITE_ERROR }, 400)
    }

    const today = kstYmdCompact()
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
    const relZoneMap = await getItemDefaultZones(c.env.DB, releaseItemIds, entityId)
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
          SELECT i.id as item_id, i.item_name, i.unit, i.base_unit, i.pack_size,
                 COALESCE(SUM(inv.quantity), 0) as current_stock,
                 COALESCE(MAX(inv.safe_stock), 0) as safe_stock
          FROM items i LEFT JOIN inventory inv ON i.id = inv.item_id AND inv.entity_id = ?
          WHERE i.id IN (${lowPh})
          GROUP BY i.id
        `).bind(entityId, ...lowItemIds).all()
        await triggerLowStockAlert(c.env.DB, (lowDetails || []).map((d: any) => ({
          item_id: d.item_id, item_name: d.item_name, current_stock: d.current_stock,
          // #462/0496 대칭: current_stock/safe_stock 은 base_unit 저장값 — 표시 라벨도
          // 입고단위(i.unit, 예 '롤')가 아니라 재고단위(resolveStockUnit)를 써야 짝이 맞는다
          // (inventoryCount.ts 실사 스냅샷 수정과 동일 패턴).
          safe_stock: d.safe_stock, unit: resolveStockUnit(d) || 'EA',
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

    // 전체모드(0) 재고 쓰기 차단 — 조용한 동산(1) 귀속 방지 (2026-07-06 감사 #5)
    const entityId = getWriteEntityId(c)
    if (entityId == null) {
      return c.json({ success: false, error: ENTITY_ALL_MODE_WRITE_ERROR }, 400)
    }
    const adjQty = Number(adjustment_quantity)
    // 조정 대상 창고 = 품목 기본창고 (NULL=미배정)
    const zoneId = await getItemDefaultZone(c.env.DB, item_id, entityId)

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
//
// 페이로드 주의 (2026-08-25): 전체 응답 286KB 중 **257KB 가 「미배정」 980품목**이었고
//   화면은 그걸 전부 표 행으로 그렸다(1,092행). 구역별 items 를 기본 50건으로 자르고
//   나머지는 `?group_items=` 로 이어 받는다(bank 거래내역과 같은 「더 보기 누적」).
//   ★요약·구역별 건수는 **전건 기준 그대로** 낸다 — 자른 건 표시분뿐이다.
const ZONE_ITEM_PAGE = 50
const ZONE_ITEM_MAX = 500

inventoryRouter.get('/dashboard/zones', async (c) => {
  try {
    const entityId = getEntityId(c)
    const zoneFilter = c.req.query('zone_id')
    const params: any[] = []

    // 「더 보기」·발주요청용 부분 조회 — zone_id(또는 'unassigned') 하나의 품목만 돌려준다.
    //   shortage_only=1 = 부족/긴급만. ★발주요청은 표시분이 아니라 **이 경로로 전건**을 받아야 한다
    //   (표가 잘린 상태에서 group.items 를 걸러 만들면 부족 품목이 조용히 빠진다).
    const groupItems = c.req.query('group_items')

    // 1. 창고 목록 (법인 필터)
    // manager_id/manager_name: 실사 생성 화면이 「내 담당 구역」을 가리려면 여기서 나가야 한다
    //   (2026-08-25 — 담당자는 storage_zones 에 지정돼 있는데 이 API 가 안 내보내 화면이 못 썼다)
    let zoneSql = `
      SELECT sz.id, sz.zone_name, sz.zone_code, sz.is_default, sz.entity_id,
        sz.manager_id, u.name AS manager_name,
        e.short_name as entity_name
      FROM storage_zones sz
      LEFT JOIN entities e ON sz.entity_id = e.id
      LEFT JOIN users u ON u.id = sz.manager_id
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
    // 부분 조회: 한 구역만 (미배정 = storage_zone_id IS NULL — zone_id 로는 표현이 안 된다)
    if (groupItems) {
      if (groupItems === 'unassigned') {
        itemSql += ' AND inv.storage_zone_id IS NULL'
      } else {
        // 숫자가 아니면 Number()가 NaN 이 되고 바인드 의미가 드라이버에 맡겨진다 → 여기서 끊는다
        const gid = Number(groupItems)
        if (!Number.isInteger(gid) || gid <= 0) {
          return c.json({ success: false, error: 'group_items 는 구역 id 또는 unassigned 여야 합니다' }, 400)
        }
        itemSql += ' AND inv.storage_zone_id = ?'
        params.push(gid)
      }
      // 부족/긴급 = stock_status 의 CASE 와 같은 조건(별칭은 WHERE 에서 못 쓴다)
      if (c.req.query('shortage_only') === '1') {
        itemSql += ' AND COALESCE(inv.safe_stock, 0) > 0 AND COALESCE(inv.quantity, 0) <= COALESCE(inv.safe_stock, 0)'
      }
    }
    // ★고유키 tie-break 필수 — LIMIT/OFFSET 페이징에서 동값 구간이 페이지 간 중복·누락을 낸다
    //   (CLAUDE.md §목록 정렬. 종전엔 item_name 까지라 동명이품이 있으면 순서가 미정의였다)
    const itemOrderBy = ' ORDER BY sz.sort_order, sz.zone_name, i.category, i.item_name, i.id'

    // 부분 조회는 여기서 끝 — 요약·구역목록은 만들지 않는다
    if (groupItems) {
      const limRaw = parseInt(c.req.query('limit') || '', 10)
      const lim = Number.isFinite(limRaw) ? Math.min(Math.max(limRaw, 1), ZONE_ITEM_MAX) : ZONE_ITEM_PAGE
      const offRaw = parseInt(c.req.query('offset') || '', 10)
      const off = Number.isFinite(offRaw) && offRaw > 0 ? offRaw : 0
      const { results: rows } = await c.env.DB.prepare(`${itemSql}${itemOrderBy} LIMIT ${lim} OFFSET ${off}`).bind(...params).all()
      // 카운트는 ORDER BY 없이 (정렬은 건수에 영향 없다)
      const cnt = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM (${itemSql}) t`).bind(...params).first<{ n: number }>()
      return c.json({ success: true, data: { items: rows, total: Number(cnt?.n) || 0, limit: lim, offset: off } })
    }

    itemSql += itemOrderBy
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
      // ★items 는 표시분만 담고 total·critical·low 는 전건을 센다 — 요약 숫자는 잘리면 안 된다
      if (zoneGroups[key].items.length < ZONE_ITEM_PAGE) zoneGroups[key].items.push(item)
      zoneGroups[key].total++
      if (item.stock_status === 'CRITICAL') zoneGroups[key].critical++
      if (item.stock_status === 'LOW') zoneGroups[key].low++
    }

    return c.json({
      success: true,
      data: {
        zones,
        zone_groups: Object.values(zoneGroups),
        summary: { total_items: totalItems, critical: criticalCount, low: lowCount, total_value: totalValue },
        item_page: ZONE_ITEM_PAGE   // 클라가 「더 보기」 증분을 서버와 맞추도록
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
    // 전체모드(0) 재고 쓰기 차단 — 조용한 동산(1) 귀속 방지 (2026-07-06 감사 #5)
    const entityId = getWriteEntityId(c)
    if (entityId == null) {
      return c.json({ success: false, error: ENTITY_ALL_MODE_WRITE_ERROR }, 400)
    }
    const userId = c.get('user')?.id || null

    if (!itemId || !qty || qty <= 0) {
      return c.json({ success: false, error: '품목과 양수 수량이 필요합니다' }, 400)
    }
    if ((fromZone ?? 0) === (toZone ?? 0)) {
      return c.json({ success: false, error: '출발 창고와 도착 창고가 같습니다' }, 400)
    }
    // #461 형제: 도착 창고 법인 소유 검증 — 타법인 zone으로 이동 시 entity≠zone소유 유령 행 생성 차단 (2026-07-06 감사 #2)
    //   출발 창고는 미검증 의도: 행 자체가 entity 키잉이라 자법인 재고만 차감되고, 어긋난 기존 행의 복구(빼내기) 경로를 열어둠.
    if (toZone != null && !(await isZoneOwnedByEntity(c, toZone))) {
      return c.json({ success: false, error: '유효하지 않은 도착 창고입니다' }, 400)
    }

    // #459: 출발 창고 원자 차감(TOCTOU 방지) — 부족/동시이동이면 changes=0.
    //   기존 SELECT후 batch UPDATE 분리 = 더블클릭 시 둘 다 통과 → 2×차감·음수재고. atomic WHERE quantity>=? 로 차단.
    const srcUpd = await c.env.DB.prepare(
      `UPDATE inventory SET quantity = quantity - ?, last_updated = CURRENT_TIMESTAMP
       WHERE item_id = ? AND entity_id = ? AND IFNULL(storage_zone_id,0) = IFNULL(?,0) AND quantity >= ?`
    ).bind(qty, itemId, entityId, fromZone, qty).run()
    if (!srcUpd.meta.changes) {
      return c.json({ success: false, error: '출발 창고 재고 부족 (또는 동시 이동 중)' }, 400)
    }

    // 도착 창고 증가 (행 부재 시 0 생성 후 누적)
    await c.env.DB.batch([
      c.env.DB.prepare(`INSERT OR IGNORE INTO inventory (item_id, entity_id, storage_zone_id, quantity) VALUES (?, ?, ?, 0)`)
        .bind(itemId, entityId, toZone),
      c.env.DB.prepare(`UPDATE inventory SET quantity = quantity + ?, last_updated = CURRENT_TIMESTAMP WHERE item_id = ? AND entity_id = ? AND IFNULL(storage_zone_id,0) = IFNULL(?,0)`)
        .bind(qty, itemId, entityId, toZone),
    ])

    // 실제 잔량(원자 차감/증가 반영 후) — balance_after 정확값
    const srcRow = await c.env.DB.prepare(`SELECT quantity FROM inventory WHERE item_id = ? AND entity_id = ? AND IFNULL(storage_zone_id,0) = IFNULL(?,0)`).bind(itemId, entityId, fromZone).first<{ quantity: number }>()
    const dstRow = await c.env.DB.prepare(`SELECT quantity FROM inventory WHERE item_id = ? AND entity_id = ? AND IFNULL(storage_zone_id,0) = IFNULL(?,0)`).bind(itemId, entityId, toZone).first<{ quantity: number }>()
    const srcAfter = srcRow?.quantity ?? 0
    const dstAfter = dstRow?.quantity ?? 0

    await c.env.DB.batch([
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

// 기본창고 일괄 배정 (운영설계 B) — 필터(카테고리/이름/품목)로 items.storage_zone_id 설정.
//   품목은 법인 공유라 storage_zone_id는 전역 1값. 법인별 안착은 getItemDefaultZone(법인 인식)이 처리.
//   move_stock: 배정과 함께 현재 법인의 미배정(NULL zone) 재고를 대상 창고로 이동 (TRANSFER 이력 기록)
//   dry_run: 변경 없이 대상 품목 수·이동될 미배정 재고 건수만 반환 (미리보기)
inventoryRouter.post('/bulk-assign-zones', async (c) => {
  try {
    const user = c.get('user')
    if (!user || !['ADMIN', 'MANAGER'].includes(user.role)) {
      return c.json({ success: false, error: '권한이 없습니다 (관리자 전용)' }, 403)
    }
    const body = await c.req.json<{ zone_id?: number | null; category?: string; name_like?: string; item_ids?: number[]; only_unassigned?: boolean; move_stock?: boolean; dry_run?: boolean }>()
    const zoneId = body.zone_id != null && body.zone_id !== ('' as any) ? Number(body.zone_id) : null

    // 대상 창고 유효성 (null=미배정 환원 허용) — #461: 법인 소유 검증(타법인 zone 차단, #368 도메인 일관)
    if (zoneId != null && !(await isZoneOwnedByEntity(c, zoneId))) {
      return c.json({ success: false, error: '유효하지 않은 창고입니다' }, 400)
    }

    // 대상 필터 — 매입/재고 품목만(제품 제외). 필터 최소 1개 필수(전체 일괄 방지).
    const conds: string[] = ['COALESCE(is_purchase_item, 0) = 1']
    const binds: any[] = []
    let hasFilter = false
    if (body.item_ids && body.item_ids.length > 0) {
      if (body.item_ids.length > 90) return c.json({ success: false, error: '한 번에 90개 이하 (필터를 사용하세요)' }, 400)
      conds.push(`id IN (${body.item_ids.map(() => '?').join(',')})`)
      binds.push(...body.item_ids.map(Number)); hasFilter = true
    }
    if (body.category) { conds.push('category = ?'); binds.push(body.category); hasFilter = true }
    if (body.name_like) { conds.push('item_name LIKE ?'); binds.push(body.name_like); hasFilter = true }
    if (body.only_unassigned) { conds.push('storage_zone_id IS NULL') }
    if (!hasFilter) return c.json({ success: false, error: '필터(카테고리/이름/품목)를 1개 이상 지정하세요' }, 400)

    // 전체모드(0) 재고 쓰기 차단 — 조용한 동산(1) 귀속 방지 (2026-07-06 감사 #5)
    const entityId = getWriteEntityId(c)
    if (entityId == null) {
      return c.json({ success: false, error: ENTITY_ALL_MODE_WRITE_ERROR }, 400)
    }
    const moveStock = !!body.move_stock && zoneId != null

    // 이동 대상 사전 조회 = 현재 법인 미배정(NULL zone)·양수 재고 행 (dry_run 미리보기 + moved_qty 보고 공용)
    let itemIds: number[] = []
    let movable: Array<{ item_id: number; quantity: number }> = []
    if (moveStock || body.dry_run) {
      const idRows = await c.env.DB.prepare(`SELECT id FROM items WHERE ${conds.join(' AND ')}`).bind(...binds).all<{ id: number }>()
      itemIds = (idRows.results || []).map(r => Number(r.id))
      if (zoneId != null) {
        // D1 바인드 한도(~100) → 80개 청크
        for (let i = 0; i < itemIds.length; i += 80) {
          const chunk = itemIds.slice(i, i + 80)
          const ph = chunk.map(() => '?').join(',')
          const { results } = await c.env.DB.prepare(
            `SELECT item_id, quantity FROM inventory WHERE entity_id = ? AND storage_zone_id IS NULL AND quantity > 0 AND item_id IN (${ph})`
          ).bind(entityId, ...chunk).all<{ item_id: number; quantity: number }>()
          movable.push(...(results || []))
        }
      }
    }

    if (body.dry_run) {
      return c.json({
        success: true,
        data: {
          dry_run: true,
          matched_items: itemIds.length,
          movable_rows: movable.length,
          movable_qty: movable.reduce((s, m) => s + (Number(m.quantity) || 0), 0),
          zone_id: zoneId,
        },
      })
    }

    const upd = await c.env.DB.prepare(
      `UPDATE items SET storage_zone_id = ? WHERE ${conds.join(' AND ')}`
    ).bind(zoneId, ...binds).run()

    // 미배정 재고 이동 — 청크당 단일 batch(=SQLite 트랜잭션)로 set 기반 처리.
    //   순서 중요: ①도착행 생성 → ②/③이력(원본 수량이 0되기 전 기록) → ④도착 가산 → ⑤원본 0.
    let movedRows = 0
    const movedQty = movable.reduce((s, m) => s + (Number(m.quantity) || 0), 0)
    if (moveStock && movable.length > 0) {
      const moveIds = movable.map(m => m.item_id)
      for (let i = 0; i < moveIds.length; i += 80) {
        const chunk = moveIds.slice(i, i + 80)
        const ph = chunk.map(() => '?').join(',')
        const res = await c.env.DB.batch([
          c.env.DB.prepare(
            `INSERT OR IGNORE INTO inventory (item_id, entity_id, storage_zone_id, quantity, last_updated)
             SELECT src.item_id, src.entity_id, ?, 0, CURRENT_TIMESTAMP
             FROM inventory src WHERE src.entity_id = ? AND src.storage_zone_id IS NULL AND src.quantity > 0 AND src.item_id IN (${ph})`
          ).bind(zoneId, entityId, ...chunk),
          c.env.DB.prepare(
            `INSERT INTO inventory_transactions (item_id, transaction_type, transaction_date, quantity, balance_after, reference_type, reason, handled_by, entity_id, storage_zone_id)
             SELECT src.item_id, 'TRANSFER_OUT', datetime('now'), -src.quantity, 0, 'TRANSFER', '기본창고 일괄배정 이동', ?, src.entity_id, NULL
             FROM inventory src WHERE src.entity_id = ? AND src.storage_zone_id IS NULL AND src.quantity > 0 AND src.item_id IN (${ph})`
          ).bind(user.id, entityId, ...chunk),
          c.env.DB.prepare(
            `INSERT INTO inventory_transactions (item_id, transaction_type, transaction_date, quantity, balance_after, reference_type, reason, handled_by, entity_id, storage_zone_id)
             SELECT src.item_id, 'TRANSFER_IN', datetime('now'), src.quantity,
                    src.quantity + IFNULL((SELECT dst.quantity FROM inventory dst WHERE dst.item_id = src.item_id AND dst.entity_id = src.entity_id AND dst.storage_zone_id = ?), 0),
                    'TRANSFER', '기본창고 일괄배정 이동', ?, src.entity_id, ?
             FROM inventory src WHERE src.entity_id = ? AND src.storage_zone_id IS NULL AND src.quantity > 0 AND src.item_id IN (${ph})`
          ).bind(zoneId, user.id, zoneId, entityId, ...chunk),
          c.env.DB.prepare(
            `UPDATE inventory SET quantity = quantity + (SELECT src.quantity FROM inventory src WHERE src.item_id = inventory.item_id AND src.entity_id = inventory.entity_id AND src.storage_zone_id IS NULL),
                    last_updated = CURRENT_TIMESTAMP
             WHERE entity_id = ? AND storage_zone_id = ? AND item_id IN (${ph})
               AND EXISTS (SELECT 1 FROM inventory src WHERE src.item_id = inventory.item_id AND src.entity_id = inventory.entity_id AND src.storage_zone_id IS NULL AND src.quantity > 0)`
          ).bind(entityId, zoneId, ...chunk),
          c.env.DB.prepare(
            `UPDATE inventory SET quantity = 0, last_updated = CURRENT_TIMESTAMP
             WHERE entity_id = ? AND storage_zone_id IS NULL AND quantity > 0 AND item_id IN (${ph})`
          ).bind(entityId, ...chunk),
        ])
        movedRows += res[4]?.meta?.changes || 0
      }
    }

    return c.json({ success: true, data: { assigned: upd.meta.changes || 0, zone_id: zoneId, moved_rows: movedRows, moved_qty: moveStock ? movedQty : 0 } })
  } catch (e) {
    console.error('bulk-assign-zones error:', e)
    return c.json({ success: false, error: '서버 오류가 발생했습니다' }, 500)
  }
})

export default inventoryRouter
