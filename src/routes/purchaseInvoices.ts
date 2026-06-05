import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { getEntityId, entityFilter } from '../utils/entityFilter'

const purchaseInvoices = new Hono<HonoEnv>()
purchaseInvoices.use('*', authMiddleware)

// ─── 매입 인보이스 목록 ──────────────────────────────────────────────────────
purchaseInvoices.get('/', async (c) => {
  const status = c.req.query('match_status')
  const page = Math.max(1, parseInt(c.req.query('page') || '1'))
  const limit = Math.min(Math.max(parseInt(c.req.query('limit') || '50'), 1), 200)
  const offset = (page - 1) * limit
  const eFilter = entityFilter(c, 'pi')
  let where = `WHERE 1=1 ${eFilter.clause}`
  const binds: any[] = [...eFilter.params]
  if (status) { where += ' AND pi.match_status = ?'; binds.push(status) }

  const countRow = await c.env.DB.prepare(
    `SELECT COUNT(*) as count FROM purchase_invoices pi ${where}`
  ).bind(...binds).first<{ count: number }>()
  const total = countRow?.count ?? 0

  const { results } = await c.env.DB.prepare(`
    SELECT pi.*, cl.client_name as supplier_name, po.po_number
    FROM purchase_invoices pi
    LEFT JOIN clients cl ON pi.supplier_id = cl.id
    LEFT JOIN purchase_orders po ON pi.po_id = po.id
    ${where}
    ORDER BY pi.invoice_date DESC LIMIT ? OFFSET ?
  `).bind(...binds, limit, offset).all()

  return c.json({
    success: true,
    data: results,
    pagination: { page, limit, total, total_pages: Math.ceil(total / limit) }
  })
})

// ─── 매입확정 대기 목록 (단가 미정·입고완료 PO) ─────────────────────────────
// price_status='PENDING' + 입고됨(received_quantity>0) → 실단가 확정 대기
purchaseInvoices.get('/pending', async (c) => {
  const ef = entityFilter(c, 'po')
  const { results } = await c.env.DB.prepare(`
    SELECT po.id as po_id, po.po_number, po.order_date, po.supplier_id,
           cl.client_name as supplier_name,
           COUNT(poi.id) as pending_count,
           COALESCE(SUM(poi.received_quantity), 0) as pending_qty
    FROM purchase_order_items poi
    JOIN purchase_orders po ON po.id = poi.po_id
    LEFT JOIN clients cl ON cl.id = po.supplier_id
    WHERE poi.price_status = 'PENDING' AND poi.received_quantity > 0 ${ef.clause}
    GROUP BY po.id
    ORDER BY po.order_date DESC
    LIMIT 100
  `).bind(...ef.params).all()
  return c.json({ success: true, data: results })
})

// ─── 매입확정 대기 PO 상세 (미정 품목 + 거래명세서) ─────────────────────────
purchaseInvoices.get('/pending/:poId', async (c) => {
  const poId = Number(c.req.param('poId'))
  const ef = entityFilter(c, 'po')
  const po = await c.env.DB.prepare(`
    SELECT po.id, po.po_number, po.supplier_id, cl.client_name as supplier_name
    FROM purchase_orders po LEFT JOIN clients cl ON cl.id = po.supplier_id
    WHERE po.id = ?${ef.clause}
  `).bind(poId, ...ef.params).first<any>()
  if (!po) return c.json({ success: false, error: 'PO를 찾을 수 없습니다.' }, 404)

  const { results: items } = await c.env.DB.prepare(`
    SELECT poi.id as po_item_id, poi.item_id, poi.item_name, poi.unit,
           poi.quantity, poi.received_quantity, poi.vat_included, poi.price_status,
           i.base_price
    FROM purchase_order_items poi
    LEFT JOIN items i ON i.id = poi.item_id
    WHERE poi.po_id = ? AND poi.price_status = 'PENDING' AND poi.received_quantity > 0
    ORDER BY poi.sort_order ASC
  `).bind(poId).all()

  // 거래명세서 첨부된 입고 건
  const { results: receipts } = await c.env.DB.prepare(`
    SELECT id, receipt_number, receipt_date, statement_file_key
    FROM inventory_receipts WHERE po_id = ? ORDER BY receipt_date DESC
  `).bind(poId).all()

  return c.json({ success: true, data: { po, items, receipts } })
})

// ─── 매입확정 실행 (실단가 입력 → PO·재고·매입처단가 갱신 + 인보이스 생성) ──
purchaseInvoices.post('/confirm', requireRole('ADMIN', 'MANAGER'), async (c) => {
  const body = await c.req.json()
  const user = c.get('user')
  const { po_id, invoice_date, due_date, notes, items } = body
  if (!po_id || !Array.isArray(items) || items.length === 0) {
    return c.json({ success: false, error: 'po_id, items 필수' }, 400)
  }

  const ef = entityFilter(c, 'po')
  const po = await c.env.DB.prepare(
    `SELECT po.id, po.po_number, po.supplier_id FROM purchase_orders po WHERE po.id = ?${ef.clause}`
  ).bind(po_id, ...ef.params).first<{ id: number; po_number: string; supplier_id: number }>()
  if (!po) return c.json({ success: false, error: 'PO를 찾을 수 없습니다.' }, 404)

  const eid = getEntityId(c) || 1
  const invoiceItems: Array<{ po_item_id: number; item_id: number | null; quantity: number; unit_price: number; amount: number }> = []

  // 1) 품목별: poi 단가·price_status 갱신 + 입고라인/원장 valuation 정정
  for (const it of items) {
    const price = Number(it.unit_price)
    if (!it.po_item_id || !(price > 0)) {
      return c.json({ success: false, error: '모든 품목의 실단가(>0)를 입력하세요.' }, 400)
    }
    const poi = await c.env.DB.prepare(
      `SELECT id, item_id, quantity, received_quantity FROM purchase_order_items WHERE id = ? AND po_id = ?`
    ).bind(it.po_item_id, po_id).first<{ id: number; item_id: number | null; quantity: number; received_quantity: number }>()
    if (!poi) continue
    const recvQty = poi.received_quantity || poi.quantity || 0

    // poi: 발주 단가 확정
    await c.env.DB.prepare(
      `UPDATE purchase_order_items SET unit_price = ?, amount = ? * quantity, price_status = 'CONFIRMED', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(price, price, poi.id).run()

    // 입고 라인 valuation 정정
    await c.env.DB.prepare(
      `UPDATE inventory_receipt_items SET unit_price = ?, amount = received_quantity * ? WHERE po_item_id = ?`
    ).bind(price, price, poi.id).run()

    // 재고 원장(inventory_transactions) valuation 정정 — 이 PO의 입고 건 한정
    if (poi.item_id) {
      await c.env.DB.prepare(
        `UPDATE inventory_transactions SET unit_price = ?, total_amount = quantity * ?
         WHERE item_id = ? AND reference_type = 'PURCHASE'
           AND reference_id IN (SELECT id FROM inventory_receipts WHERE po_id = ?)`
      ).bind(price, price, poi.item_id, po_id).run()
    }

    invoiceItems.push({ po_item_id: poi.id, item_id: poi.item_id, quantity: recvQty, unit_price: price, amount: recvQty * price })
  }

  // 2) 매입처 단가 + base_price upsert (best-effort, receive Phase4와 동일 정책)
  try {
    for (const ii of invoiceItems) {
      if (!ii.item_id) continue
      if (po.supplier_id) {
        await c.env.DB.prepare(
          `INSERT INTO client_item_prices (client_id, item_id, price) VALUES (?, ?, ?)
           ON CONFLICT(client_id, item_id) DO UPDATE SET price = ?, updated_at = CURRENT_TIMESTAMP`
        ).bind(po.supplier_id, ii.item_id, ii.unit_price, ii.unit_price).run()
      }
      const oldItem = await c.env.DB.prepare('SELECT base_price FROM items WHERE id = ?').bind(ii.item_id).first<{ base_price: number }>()
      if (oldItem && oldItem.base_price !== ii.unit_price) {
        await c.env.DB.prepare('UPDATE items SET base_price = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(ii.unit_price, ii.item_id).run()
        await c.env.DB.prepare(
          `INSERT INTO price_change_history (target_type, target_id, field_name, old_value, new_value, changed_by, entity_id)
           VALUES ('ITEM', ?, 'base_price', ?, ?, ?, ?)`
        ).bind(ii.item_id, oldItem.base_price, ii.unit_price, user?.username || 'system', eid).run()
      }
    }
  } catch (e) { console.error('confirm price upsert error:', e) }

  // 3) PO 총액 재계산
  const totals = await c.env.DB.prepare(`
    SELECT COALESCE(SUM(amount), 0) as subtotal,
           COALESCE(SUM(CASE WHEN vat_included = 1 THEN ROUND(amount * 0.1) ELSE 0 END), 0) as vat
    FROM purchase_order_items WHERE po_id = ?
  `).bind(po_id).first<{ subtotal: number; vat: number }>()
  const subtotal = totals?.subtotal || 0
  const vat = totals?.vat || 0
  await c.env.DB.prepare(
    `UPDATE purchase_orders SET total_amount = ?, vat_amount = ?, final_amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).bind(subtotal, vat, subtotal + vat, po_id).run()

  // 3.5) 지급예정(cash_schedule OUT) 물질화 — 매입확정 시점 금액으로 UPSERT
  //   PURCHASE OUT은 cashflowEngine에서 물질화 전용(온더플라이 미계산)이라 이중계산 없음.
  //   auto-generate와 동일하게 source_id=po_id로 dedup → 단가미정 발주의 잠정 금액을 확정 금액으로 정정.
  try {
    const payable = subtotal + vat
    let dueStr: string | null = due_date || null
    if (!dueStr) {
      const sup = await c.env.DB.prepare('SELECT COALESCE(payment_terms_days, 30) as d FROM clients WHERE id = ?')
        .bind(po.supplier_id).first<{ d: number }>()
      const base = invoice_date ? new Date(invoice_date) : new Date()
      dueStr = new Date(base.getTime() + (sup?.d || 30) * 86400000).toISOString().slice(0, 10)
    }
    const desc = `매입확정 지급예정 (발주 ${po.po_number})`
    const existing = await c.env.DB.prepare(
      `SELECT id FROM cash_schedule WHERE source_type = 'PURCHASE' AND source_id = ?`
    ).bind(po_id).first<{ id: number }>()
    if (existing) {
      await c.env.DB.prepare(
        `UPDATE cash_schedule SET amount = ?, schedule_date = ?, client_id = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
      ).bind(payable, dueStr, po.supplier_id, desc, existing.id).run()
    } else {
      await c.env.DB.prepare(
        `INSERT INTO cash_schedule (schedule_date, flow_type, source_type, source_id, client_id, amount, description, created_by, entity_id)
         VALUES (?, 'OUT', 'PURCHASE', ?, ?, ?, ?, ?, ?)`
      ).bind(dueStr, po_id, po.supplier_id, payable, desc, user?.id || null, eid).run()
    }
  } catch (e) { console.error('confirm cash_schedule upsert error:', e) }

  // 4) 매입 인보이스 생성 + 라인 + 간이 3-way 판정
  const invSubtotal = invoiceItems.reduce((s, i) => s + i.amount, 0)
  const invVat = Math.round(invSubtotal * 0.1)
  const invTotal = invSubtotal + invVat
  const invoiceNumber = `PI-${po.po_number}-${String(Date.now()).slice(-4)}`
  const matchStatus = Math.abs(invTotal - (subtotal + vat)) <= Math.max(invTotal, subtotal + vat) * 0.01 ? 'MATCHED' : 'PRICE_VARIANCE'

  const result = await c.env.DB.prepare(`
    INSERT INTO purchase_invoices (invoice_number, supplier_id, po_id, invoice_date, due_date, subtotal, vat_amount, total_amount, match_status, variance_amount, notes, entity_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    invoiceNumber, po.supplier_id, po_id, invoice_date || new Date().toISOString().slice(0, 10), due_date || null,
    invSubtotal, invVat, invTotal, matchStatus, invTotal - (subtotal + vat), notes || null, eid, user?.id || null
  ).run()
  const invoiceId = result.meta.last_row_id as number

  if (invoiceItems.length) {
    const stmts = invoiceItems.map((ii) =>
      c.env.DB.prepare(
        `INSERT INTO purchase_invoice_items (invoice_id, po_item_id, item_id, quantity, unit_price, amount, entity_id) VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(invoiceId, ii.po_item_id, ii.item_id, ii.quantity, ii.unit_price, ii.amount, eid)
    )
    try { await c.env.DB.batch(stmts) } catch (e) {
      await c.env.DB.prepare('DELETE FROM purchase_invoices WHERE id = ?').bind(invoiceId).run()
      throw e
    }
  }

  return c.json({ success: true, data: { invoice_id: invoiceId, invoice_number: invoiceNumber, match_status: matchStatus, total: invTotal } })
})

// ─── 매입 인보이스 생성 ──────────────────────────────────────────────────────
purchaseInvoices.post('/', async (c) => {
  const body = await c.req.json()
  const userId = c.get('user')?.id
  const { invoice_number, supplier_id, po_id, invoice_date, due_date, items, notes } = body

  if (!invoice_number || !supplier_id || !invoice_date) {
    return c.json({ success: false, error: 'invoice_number, supplier_id, invoice_date 필수' }, 400)
  }

  const subtotal = (items || []).reduce((sum: number, i: any) => sum + (i.amount || 0), 0)
  const vatAmount = Math.round(subtotal * 0.1)
  const totalAmount = subtotal + vatAmount

  const result = await c.env.DB.prepare(`
    INSERT INTO purchase_invoices (invoice_number, supplier_id, po_id, invoice_date, due_date, subtotal, vat_amount, total_amount, notes, entity_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    invoice_number, supplier_id, po_id || null, invoice_date, due_date || null,
    subtotal, vatAmount, totalAmount, notes || null, getEntityId(c), userId
  ).run()

  const invoiceId = result.meta.last_row_id as number

  // #126 #137: 아이템 batch 실패 시 헤더 롤백 (고아 방지)
  if (items?.length) {
    const stmts = items.map((item: any) =>
      c.env.DB.prepare(`
        INSERT INTO purchase_invoice_items (invoice_id, po_item_id, item_id, quantity, unit_price, amount, entity_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(invoiceId, item.po_item_id || null, item.item_id || null, item.quantity, item.unit_price, item.amount, getEntityId(c) || 1)
    )
    try {
      await c.env.DB.batch(stmts)
    } catch (e) {
      await c.env.DB.prepare('DELETE FROM purchase_invoices WHERE id = ?').bind(invoiceId).run()
      throw e
    }
  }

  return c.json({ success: true, data: { id: invoiceId } })
})

// ─── 3-Way Matching 자동 대사 ────────────────────────────────────────────────
purchaseInvoices.post('/:id/match', requireRole('ADMIN', 'MANAGER'), async (c) => {
  const id = Number(c.req.param('id'))

  const matchEf = entityFilter(c, 'pi')
  const invoice = await c.env.DB.prepare(
    `SELECT pi.* FROM purchase_invoices pi WHERE pi.id = ?${matchEf.clause}`
  ).bind(id, ...matchEf.params).first<any>()
  if (!invoice) return c.json({ success: false, error: '인보이스를 찾을 수 없습니다.' }, 404)
  if (!invoice.po_id) {
    return c.json({ success: false, error: 'PO가 연결되지 않았습니다.' }, 400)
  }

  // PO 금액
  const po = await c.env.DB.prepare(
    `SELECT final_amount FROM purchase_orders WHERE id = ?`
  ).bind(invoice.po_id).first<{ final_amount: number }>()

  // 입고 금액
  const receipt = await c.env.DB.prepare(`
    SELECT COALESCE(SUM(iri.received_quantity * poi.unit_price), 0) as receipt_amount
    FROM inventory_receipt_items iri
    JOIN purchase_order_items poi ON iri.po_item_id = poi.id
    JOIN inventory_receipts ir ON iri.receipt_id = ir.id
    WHERE ir.po_id = ? AND ir.status != 'CANCELLED'
  `).bind(invoice.po_id).first<{ receipt_amount: number }>()

  const poAmount = po?.final_amount || 0
  const receiptAmount = receipt?.receipt_amount || 0
  const invoiceAmount = invoice.total_amount

  // 허용 오차 1%
  const tolerance = Math.max(poAmount, invoiceAmount) * 0.01

  let matchStatus = 'MATCHED'
  let variance = 0

  if (Math.abs(invoiceAmount - poAmount) > tolerance) {
    matchStatus = 'PRICE_VARIANCE'
    variance = invoiceAmount - poAmount
  } else if (Math.abs(receiptAmount - poAmount) > tolerance) {
    matchStatus = 'QUANTITY_VARIANCE'
    variance = receiptAmount - poAmount
  }

  await c.env.DB.prepare(`
    UPDATE purchase_invoices SET match_status = ?, variance_amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).bind(matchStatus, variance, id).run()

  return c.json({
    success: true,
    data: { match_status: matchStatus, po_amount: poAmount, receipt_amount: receiptAmount, invoice_amount: invoiceAmount, variance }
  })
})

// ─── 매입 인보이스 상세 ──────────────────────────────────────────────────────
purchaseInvoices.get('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const detailEf = entityFilter(c, 'pi')
  const invoice = await c.env.DB.prepare(`
    SELECT pi.*, cl.client_name as supplier_name, po.po_number
    FROM purchase_invoices pi
    LEFT JOIN clients cl ON pi.supplier_id = cl.id
    LEFT JOIN purchase_orders po ON pi.po_id = po.id
    WHERE pi.id = ? ${detailEf.clause}
  `).bind(id, ...detailEf.params).first()

  const { results: items } = await c.env.DB.prepare(`
    SELECT pii.*, i.item_name
    FROM purchase_invoice_items pii
    LEFT JOIN items i ON pii.item_id = i.id
    WHERE pii.invoice_id = ?
  `).bind(id).all()

  return c.json({ success: true, data: { ...invoice, items } })
})

export default purchaseInvoices
