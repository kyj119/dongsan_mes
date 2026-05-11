/**
 * purchaseOrders/templates.ts — 발주 템플릿 (5 routes)
 * 2026-04-15 분할
 */
import { Hono } from 'hono'
import type { HonoEnv } from '../../types/env'
import type { PurchaseOrder, PurchaseOrderItem, ApiResponse, PaginatedResponse } from '../../types/models'
import { authMiddleware, requireRole } from '../../middleware/auth'
import { getEntityId } from '../../utils/entityFilter'

const templatesRouter = new Hono<HonoEnv>()
templatesRouter.use('/*', authMiddleware, requireRole('ADMIN', 'MANAGER'))

templatesRouter.get('/templates', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT
        t.*,
        c.client_name as supplier_name,
        (SELECT COUNT(*) FROM po_template_items WHERE template_id = t.id AND is_active = 1) as item_count
      FROM po_templates t
      LEFT JOIN clients c ON t.supplier_id = c.id
      WHERE t.is_active = 1
      ORDER BY t.updated_at DESC
    `).all()

    return c.json({ success: true, data: results })
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ============================================================================
// GET /templates/:id - 템플릿 상세
// ============================================================================
templatesRouter.get('/templates/:id', async (c) => {
  try {
    const id = c.req.param('id')

    const template = await c.env.DB.prepare(`
      SELECT t.*, c.client_name as supplier_name
      FROM po_templates t
      LEFT JOIN clients c ON t.supplier_id = c.id
      WHERE t.id = ? AND t.is_active = 1
    `).bind(id).first()

    if (!template) {
      return c.json({ success: false, error: 'Template not found' }, 404)
    }

    const { results: items } = await c.env.DB.prepare(`
      SELECT * FROM po_template_items
      WHERE template_id = ? AND is_active = 1
      ORDER BY sort_order ASC
    `).bind(id).all()

    return c.json({ success: true, data: { ...template, items } })
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ============================================================================
// POST /templates - 템플릿 저장
// ============================================================================
templatesRouter.post('/templates', async (c) => {
  try {
    const user = c.get('user')
    const { name, supplier_id, notes, items } = await c.req.json()

    if (!name || !items || items.length === 0) {
      return c.json({ success: false, error: 'name and items are required' }, 400)
    }

    const result = await c.env.DB.prepare(`
      INSERT INTO po_templates (name, supplier_id, notes, created_by)
      VALUES (?, ?, ?, ?)
      RETURNING *
    `).bind(name, supplier_id || null, notes || null, user?.id || 1).first()

    const templateId = (result as any).id

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      await c.env.DB.prepare(`
        INSERT INTO po_template_items (
          template_id, item_id, item_name, category_name,
          quantity, unit, unit_price, vat_included, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        templateId,
        item.item_id || null,
        item.item_name || '미지정',
        item.category_name || null,
        item.quantity || 1,
        item.unit || 'EA',
        parseFloat(item.unit_price) || 0,
        item.vat_included ? 1 : 0,
        i
      ).run()
    }

    return c.json({
      success: true,
      data: { id: templateId, name },
      message: '템플릿이 저장되었습니다.'
    }, 201)
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ============================================================================
// DELETE /templates/:id - 템플릿 삭제 (soft delete)
// ============================================================================
templatesRouter.delete('/templates/:id', async (c) => {
  try {
    const id = c.req.param('id')

    const template = await c.env.DB.prepare(
      'SELECT id FROM po_templates WHERE id = ? AND is_active = 1'
    ).bind(id).first()

    if (!template) {
      return c.json({ success: false, error: 'Template not found' }, 404)
    }

    await c.env.DB.prepare(
      'UPDATE po_templates SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(id).run()

    return c.json({ success: true, message: '템플릿이 삭제되었습니다.' })
  } catch (error) {
    console.error('src/routes/purchaseOrders.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ============================================================================
// POST /from-template/:templateId - 템플릿에서 발주 생성
// ============================================================================
templatesRouter.post('/from-template/:templateId', async (c) => {
  try {
    const user = c.get('user')
    const templateId = c.req.param('templateId')
    const body = await c.req.json().catch(() => ({}))
    const { status: reqStatus, expected_date, notes, item_overrides } = body as any

    // 템플릿 조회
    const template = await c.env.DB.prepare(`
      SELECT t.*, c.client_name as supplier_name
      FROM po_templates t
      LEFT JOIN clients c ON t.supplier_id = c.id
      WHERE t.id = ? AND t.is_active = 1
    `).bind(templateId).first() as any

    if (!template) {
      return c.json({ success: false, error: '템플릿을 찾을 수 없습니다.' }, 404)
    }

    const { results: templateItems } = await c.env.DB.prepare(`
      SELECT * FROM po_template_items
      WHERE template_id = ? AND is_active = 1
      ORDER BY sort_order ASC
    `).bind(templateId).all() as any

    if (!templateItems || templateItems.length === 0) {
      return c.json({ success: false, error: '템플릿에 품목이 없습니다.' }, 400)
    }

    // 발주번호 생성
    const today = new Date()
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '')
    const { max_seq } = await c.env.DB.prepare(`
      SELECT COALESCE(MAX(CAST(SUBSTR(po_number, 11) AS INTEGER)), 0) as max_seq
      FROM purchase_orders WHERE po_number LIKE ?
    `).bind(`${dateStr}-P%`).first() as any
    const poNumber = `${dateStr}-P${String((max_seq || 0) + 1).padStart(3, '0')}`

    // 품목별 수량/단가 오버라이드 적용 + 금액 계산
    const overrides = item_overrides || {}
    let totalAmount = 0
    let vatAmount = 0

    const items = templateItems.map((ti: any) => {
      const ov = overrides[String(ti.id)] || {}
      const qty = ov.quantity != null ? parseFloat(ov.quantity) : (ti.quantity || 1)
      const price = ov.unit_price != null ? parseFloat(ov.unit_price) : (ti.unit_price || 0)
      const vatIncluded = ov.vat_included != null ? ov.vat_included : ti.vat_included
      const amount = price * qty
      totalAmount += amount
      if (vatIncluded) vatAmount += amount * 0.1
      return { ...ti, quantity: qty, unit_price: price, amount, vat_included: vatIncluded }
    })

    const finalAmount = totalAmount + vatAmount

    const initialStatus = reqStatus === 'CONFIRMED' ? 'CONFIRMED' : 'DRAFT'
    const nowIso = new Date().toISOString()

    const poResult = await c.env.DB.prepare(`
      INSERT INTO purchase_orders (
        po_number, supplier_id, status,
        order_date, expected_date,
        total_amount, vat_amount, discount_amount, final_amount,
        notes, created_by, entity_id,
        confirmed_at, confirmed_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)
    `).bind(
      poNumber,
      template.supplier_id,
      initialStatus,
      today.toISOString().split('T')[0],
      expected_date || null,
      totalAmount, vatAmount, finalAmount,
      notes || (template.notes ? `[템플릿: ${template.name}] ${template.notes}` : `[템플릿: ${template.name}]`),
      user?.id || 1,
      getEntityId(c) || 1,
      initialStatus === 'CONFIRMED' ? nowIso : null,
      initialStatus === 'CONFIRMED' ? (user?.id || 1) : null
    ).run()

    const poId = poResult.meta.last_row_id

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      await c.env.DB.prepare(`
        INSERT INTO purchase_order_items (
          po_id, item_id, item_name, category_name,
          quantity, received_quantity, unit,
          unit_price, amount, vat_included,
          sort_order, notes
        ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)
      `).bind(
        poId,
        item.item_id || null,
        item.item_name || '미지정',
        item.category_name || null,
        item.quantity,
        item.unit || 'EA',
        item.unit_price,
        item.amount,
        item.vat_included ? 1 : 0,
        i,
        item.notes || null
      ).run()
    }

    // 상태 이력
    await c.env.DB.prepare(`
      INSERT INTO po_status_history (po_id, to_status, changed_by, change_reason)
      VALUES (?, 'DRAFT', ?, ?)
    `).bind(poId, user?.id || 1, `템플릿 "${template.name}"에서 생성`).run()

    if (initialStatus === 'CONFIRMED') {
      await c.env.DB.prepare(`
        INSERT INTO po_status_history (po_id, from_status, to_status, changed_by, change_reason)
        VALUES (?, 'DRAFT', 'CONFIRMED', ?, '템플릿에서 즉시 확정 생성')
      `).bind(poId, user?.id || 1).run()

      await c.env.DB.prepare(`
        UPDATE clients SET purchase_balance = COALESCE(purchase_balance, 0) + ?,
        updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).bind(finalAmount, template.supplier_id).run()
    }

    return c.json({
      success: true,
      data: { po_number: poNumber, po_id: poId, template_name: template.name },
      message: `템플릿 "${template.name}"에서 발주가 생성되었습니다.`
    }, 201)
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ============================================================================
// GET /receipts - 입고 이력 통합 조회 (/:id 보다 먼저 등록)
// ============================================================================

export default templatesRouter
