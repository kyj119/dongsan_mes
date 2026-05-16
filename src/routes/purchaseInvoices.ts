import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { getEntityId, entityFilter } from '../utils/entityFilter'

const purchaseInvoices = new Hono<HonoEnv>()
purchaseInvoices.use('*', authMiddleware)

// ─── 매입 인보이스 목록 ──────────────────────────────────────────────────────
purchaseInvoices.get('/', async (c) => {
  const status = c.req.query('match_status')
  const eFilter = entityFilter(c, 'pi')
  let where = `WHERE 1=1 ${eFilter.clause}`
  const binds: any[] = [...eFilter.params]
  if (status) { where += ' AND pi.match_status = ?'; binds.push(status) }

  const { results } = await c.env.DB.prepare(`
    SELECT pi.*, cl.client_name as supplier_name, po.po_number
    FROM purchase_invoices pi
    LEFT JOIN clients cl ON pi.supplier_id = cl.id
    LEFT JOIN purchase_orders po ON pi.po_id = po.id
    ${where}
    ORDER BY pi.invoice_date DESC LIMIT 100
  `).bind(...binds).all()

  return c.json({ success: true, data: results })
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

  // 라인 아이템
  if (items?.length) {
    const stmts = items.map((item: any) =>
      c.env.DB.prepare(`
        INSERT INTO purchase_invoice_items (invoice_id, po_item_id, item_id, quantity, unit_price, amount)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(invoiceId, item.po_item_id || null, item.item_id || null, item.quantity, item.unit_price, item.amount)
    )
    await c.env.DB.batch(stmts)
  }

  return c.json({ success: true, data: { id: invoiceId } })
})

// ─── 3-Way Matching 자동 대사 ────────────────────────────────────────────────
purchaseInvoices.post('/:id/match', requireRole('ADMIN', 'MANAGER'), async (c) => {
  const id = Number(c.req.param('id'))

  const invoice = await c.env.DB.prepare(
    `SELECT * FROM purchase_invoices WHERE id = ?`
  ).bind(id).first<any>()
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
  const invoice = await c.env.DB.prepare(`
    SELECT pi.*, cl.client_name as supplier_name, po.po_number
    FROM purchase_invoices pi
    LEFT JOIN clients cl ON pi.supplier_id = cl.id
    LEFT JOIN purchase_orders po ON pi.po_id = po.id
    WHERE pi.id = ?
  `).bind(id).first()

  const { results: items } = await c.env.DB.prepare(`
    SELECT pii.*, i.item_name
    FROM purchase_invoice_items pii
    LEFT JOIN items i ON pii.item_id = i.id
    WHERE pii.invoice_id = ?
  `).bind(id).all()

  return c.json({ success: true, data: { ...invoice, items } })
})

export default purchaseInvoices
