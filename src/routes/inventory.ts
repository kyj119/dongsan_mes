import { Hono } from 'hono'
import { authMiddleware, requireRole } from '../middleware/auth'
import type { HonoEnv } from '../types/env'
import { getEntityId } from '../utils/entityFilter'

const inventoryRouter = new Hono<HonoEnv>()

// Apply authentication middleware to all routes
inventoryRouter.use('/*', authMiddleware)

// Get inventory items list with filters
// Source of truth: items (master) + inventory (stock)
inventoryRouter.get('/', async (c) => {
  try {
    const { page = '1', limit = '50', category, search, low_stock } = c.req.query()
    const offset = (parseInt(page) - 1) * parseInt(limit)

    let query = `
      SELECT
        i.id,
        i.item_name,
        i.category,
        i.sub_category,
        i.unit,
        i.base_price as unit_price,
        COALESCE(inv.quantity, 0) as current_stock,
        COALESCE(inv.safe_stock, 0) as safety_stock,
        COALESCE(inv.reorder_point, 0) as reorder_point,
        COALESCE(inv.auto_pr_enabled, 0) as auto_pr_enabled,
        COALESCE(inv.location, '-') as location,
        i.description,
        i.is_active,
        i.created_at,
        i.updated_at
      FROM items i
      LEFT JOIN inventory inv ON i.id = inv.item_id
      WHERE i.is_purchase_item = 1 AND i.is_active = 1
    `
    const params: any[] = []

    if (search) {
      query += ` AND (i.item_name LIKE ? OR i.category LIKE ?)`
      const searchTerm = `%${search}%`
      params.push(searchTerm, searchTerm)
    }

    if (category) {
      query += ` AND i.category = ?`
      params.push(category)
    }

    if (low_stock === 'true') {
      query += ` AND COALESCE(inv.quantity, 0) <= COALESCE(inv.safe_stock, 0) AND COALESCE(inv.safe_stock, 0) > 0`
    }

    query += ` ORDER BY i.category, i.item_name LIMIT ? OFFSET ?`
    params.push(parseInt(limit), offset)

    const { results } = await c.env.DB.prepare(query).bind(...params).all()

    // Count total
    let countQuery = `
      SELECT COUNT(*) as total
      FROM items i
      LEFT JOIN inventory inv ON i.id = inv.item_id
      WHERE i.is_purchase_item = 1 AND i.is_active = 1
    `
    const countParams: any[] = []

    if (search) {
      countQuery += ` AND (i.item_name LIKE ? OR i.category LIKE ?)`
      const searchTerm = `%${search}%`
      countParams.push(searchTerm, searchTerm)
    }

    if (category) {
      countQuery += ` AND i.category = ?`
      countParams.push(category)
    }

    if (low_stock === 'true') {
      countQuery += ` AND COALESCE(inv.quantity, 0) <= COALESCE(inv.safe_stock, 0) AND COALESCE(inv.safe_stock, 0) > 0`
    }

    const { results: countResults } = await c.env.DB.prepare(countQuery).bind(...countParams).all()
    const total = (countResults[0] as any).total

    return c.json({
      success: true,
      data: {
        items: results,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          total_pages: Math.ceil(total / parseInt(limit))
        }
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
    const result = await c.env.DB.prepare(`
      SELECT
        i.id, i.item_name, i.category, i.sub_category, i.unit,
        i.base_price as unit_price,
        COALESCE(inv.quantity, 0) as current_stock,
        COALESCE(inv.safe_stock, 0) as safety_stock,
        COALESCE(inv.reorder_point, 0) as reorder_point,
        COALESCE(inv.auto_pr_enabled, 0) as auto_pr_enabled,
        COALESCE(inv.location, '-') as location,
        i.description, i.is_active
      FROM items i
      LEFT JOIN inventory inv ON i.id = inv.item_id
      WHERE i.id = ? AND i.is_purchase_item = 1
    `).bind(id).first()

    if (!result) {
      return c.json({ success: false, error: 'Item not found' }, 404)
    }

    return c.json({ success: true, data: result })
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

    const { results } = await c.env.DB.prepare(`
      SELECT
        t.*,
        u.name as handled_by_name
      FROM inventory_transactions t
      LEFT JOIN users u ON t.handled_by = u.id
      WHERE t.item_id = ?
      ORDER BY t.transaction_date DESC, t.id DESC
      LIMIT ?
    `).bind(id, parseInt(limit)).all()

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
      GROUP BY i.category
      ORDER BY i.category
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
    const { results } = await c.env.DB.prepare(`
      SELECT
        i.id, i.item_name, i.category, i.unit,
        COALESCE(inv.quantity, 0) as current_stock,
        COALESCE(inv.safe_stock, 0) as safety_stock,
        COALESCE(inv.reorder_point, 0) as reorder_point,
        (COALESCE(inv.safe_stock, 0) - COALESCE(inv.quantity, 0)) as shortage
      FROM items i
      LEFT JOIN inventory inv ON i.id = inv.item_id
      WHERE i.is_purchase_item = 1 AND i.is_active = 1
        AND COALESCE(inv.quantity, 0) <= COALESCE(inv.safe_stock, 0)
        AND COALESCE(inv.safe_stock, 0) > 0
      ORDER BY (COALESCE(inv.safe_stock, 0) - COALESCE(inv.quantity, 0)) DESC
    `).all()

    return c.json({
      success: true,
      data: {
        items: results,
        count: results.length
      }
    })
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

    // Validate item exists
    const item = await c.env.DB.prepare(
      `SELECT id FROM items WHERE id = ? AND is_purchase_item = 1`
    ).bind(id).first()

    if (!item) {
      return c.json({ success: false, error: 'Item not found' }, 404)
    }

    const safeStock = parseFloat(safe_stock) || 0
    const rop = parseFloat(reorder_point) || 0
    const autoPr = auto_pr_enabled ? 1 : 0

    // Upsert inventory row
    const existing = await c.env.DB.prepare(
      `SELECT id FROM inventory WHERE item_id = ?`
    ).bind(id).first()

    if (existing) {
      await c.env.DB.prepare(`
        UPDATE inventory
        SET safe_stock = ?, reorder_point = ?, auto_pr_enabled = ?, last_updated = CURRENT_TIMESTAMP
        WHERE item_id = ?
      `).bind(safeStock, rop, autoPr, id).run()
    } else {
      await c.env.DB.prepare(`
        INSERT INTO inventory (item_id, quantity, safe_stock, reorder_point, auto_pr_enabled, last_updated)
        VALUES (?, 0, ?, ?, ?, CURRENT_TIMESTAMP)
      `).bind(id, safeStock, rop, autoPr).run()
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
// Uses inventory table (items.id linked)
inventoryRouter.post('/receipts', async (c) => {
  try {
    const user = c.get('user')
    const data = await c.req.json()

    const { supplier, receipt_date, items, notes } = data

    if (!supplier || !receipt_date || !items || items.length === 0) {
      return c.json({
        success: false,
        message: 'Supplier, receipt_date, and items are required'
      }, 400)
    }

    // Generate receipt number
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '')
    const { results: countResults } = await c.env.DB.prepare(`
      SELECT COUNT(*) as count FROM inventory_receipts
      WHERE receipt_number LIKE ?
    `).bind(`RCV-${today}%`).all()

    const sequence = ((countResults[0] as any).count + 1).toString().padStart(3, '0')
    const receiptNumber = `RCV-${today}-${sequence}`

    // Calculate total amount
    const totalAmount = items.reduce((sum: number, item: any) =>
      sum + (item.quantity * item.unit_price), 0
    )

    // Insert receipt header
    const receiptResult = await c.env.DB.prepare(`
      INSERT INTO inventory_receipts
      (receipt_number, receipt_date, supplier, total_amount, status, received_by, notes)
      VALUES (?, ?, ?, ?, 'COMPLETED', ?, ?)
    `).bind(receiptNumber, receipt_date, supplier, totalAmount, user?.id || 1, notes || null).run()

    const receiptId = receiptResult.meta.last_row_id

    // Insert receipt items + update inventory (batch)
    const entityId = getEntityId(c) || 1
    const receiptStmts = items.flatMap((item: any) => {
      const { item_id, quantity, unit_price, location } = item
      const amount = quantity * unit_price
      return [
        c.env.DB.prepare(`
          INSERT INTO inventory_receipt_items
          (receipt_id, item_id, quantity, unit_price, amount, location)
          VALUES (?, ?, ?, ?, ?, ?)
        `).bind(receiptId, item_id, quantity, unit_price, amount, location || null),
        c.env.DB.prepare(`
          INSERT INTO inventory (item_id, quantity, last_updated)
          VALUES (?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(item_id) DO UPDATE SET quantity = quantity + excluded.quantity, last_updated = CURRENT_TIMESTAMP
        `).bind(item_id, quantity)
      ]
    })
    await c.env.DB.batch(receiptStmts)

    // Get updated balances + insert transactions (batch)
    const itemIds = items.map((item: any) => item.item_id)
    const ph = itemIds.map(() => '?').join(',')
    const { results: balances } = await c.env.DB.prepare(
      `SELECT item_id, quantity FROM inventory WHERE item_id IN (${ph})`
    ).bind(...itemIds).all()
    const balanceMap: Record<number, number> = {}
    for (const b of balances as any[]) balanceMap[b.item_id] = b.quantity

    await c.env.DB.batch(
      items.map((item: any) => {
        const amount = item.quantity * item.unit_price
        return c.env.DB.prepare(`
          INSERT INTO inventory_transactions
          (item_id, transaction_type, transaction_date, quantity, unit_price, total_amount,
           reference_type, reference_id, balance_after, reason, handled_by, entity_id)
          VALUES (?, 'IN', ?, ?, ?, ?, 'PURCHASE', ?, ?, '입고', ?, ?)
        `).bind(
          item.item_id, receipt_date, item.quantity, item.unit_price, amount,
          receiptId, balanceMap[item.item_id] || 0, user?.id || 1, entityId
        )
      })
    )

    return c.json({
      success: true,
      data: {
        receipt_number: receiptNumber,
        receipt_id: receiptId
      },
      message: 'Receipt created successfully'
    })
  } catch (error: any) {
    console.error('Failed to create receipt:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다' }, 500)
  }
})

// GET /receipts/inspection-counts - 사이드바 배지용 카운트 (PENDING_REVIEW + 24h 초과 미검수)
inventoryRouter.get('/receipts/inspection-counts', async (c) => {
  try {
    const [pr, overdue] = await Promise.all([
      c.env.DB.prepare(
        `SELECT COUNT(*) AS n FROM inventory_receipts WHERE inspection_status = 'PENDING_REVIEW'`
      ).first<{ n: number }>(),
      c.env.DB.prepare(
        `SELECT COUNT(*) AS n FROM inventory_receipts
         WHERE inspection_status IS NULL
           AND status != 'CANCELLED'
           AND created_at <= datetime('now', '-24 hours')`
      ).first<{ n: number }>(),
    ])
    const prCount = Number(pr?.n || 0)
    const overdueCount = Number(overdue?.n || 0)
    return c.json({
      success: true,
      data: {
        pending_review: prCount,
        overdue_uninspected: overdueCount,
        total: prCount + overdueCount
      }
    })
  } catch (err: any) {
    console.error('inspection-counts error:', err)
    return c.json({ success: false, error: '카운트 조회 실패' }, 500)
  }
})

// GET /receipts/pending-review - PENDING_REVIEW 입고 목록 (관리자 결정 대기)
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

// PATCH /receipts/:id/inspection-decision - 관리자 검수 확인 결정
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
    // status 매핑
    const inspStatus = decision === 'PARTIAL_ACCEPT' ? 'NORMAL'
                     : decision === 'WAITING_RESHIP' ? 'WAITING_RESHIP'
                     : 'CANCELLED'
    const receiptStatus = decision === 'CANCELLED' ? 'CANCELLED' : null

    const decisionLog = '[' + new Date().toISOString().slice(0,16).replace('T',' ') + ' 결정] ' + decision + (notes ? ': ' + notes : '')

    if (receiptStatus === 'CANCELLED') {
      // 취소 시 재고 롤백: 입고 수량만큼 차감 + 역분개 트랜잭션 기록
      const { results: receiptItems } = await c.env.DB.prepare(
        `SELECT item_id, received_quantity FROM inventory_receipt_items WHERE receipt_id = ?`
      ).bind(id).all() as any

      const validItems = (receiptItems || []).filter((ri: any) => ri.item_id && ri.received_quantity > 0)
      if (validItems.length > 0) {
        // 재고 일괄 차감 (batch)
        await c.env.DB.batch(
          validItems.map((ri: any) =>
            c.env.DB.prepare(`UPDATE inventory SET quantity = MAX(0, quantity - ?) WHERE item_id = ?`)
              .bind(ri.received_quantity, ri.item_id)
          )
        )
        // 차감 후 잔량 조회 + 역분개 트랜잭션 기록 (batch)
        const cancelItemIds = validItems.map((ri: any) => ri.item_id)
        const cancelPh = cancelItemIds.map(() => '?').join(',')
        const { results: cancelBalances } = await c.env.DB.prepare(
          `SELECT item_id, quantity FROM inventory WHERE item_id IN (${cancelPh})`
        ).bind(...cancelItemIds).all()
        const cancelBalMap: Record<number, number> = {}
        for (const b of cancelBalances as any[]) cancelBalMap[b.item_id] = b.quantity

        const cancelEntityId = getEntityId(c) || 1
        await c.env.DB.batch(
          validItems.map((ri: any) =>
            c.env.DB.prepare(
              `INSERT INTO inventory_transactions (item_id, transaction_type, quantity, balance_after, reference_type, reference_id, notes, handled_by, transaction_date, entity_id)
               VALUES (?, 'OUT', ?, ?, 'RECEIPT_CANCEL', ?, ?, ?, datetime('now'), ?)`
            ).bind(
              ri.item_id, ri.received_quantity, cancelBalMap[ri.item_id] || 0,
              Number(id), '입고 취소 역분개', c.get('user')?.id || null,
              cancelEntityId
            )
          )
        )
      }

      await c.env.DB.prepare(
        `UPDATE inventory_receipts SET inspection_status = ?, status = ?, notes = COALESCE(notes || char(10), '') || ? WHERE id = ?`
      ).bind(inspStatus, receiptStatus, decisionLog, id).run()
    } else if (receiptStatus) {
      await c.env.DB.prepare(
        `UPDATE inventory_receipts SET inspection_status = ?, status = ?, notes = COALESCE(notes || char(10), '') || ? WHERE id = ?`
      ).bind(inspStatus, receiptStatus, decisionLog, id).run()
    } else {
      await c.env.DB.prepare(
        `UPDATE inventory_receipts SET inspection_status = ?, notes = COALESCE(notes || char(10), '') || ? WHERE id = ?`
      ).bind(inspStatus, decisionLog, id).run()
    }
    return c.json({ success: true, data: { id: Number(id), inspection_status: inspStatus, receipt_status: receiptStatus } })
  } catch (err: any) {
    console.error('inspection-decision error:', err)
    return c.json({ success: false, error: '결정 처리 실패', detail: '서버 오류가 발생했습니다' }, 500)
  }
})

// GET /receipts/:id - 입고 상세 (검수 모달용)
inventoryRouter.get('/receipts/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const receipt = await c.env.DB.prepare(`
      SELECT ir.id, ir.receipt_number, ir.receipt_date, ir.supplier,
             ir.total_amount, ir.status, ir.inspection_status, ir.notes, ir.po_id
      FROM inventory_receipts ir
      WHERE ir.id = ?
    `).bind(id).first() as any

    if (!receipt) return c.json({ success: false, error: '입고 정보를 찾을 수 없습니다.' }, 404)

    const { results: items } = await c.env.DB.prepare(`
      SELECT iri.id, iri.item_id, iri.quantity, iri.received_quantity,
             iri.accepted_quantity, iri.rejected_quantity, iri.quality_status,
             iri.reject_memo, iri.po_item_id,
             m.item_name
      FROM inventory_receipt_items iri
      LEFT JOIN items m ON iri.item_id = m.id
      WHERE iri.receipt_id = ?
      ORDER BY iri.id
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
      return c.json({
        success: false,
        message: 'Reference type, release_date, and items are required'
      }, 400)
    }

    // Generate release number
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '')
    const { results: countResults } = await c.env.DB.prepare(`
      SELECT COUNT(*) as count FROM inventory_releases
      WHERE release_number LIKE ?
    `).bind(`REL-${today}%`).all()

    const sequence = ((countResults[0] as any).count + 1).toString().padStart(3, '0')
    const releaseNumber = `REL-${today}-${sequence}`

    // Insert release header
    const releaseResult = await c.env.DB.prepare(`
      INSERT INTO inventory_releases
      (release_number, release_date, reference_type, reference_id, status, released_by, notes)
      VALUES (?, ?, ?, ?, 'COMPLETED', ?, ?)
    `).bind(
      releaseNumber, release_date, reference_type, reference_id || null,
      user?.id || 1, notes || null
    ).run()

    const releaseId = releaseResult.meta.last_row_id

    // 재고 일괄 확인 (단일 쿼리)
    const releaseItemIds = items.map((item: any) => item.item_id)
    const relPh = releaseItemIds.map(() => '?').join(',')
    const { results: stockRows } = await c.env.DB.prepare(
      `SELECT item_id, quantity FROM inventory WHERE item_id IN (${relPh})`
    ).bind(...releaseItemIds).all()
    const stockMap: Record<number, number> = {}
    for (const s of stockRows as any[]) stockMap[s.item_id] = s.quantity

    // 재고 부족 사전 검증
    for (const item of items) {
      const currentStock = stockMap[item.item_id] || 0
      if (currentStock < item.quantity) {
        return c.json({
          success: false,
          message: `재고 부족 (품목 ${item.item_id}). 현재고: ${currentStock}, 요청: ${item.quantity}`
        }, 400)
      }
    }

    // Insert release items + update inventory (batch)
    const relEntityId = getEntityId(c) || 1
    const releaseStmts = items.flatMap((item: any) => {
      const newStock = (stockMap[item.item_id] || 0) - item.quantity
      return [
        c.env.DB.prepare(`
          INSERT INTO inventory_release_items (release_id, item_id, quantity) VALUES (?, ?, ?)
        `).bind(releaseId, item.item_id, item.quantity),
        c.env.DB.prepare(`
          UPDATE inventory SET quantity = ?, last_updated = CURRENT_TIMESTAMP WHERE item_id = ?
        `).bind(newStock, item.item_id),
        c.env.DB.prepare(`
          INSERT INTO inventory_transactions
          (item_id, transaction_type, transaction_date, quantity, reference_type,
           reference_id, balance_after, reason, handled_by, entity_id)
          VALUES (?, 'OUT', ?, ?, ?, ?, ?, '출고', ?, ?)
        `).bind(
          item.item_id, release_date, -item.quantity, reference_type,
          reference_id || null, newStock, user?.id || 1, relEntityId
        )
      ]
    })
    await c.env.DB.batch(releaseStmts)

    return c.json({
      success: true,
      data: {
        release_number: releaseNumber,
        release_id: releaseId
      },
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
      return c.json({
        success: false,
        message: 'Item ID, adjustment date, quantity, and reason are required'
      }, 400)
    }

    // Get current stock from inventory table
    const invRow = await c.env.DB.prepare(
      `SELECT quantity FROM inventory WHERE item_id = ?`
    ).bind(item_id).first() as any

    const quantityBefore = invRow?.quantity || 0
    const quantityAfter = quantityBefore + parseFloat(adjustment_quantity)

    if (quantityAfter < 0) {
      return c.json({
        success: false,
        message: '조정 후 재고가 음수가 됩니다'
      }, 400)
    }

    // Insert adjustment record
    await c.env.DB.prepare(`
      INSERT INTO inventory_adjustments
      (item_id, adjustment_date, quantity_before, quantity_after,
       adjustment_quantity, reason, adjusted_by, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      item_id, adjustment_date, quantityBefore, quantityAfter,
      adjustment_quantity, reason, user?.id || 1, notes || null
    ).run()

    // Update inventory stock (upsert)
    if (invRow) {
      await c.env.DB.prepare(`
        UPDATE inventory SET quantity = ?, last_updated = CURRENT_TIMESTAMP WHERE item_id = ?
      `).bind(quantityAfter, item_id).run()
    } else {
      await c.env.DB.prepare(`
        INSERT INTO inventory (item_id, quantity, last_updated) VALUES (?, ?, CURRENT_TIMESTAMP)
      `).bind(item_id, quantityAfter).run()
    }

    // Insert transaction
    const transactionType = parseFloat(adjustment_quantity) > 0 ? 'IN' : 'OUT'
    await c.env.DB.prepare(`
      INSERT INTO inventory_transactions
      (item_id, transaction_type, transaction_date, quantity,
       reference_type, balance_after, reason, handled_by, notes, entity_id)
      VALUES (?, ?, ?, ?, 'ADJUSTMENT', ?, ?, ?, ?, ?)
    `).bind(
      item_id, transactionType, adjustment_date, adjustment_quantity,
      quantityAfter, reason, user?.id || 1, notes || null,
      getEntityId(c) || 1
    ).run()

    return c.json({
      success: true,
      data: {
        quantity_before: quantityBefore,
        quantity_after: quantityAfter
      },
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
    // Total items count
    const { results: totalResults } = await c.env.DB.prepare(`
      SELECT COUNT(*) as total FROM items WHERE is_purchase_item = 1 AND is_active = 1
    `).all()

    // Low stock items count
    const { results: lowStockResults } = await c.env.DB.prepare(`
      SELECT COUNT(*) as count FROM items i
      JOIN inventory inv ON i.id = inv.item_id
      WHERE i.is_purchase_item = 1 AND i.is_active = 1
        AND inv.quantity <= inv.safe_stock AND inv.safe_stock > 0
    `).all()

    // Total inventory value
    const { results: valueResults } = await c.env.DB.prepare(`
      SELECT SUM(COALESCE(inv.quantity, 0) * COALESCE(i.base_price, 0)) as total_value
      FROM items i
      LEFT JOIN inventory inv ON i.id = inv.item_id
      WHERE i.is_purchase_item = 1 AND i.is_active = 1
    `).all()

    // Category breakdown
    const { results: categoryResults } = await c.env.DB.prepare(`
      SELECT
        i.category,
        COUNT(*) as item_count,
        SUM(COALESCE(inv.quantity, 0) * COALESCE(i.base_price, 0)) as category_value
      FROM items i
      LEFT JOIN inventory inv ON i.id = inv.item_id
      WHERE i.is_purchase_item = 1 AND i.is_active = 1
      GROUP BY i.category
    `).all()

    return c.json({
      success: true,
      data: {
        total_items: (totalResults[0] as any).total,
        low_stock_items: (lowStockResults[0] as any).count,
        total_value: (valueResults[0] as any).total_value || 0,
        categories: categoryResults
      }
    })
  } catch (error: any) {
    console.error('Failed to get inventory summary:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다' }, 500)
  }
})

export default inventoryRouter
