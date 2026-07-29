/**
 * purchaseOrders/po-special.ts — 발주 복사/재발주/빠른발주 (core.ts에서 분리, 2026-06-12 대형파일 분할 4/4)
 *
 * 발주 복사(:id/copy) · 원클릭 재발주(:id/reorder) · 빠른 발주(quick).
 * 배럴(purchaseOrders.ts)에서 core 앞 마운트. ⚠️ 이동만, 로직 수정 0.
 */
import { Hono } from 'hono'
import type { HonoEnv } from '../../types/env'
import type { PurchaseOrder } from '../../types/models'
import { authMiddleware, requireRole } from '../../middleware/auth'
import { requireAnyPagePermission } from '../../middleware/permissions'
import { getEntityId, entityFilter } from '../../utils/entityFilter'
import { getNextSeqNumber, getNextEntitySeqNumber } from '../../utils/sequenceGenerator'
import { kstYmdCompact, kstDate } from '../../utils/kstDate'

const poSpecialRouter = new Hono<HonoEnv>()
poSpecialRouter.use('/*', authMiddleware, requireAnyPagePermission('/purchase-orders', '/receiving'))

// ============================================================================
// POST /:id/copy - 발주 복사
// ============================================================================
poSpecialRouter.post('/:id/copy', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const user = c.get('user')
    const id = c.req.param('id')

    const ef = entityFilter(c)  // #358계열: 발주 복사 원본 법인 격리 (타법인 발주 복사 차단)
    const po = await c.env.DB.prepare(`
      SELECT id, po_number, supplier_id, expected_date,
             total_amount, vat_amount, discount_amount, final_amount,
             notes, internal_notes
      FROM purchase_orders WHERE id = ?${ef.clause}
    `).bind(id, ...ef.params).first<PurchaseOrder>()

    if (!po) {
      return c.json({ success: false, error: 'Purchase order not found' }, 404)
    }

    const { results: originalItems } = await c.env.DB.prepare(`
      SELECT item_id, item_name, category_name, quantity, unit, unit_price, amount, vat_included, sort_order, notes
      FROM purchase_order_items WHERE po_id = ? ORDER BY sort_order ASC, id ASC
    `).bind(id).all()

    // 새 발주번호 생성
    const today = new Date()
    const dateStr = kstYmdCompact()

    const newPoNumber = await getNextEntitySeqNumber(c.env.DB, 'purchase_orders', 'po_number', getEntityId(c) || 1, dateStr, { suffix: 'P' })

    // 새 발주 INSERT (DRAFT 상태, balance 미반영)
    const newPoResult = await c.env.DB.prepare(`
      INSERT INTO purchase_orders (
        po_number, supplier_id, status,
        order_date, expected_date,
        total_amount, vat_amount, discount_amount, final_amount,
        notes, internal_notes, created_by, entity_id
      ) VALUES (?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      newPoNumber,
      po.supplier_id,
      today.toISOString().split('T')[0],
      po.expected_date || null,
      po.total_amount,
      po.vat_amount,
      po.discount_amount,
      po.final_amount,
      po.notes ? `[복사] ${po.notes}` : null,
      po.internal_notes || null,
      user?.id || 1,
      getEntityId(c) || 1
    ).run()

    const newPoId = newPoResult.meta.last_row_id

    // 품목 복사 (received_quantity=0으로 초기화) — #407: 순차 .run() N+1 → batch (core.ts:320 패턴)
    const poiStmts = (originalItems as Record<string, unknown>[]).map((item) =>
      c.env.DB.prepare(`
        INSERT INTO purchase_order_items (
          po_id, item_id, item_name, category_name,
          quantity, received_quantity, unit,
          unit_price, amount, vat_included,
          sort_order, notes
        ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)
      `).bind(
        newPoId,
        item.item_id || null,
        item.item_name,
        item.category_name || null,
        item.quantity,
        item.unit || 'EA',
        item.unit_price || 0,
        item.amount || 0,
        item.vat_included,
        item.sort_order || 0,
        item.notes || null
      )
    )
    // 상태 이력도 같은 statement 배열에 포함 → 복사 전체 원자화
    poiStmts.push(
      c.env.DB.prepare(`
        INSERT INTO po_status_history (po_id, to_status, changed_by, change_reason)
        VALUES (?, 'DRAFT', ?, ?)
      `).bind(newPoId, user?.id || 1, `발주 #${po.po_number} 복사`)
    )
    for (let i = 0; i < poiStmts.length; i += 80) {
      await c.env.DB.batch(poiStmts.slice(i, i + 80))
    }

    return c.json({
      success: true,
      data: { po_number: newPoNumber, po_id: newPoId },
      message: '발주가 복사되었습니다.'
    }, 201)
  } catch (error) {
    console.error('src/routes/purchaseOrders.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ============================================================================
// POST /:id/reorder - 원클릭 재발주 (이전 PO 기반으로 새 PO 생성, 바로 CONFIRMED)
// ============================================================================
poSpecialRouter.post('/:id/reorder', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')
    const user = c.get('user')
    const body: { status?: string } = await c.req.json<{ status?: string }>().catch(() => ({}))
    const targetStatus = body.status || 'CONFIRMED'

    // 원본 PO 조회
    const ef = entityFilter(c)  // #358계열: 발주 재주문 원본 법인 격리 (타법인 발주 재주문 차단)
    const originalPo = await c.env.DB.prepare(`
      SELECT id, po_number, supplier_id, expected_date, delivery_location,
             total_amount, vat_amount, discount_amount, final_amount, notes
      FROM purchase_orders WHERE id = ?${ef.clause}
    `).bind(id, ...ef.params).first<PurchaseOrder & { delivery_location?: string }>()
    if (!originalPo) {
      return c.json({ success: false, error: '원본 발주서를 찾을 수 없습니다.' }, 404)
    }

    // 원본 PO 아이템 조회
    const { results: originalItems } = await c.env.DB.prepare(`
      SELECT item_id, item_name, category_name, quantity, unit, unit_price, amount, vat_included, sort_order, notes
      FROM purchase_order_items WHERE po_id = ? ORDER BY sort_order, id
    `).bind(id).all()

    // 새 PO 번호 생성
    const today = kstYmdCompact()
    // entity별 시퀀스 (0281 복합 UNIQUE(entity_id, po_number) 정합 — 정규 생성 경로와 동일)
    const poNumber = await getNextSeqNumber(c.env.DB, 'purchase_orders', 'po_number', `${today}-P`, 3, getEntityId(c) || 1)

    // 새 PO 생성
    const result = await c.env.DB.prepare(`
      INSERT INTO purchase_orders (po_number, supplier_id, status, order_date, expected_date, delivery_location,
        total_amount, vat_amount, discount_amount, final_amount, notes, internal_notes,
        source_po_id, created_by, updated_by, entity_id, confirmed_at, confirmed_by)
      VALUES (?, ?, ?, ${kstDate()}, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${targetStatus === 'CONFIRMED' ? "datetime('now')" : 'NULL'}, ${targetStatus === 'CONFIRMED' ? '?' : 'NULL'})
    `).bind(
      poNumber,
      originalPo.supplier_id,
      targetStatus,
      originalPo.expected_date,
      originalPo.delivery_location || null,
      originalPo.total_amount,
      originalPo.vat_amount,
      originalPo.discount_amount || 0,
      originalPo.final_amount,
      originalPo.notes || null,
      `재발주 (원본: ${originalPo.po_number})`,
      id,
      user.id,
      user.id,
      getEntityId(c) || 1,
      ...(targetStatus === 'CONFIRMED' ? [user.id] : [])
    ).run()

    const newPoId = result.meta.last_row_id

    // 아이템 복사 (수량 초기화)
    for (const item of originalItems) {
      await c.env.DB.prepare(`
        INSERT INTO purchase_order_items (po_id, item_id, item_name, category_name, quantity,
          received_quantity, accepted_quantity, rejected_quantity,
          unit, unit_price, amount, vat_included, sort_order, notes)
        VALUES (?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?, ?, ?, ?)
      `).bind(
        newPoId, item.item_id, item.item_name, item.category_name, item.quantity,
        item.unit, item.unit_price, item.amount, item.vat_included, item.sort_order, item.notes
      ).run()
    }

    // 상태 이력 기록
    await c.env.DB.prepare(`
      INSERT INTO po_status_history (po_id, from_status, to_status, changed_by, change_reason)
      VALUES (?, NULL, ?, ?, ?)
    `).bind(newPoId, targetStatus, user.id, `재발주 생성 (원본: ${originalPo.po_number})`).run()

    // CONFIRMED면 매입잔액 업데이트
    if (targetStatus === 'CONFIRMED') {
      await c.env.DB.prepare(`
        UPDATE clients SET purchase_balance = COALESCE(purchase_balance, 0) + ? WHERE id = ?
      `).bind(originalPo.final_amount, originalPo.supplier_id).run()
    }

    return c.json({
      success: true,
      data: { id: newPoId, po_number: poNumber },
      message: `재발주가 ${targetStatus === 'CONFIRMED' ? '확정' : '임시저장'} 상태로 생성되었습니다.`
    })
  } catch (error) {
    console.error('src/routes/purchaseOrders.ts reorder error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// GET /stock-alerts - 안전재고 부족 알림 목록
// ============================================================================
poSpecialRouter.post('/quick', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const user = c.get('user')
    const body = await c.req.json<{
      supplier_id: number
      items: Array<{
        item_id?: number
        item_name: string
        category_name?: string
        quantity: number
        unit?: string
        unit_price: number
        vat_included?: boolean
      }>
      expected_date?: string
      delivery_location?: string
      notes?: string
    }>()

    if (!body.supplier_id) return c.json({ success: false, error: '공급업체를 선택해주세요.' }, 400)
    if (!body.items?.length) return c.json({ success: false, error: '품목을 추가해주세요.' }, 400)

    // 자동승인 설정 확인
    const { results: settingsRows } = await c.env.DB.prepare(
      `SELECT setting_key, setting_value FROM settings WHERE setting_key IN ('po_auto_approve_enabled', 'po_auto_approve_limit')`
    ).all()
    const settingsMap: Record<string, string> = {}
    for (const s of settingsRows as Record<string, unknown>[]) settingsMap[s.setting_key as string] = s.setting_value as string

    // 금액 계산
    let totalAmount = 0
    let vatAmount = 0
    for (const item of body.items) {
      const amount = item.quantity * item.unit_price
      totalAmount += amount
      if (item.vat_included !== false) vatAmount += Math.round(amount * 0.1)
    }
    const finalAmount = totalAmount + vatAmount

    // 자동승인 가능 여부 판단
    const autoApproveEnabled = settingsMap.po_auto_approve_enabled === '1'
    const autoApproveLimit = Number(settingsMap.po_auto_approve_limit || '0')
    const canAutoApprove = autoApproveEnabled && finalAmount <= autoApproveLimit
    const status = canAutoApprove ? 'CONFIRMED' : 'DRAFT'

    // PO 번호 생성
    const today = kstYmdCompact()
    // entity별 시퀀스 (0281 복합 UNIQUE(entity_id, po_number) 정합 — 정규 생성 경로와 동일)
    const poNumber = await getNextSeqNumber(c.env.DB, 'purchase_orders', 'po_number', `${today}-P`, 3, getEntityId(c) || 1)

    // PO 생성
    const result = await c.env.DB.prepare(`
      INSERT INTO purchase_orders (po_number, supplier_id, status, order_date, expected_date, delivery_location,
        total_amount, vat_amount, discount_amount, final_amount, notes, internal_notes,
        created_by, updated_by, entity_id, confirmed_at, confirmed_by)
      VALUES (?, ?, ?, ${kstDate()}, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?,
        ${canAutoApprove ? "datetime('now')" : 'NULL'},
        ${canAutoApprove ? '?' : 'NULL'})
    `).bind(
      poNumber, body.supplier_id, status,
      body.expected_date || null, body.delivery_location || null,
      totalAmount, vatAmount, finalAmount,
      body.notes || null, canAutoApprove ? '빠른 발주 (자동승인)' : '빠른 발주',
      user.id, user.id, getEntityId(c) || 1,
      ...(canAutoApprove ? [user.id] : [])
    ).run()

    const newPoId = result.meta.last_row_id

    // 아이템 저장
    for (let i = 0; i < body.items.length; i++) {
      const item = body.items[i]
      const amount = item.quantity * item.unit_price
      await c.env.DB.prepare(`
        INSERT INTO purchase_order_items (po_id, item_id, item_name, category_name, quantity,
          received_quantity, accepted_quantity, rejected_quantity,
          unit, unit_price, amount, vat_included, sort_order)
        VALUES (?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?, ?, ?)
      `).bind(
        newPoId, item.item_id || null, item.item_name, item.category_name || null,
        item.quantity, item.unit || 'EA', item.unit_price, amount,
        item.vat_included !== false ? 1 : 0, i + 1
      ).run()
    }

    // 상태 이력
    await c.env.DB.prepare(`
      INSERT INTO po_status_history (po_id, from_status, to_status, changed_by, change_reason)
      VALUES (?, NULL, ?, ?, ?)
    `).bind(newPoId, status, user.id, canAutoApprove ? '빠른 발주 (자동승인)' : '빠른 발주 생성').run()

    // CONFIRMED면 매입잔액 업데이트
    if (canAutoApprove) {
      await c.env.DB.prepare(`
        UPDATE clients SET purchase_balance = COALESCE(purchase_balance, 0) + ? WHERE id = ?
      `).bind(finalAmount, body.supplier_id).run()
    }

    return c.json({
      success: true,
      data: { id: newPoId, po_number: poNumber, status, auto_approved: canAutoApprove },
      message: canAutoApprove
        ? `빠른 발주가 자동승인되어 확정되었습니다. (${poNumber})`
        : `빠른 발주가 임시저장되었습니다. 금액이 자동승인 한도를 초과합니다. (${poNumber})`
    })
  } catch (error) {
    console.error('src/routes/purchaseOrders.ts quick error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})


export default poSpecialRouter
