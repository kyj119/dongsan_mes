/**
 * purchaseOrders/templates.ts — 발주 템플릿 (5 routes)
 * 2026-04-15 분할
 */
import { Hono } from 'hono'
import type { HonoEnv } from '../../types/env'
import type { PurchaseOrder, PurchaseOrderItem, ApiResponse, PaginatedResponse } from '../../types/models'
import { authMiddleware, requireRole } from '../../middleware/auth'
import { getWriteEntityId } from '../../utils/entityFilter'
import { isSupervisor } from '../../utils/zoneAccess'
import { getNextSeqNumber, getNextEntitySeqNumber, withSeqRetry } from '../../utils/sequenceGenerator'
import { kstYmdCompact } from '../../utils/kstDate'
import { backfillPoLineFactors } from '../../utils/itemUnits'

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
      ORDER BY t.updated_at DESC, t.id DESC
    `).all()

    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('purchaseOrders/templates GET /templates error:', error)
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
      SELECT id, template_id, item_id, item_name, category_name, quantity, unit, unit_price, vat_included, sort_order FROM po_template_items
      WHERE template_id = ? AND is_active = 1
      ORDER BY sort_order ASC, id ASC
    `).bind(id).all()

    return c.json({ success: true, data: { ...template, items } })
  } catch (error) {
    console.error('purchaseOrders/templates GET /templates/:id error:', error)
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ============================================================================
// POST /templates - 템플릿 저장
// ============================================================================
// 템플릿 저장·삭제는 관리자만(2026-09-27, C11) — 라우터 공통 가드와 별개로 라우트에 명시한다(공통 가드가 좁혀져도 남도록).
templatesRouter.post('/templates', requireRole('ADMIN', 'MANAGER'), async (c) => {
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

    const templateId = (result as { id: number }).id

    // N+1 제거: 품목 INSERT를 db.batch로 일괄 처리 (청크 80)
    const itemStmts = (items as any[]).map((item: any, i: number) =>
      c.env.DB.prepare(`
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
        Number(item.unit_price) || 0,
        item.vat_included ? 1 : 0,
        i
      )
    )
    for (let i = 0; i < itemStmts.length; i += 80) {
      await c.env.DB.batch(itemStmts.slice(i, i + 80))
    }

    return c.json({
      success: true,
      data: { id: templateId, name },
      message: '템플릿이 저장되었습니다.'
    }, 201)
  } catch (error) {
    console.error('purchaseOrders/templates GET user error:', error)
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ============================================================================
// DELETE /templates/:id - 템플릿 삭제 (soft delete)
// ============================================================================
templatesRouter.delete('/templates/:id', requireRole('ADMIN', 'MANAGER'), async (c) => {
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
    const { status: reqStatus, expected_date, notes, item_overrides } = body as { status?: string; expected_date?: string; notes?: string; item_overrides?: Record<string, { quantity?: number; unit_price?: number; vat_included?: number }> }

    // 템플릿 조회
    const template = await c.env.DB.prepare(`
      SELECT t.*, c.client_name as supplier_name
      FROM po_templates t
      LEFT JOIN clients c ON t.supplier_id = c.id
      WHERE t.id = ? AND t.is_active = 1
    `).bind(templateId).first<{ supplier_id: number; name: string; notes: string | null }>()

    if (!template) {
      return c.json({ success: false, error: '템플릿을 찾을 수 없습니다.' }, 404)
    }

    const { results: templateItems } = await c.env.DB.prepare(`
      SELECT id, template_id, item_id, item_name, category_name, quantity, unit, unit_price, vat_included, sort_order FROM po_template_items
      WHERE template_id = ? AND is_active = 1
      ORDER BY sort_order ASC, id ASC
    `).bind(templateId).all<{ id: number; item_id: number | null; item_name: string; category_name: string | null; quantity: number; unit: string; unit_price: number; vat_included: number }>()

    if (!templateItems || templateItems.length === 0) {
      return c.json({ success: false, error: '템플릿에 품목이 없습니다.' }, 400)
    }

    // 법인 = 세션 법인(템플릿엔 법인 칸이 없다). 전체 모드(0)에서 `|| 1` 로 떨어지면 동산(1) AP 로 발주가 생겼다(2026-09-27).
    //   채번(E{eid})과 행 entity_id 는 같은 값이어야 한다.
    const poEntityId = getWriteEntityId(c)
    if (poEntityId == null) {
      return c.json({ success: false, error: '전체 모드에서는 발주를 만들 수 없습니다. 상단에서 법인을 선택하세요.' }, 400)
    }

    // 발주번호 생성
    const today = new Date()
    const dateStr = kstYmdCompact()
    const poNumber = await getNextEntitySeqNumber(c.env.DB, 'purchase_orders', 'po_number', poEntityId, dateStr, { suffix: 'P' })

    // 품목별 수량/단가 오버라이드 적용 + 금액 계산
    const overrides = item_overrides || {}
    let totalAmount = 0
    let vatAmount = 0

    const items = templateItems.map((ti) => {
      const ov = overrides[String(ti.id)] || {}
      const qty = ov.quantity != null ? Number(ov.quantity) : (ti.quantity || 1)
      const price = ov.unit_price != null ? Number(ov.unit_price) : (ti.unit_price || 0)
      const vatIncluded = ov.vat_included != null ? ov.vat_included : ti.vat_included
      const amount = price * qty
      totalAmount += amount
      if (vatIncluded) vatAmount += Math.round(amount * 0.1)  // 라인별 원 단위(발주 생성과 같다)
      return { ...ti, quantity: qty, unit_price: price, amount, vat_included: vatIncluded }
    })

    const finalAmount = totalAmount + vatAmount

    // 확정 생성은 관리자만(2026-09-27, C11) — 비관리자는 초안(DRAFT)으로만 만든다. 확정 발주는 곧 AP 채무다
    //   (core.ts PATCH 가 비관리자에게 「대기 → 확정」을 담당 구역 확인 뒤에만 여는 것과 같은 선).
    const initialStatus = (reqStatus === 'CONFIRMED' && isSupervisor(c)) ? 'CONFIRMED' : 'DRAFT'
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
      poEntityId,
      initialStatus === 'CONFIRMED' ? nowIso : null,
      initialStatus === 'CONFIRMED' ? (user?.id || 1) : null
    ).run()

    const poId = poResult.meta.last_row_id

    // N+1 제거: 발주 품목 INSERT를 db.batch로 일괄 처리 (청크 80)
    const poItemStmts = items.map((item, i) =>
      c.env.DB.prepare(`
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
        null
      )
    )
    for (let i = 0; i < poItemStmts.length; i += 80) {
      await c.env.DB.batch(poItemStmts.slice(i, i + 80))
    }

    // 상태 이력
    await c.env.DB.prepare(`
      INSERT INTO po_status_history (po_id, to_status, changed_by, change_reason)
      VALUES (?, 'DRAFT', ?, ?)
    `).bind(poId, user?.id || 1, `템플릿 "${template.name}"에서 생성`).run()
    // 0620 단위표: 라인 계수 스냅샷 보정(비어 있는 라인만) — 입고 환산의 정본
    await backfillPoLineFactors(c.env.DB, poId as number)

    if (initialStatus === 'CONFIRMED') {
      await c.env.DB.prepare(`
        INSERT INTO po_status_history (po_id, from_status, to_status, changed_by, change_reason)
        VALUES (?, 'DRAFT', 'CONFIRMED', ?, '템플릿에서 즉시 확정 생성')
      `).bind(poId, user?.id || 1).run()
      // AP 잔액은 파생(utils/supplierPayable = 발주 − 지급 − 조정). `clients.purchase_balance` 누적은
      //   2026-08-31 에 14곳에서 제거됐고 여기 1곳이 남아 단방향으로 커지고 있었다(2026-09-03 제거).
    }

    return c.json({
      success: true,
      data: { po_number: poNumber, po_id: poId, template_name: template.name },
      message: `템플릿 "${template.name}"에서 발주가 생성되었습니다.`
    }, 201)
  } catch (error) {
    console.error('purchaseOrders/templates GET user error:', error)
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
